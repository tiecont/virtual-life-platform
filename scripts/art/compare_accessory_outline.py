"""Compare a native design plate with orthographic renders of the new clay mesh."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def silhouette(path):
    with Image.open(path) as image:
        rgba = np.asarray(image.convert("RGBA")).astype(np.int16)
    alpha = rgba[:, :, 3]
    if alpha.min() == 0:
        mask = alpha > 127
    else:
        rgb = rgba[:, :, :3]
        # The supplied design plates and studio clay renders have plain backgrounds.
        # Sample each row separately to accommodate vertical studio gradients.
        border = np.concatenate([rgb[:, :3], rgb[:, -3:]], axis=1)
        background = np.median(border, axis=1)[:, None, :]
        if np.percentile(np.max(np.abs(border - background), axis=2), 98) > 12:
            raise ValueError(f"{path}: background or edge margin unsuitable for outline comparison")
        mask = np.max(np.abs(rgb - background), axis=2) > 18
    ys, xs = np.nonzero(mask)
    if xs.size < 100 or xs.min() == 0 or xs.max() == mask.shape[1] - 1:
        raise ValueError(f"{path}: foreground is missing or touches the frame edge")
    return Image.fromarray(mask).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def compare(reference, render):
    # One scale factor, centered bounding boxes. Preserve aspect ratio and handedness.
    scale = reference.height / render.height
    width = max(1, round(render.width * scale))
    candidate = render.resize((width, reference.height), Image.Resampling.NEAREST)
    canvas_width = max(width, reference.width)
    def center(mask):
        canvas = Image.new("1", (canvas_width, reference.height))
        canvas.paste(mask, ((canvas_width - mask.width) // 2, 0))
        return np.asarray(canvas)
    expected, actual = center(reference), center(candidate)
    shared = int(np.count_nonzero(actual & expected))
    return dict(intersectionOverUnion=shared / np.count_nonzero(actual | expected),
                referenceCovered=shared / np.count_nonzero(expected),
                extraFractionOfCandidate=1 - shared / np.count_nonzero(actual),
                widthRatio=width / reference.width)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plate", type=Path)
    parser.add_argument("renders", nargs="+", type=Path)
    args = parser.parse_args()
    original = silhouette(args.plate)
    records = []
    for path in args.renders:
        records.append(dict(render=str(path), renderSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            **compare(original, silhouette(path))))
    print(json.dumps(dict(plate=str(args.plate), plateSha256=hashlib.sha256(args.plate.read_bytes()).hexdigest(),
                          method="Equal height, uniform scale, centered extents, no reflection or nonuniform warp",
                          views=records), indent=2))
