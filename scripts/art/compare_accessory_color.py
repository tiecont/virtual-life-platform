"""Compare a color-managed accessory render with an original plate at equal height."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from compare_accessory_outline import foreground


def crop(path):
    mask, bounds = foreground(path)
    with Image.open(path) as image:
        return image.convert("RGB").crop(bounds), mask


def place(image, size, resample):
    width = max(1, round(image.width * size[1] / image.height))
    image = image.resize((width, size[1]), resample)
    canvas = Image.new(image.mode, size)
    canvas.paste(image, ((size[0] - width) // 2, 0))
    return np.asarray(canvas)


def lab(rgb):
    rgb = rgb.astype(np.float32) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    matrix = np.array([[.4124564, .3575761, .1804375], [.2126729, .7151522, .0721750],
                       [.0193339, .1191920, .9503041]], dtype=np.float32)
    xyz = (linear @ matrix.T) / [.95047, 1, 1.08883]
    k = 6 / 29
    f = np.where(xyz > k ** 3, np.cbrt(xyz), xyz / (3 * k * k) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def fractions(rgb):
    # Broad pixel colors describe the image. They are independent of material-slot names.
    hsv = np.asarray(Image.fromarray(rgb.reshape((-1, 1, 3))).convert("HSV")).reshape((-1, 3))
    hue, sat, val = hsv.T / 255
    return dict(redOrMagenta=float(np.mean(((hue < .045) | (hue > .88)) & (sat > .32) & (val > .17))),
                goldOrAmber=float(np.mean((hue >= .045) & (hue < .16) & (sat > .32) & (val > .22))),
                paleLowChroma=float(np.mean((sat <= .25) & (val >= .70))),
                nearWhite=float(np.mean(np.min(rgb, axis=1) >= 249)))


def evaluate(plate, render):
    source, source_mask = crop(plate)
    result, result_mask = crop(render)
    w = max(source.width, round(result.width * source.height / result.height))
    size = (w, source.height)
    a = place(source_mask, size, Image.Resampling.NEAREST)
    b = place(result_mask, size, Image.Resampling.NEAREST)
    both = a & b
    if both.sum() < 100:
        raise ValueError("Insufficient common foreground in the two views")
    rgb_a = place(source, size, Image.Resampling.BILINEAR)
    rgb_b = place(result, size, Image.Resampling.BILINEAR)
    diff = lab(rgb_b[both]) - lab(rgb_a[both])
    delta = np.linalg.norm(diff, axis=1)
    return dict(plate=str(plate), render=str(render), plateSha256=hashlib.sha256(plate.read_bytes()).hexdigest(),
                renderSha256=hashlib.sha256(render.read_bytes()).hexdigest(), pixelsCompared=int(both.sum()),
                silhouetteIoU=float(both.sum() / (a | b).sum()),
                deltaE76Median=float(np.median(delta)), deltaE76P90=float(np.percentile(delta, 90)),
                lightnessDifferenceMedian=float(np.median(diff[:, 0])),
                referenceFractions=fractions(rgb_a[a]), renderFractions=fractions(rgb_b[b]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plate", type=Path)
    parser.add_argument("render", type=Path)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.plate, args.render), indent=2))
