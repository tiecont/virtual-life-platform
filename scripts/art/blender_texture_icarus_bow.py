"""Color the approved Icarus bow and its restored physical string from the original views."""
import sys
from hashlib import sha256

import bpy
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_texture_icarus_wing import AssetSpec, run


def bow_plate(chart):
    axis = chart["axis"]
    positive = chart["normalSign"] > 0
    if axis == 0:
        return (1 if positive else 2), None
    if axis == 1:
        return (0 if positive else 3), None
    # Top/bottom bevels have no orthographic original of their own.
    # Carry the color from the nearer broad face, as seen in the left/right plates.
    return (1 if chart["low"][0] + chart["high"][0] >= 0 else 2), None


def row_limits(mask, row, string_on_right):
    xs = np.flatnonzero(mask[row])
    if not len(xs):
        return None
    # The last narrow island across the wide empty opening is the physical string.
    if not string_on_right:
        xs = mask.shape[1] - 1 - xs[::-1]
    gaps = np.where(np.diff(xs) > mask.shape[1] * .025)[0]
    if len(gaps) and xs[-1] - xs[gaps[-1] + 1] < mask.shape[1] * .018:
        xs = xs[:gaps[-1] + 1]
    if not string_on_right:
        xs = mask.shape[1] - 1 - xs[::-1]
    return xs[0], xs[-1]


def register_profiles(plates, directory):
    pins = ("25e73fc9f09dcf293bc777a13f78f41d9975fbb0be8b231beaed8f7181f17573",
            "4c0c48e965f37e3903815011ac8b04de12e9bae72daf1a7e75d2bc36507e3c97")
    for index, side in enumerate(("left", "right")):
        plate = plates[index + 1]
        capture = directory / (side + "-baseline.png")
        if sha256(capture.read_bytes()).hexdigest() != pins[index]:
            raise ValueError("Expected the exact repaired, original-width neutral bow capture")
        image = bpy.data.images.load(str(capture), check_existing=False)
        image.colorspace_settings.name = "Non-Color"
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        mask = pixels.reshape(height, width, 4)[:, :, :3].max(axis=2) > .09
        bpy.data.images.remove(image)
        target = plate["rgb"].astype(np.int16)
        background = np.median(target[:, :4], axis=1)
        ref_mask = np.max(np.abs(target - background[:, None, :]), axis=2) > 20
        ys, xs = np.nonzero(mask)
        ry, _ = np.nonzero(ref_mask)
        ratio = (ry.max() - ry.min()) / (ys.max() - ys.min())
        mid = (xs.max() + xs.min()) * .5
        rows = np.tile([1., 0.], (len(target), 1))
        for y in range(int(ry.min()), int(ry.max()) + 1):
            src = row_limits(mask, round((y - ry.min()) / ratio + ys.min()), index == 0)
            dst = row_limits(ref_mask, y, index == 0)
            if src is None or dst is None:
                continue
            lo, hi = (np.array(src) - mid) * ratio + plate["pxCenter"][0]
            if hi - lo > 2 and dst[1] - dst[0] > 2:
                gain = np.clip((dst[1] - dst[0]) / (hi - lo), .5, 2.)
                rows[y] = gain, sum(dst) / 2 - gain * (lo + hi) / 2
        def register(points, table=rows):
            out = points.copy()
            gain, offset = table[np.clip(points[:, 1], 0, len(table) - 1)].T
            out[:, 0] = np.rint(points[:, 0] * gain + offset).astype(np.int32)
            return out
        plate.update(register=register, calibrationSha=pins[index])


DIRECTIONS = ((0, 1, 0), (1, 0, 0), (-1, 0, 0), (0, -1, 0))


if __name__ == "__main__":
    run(AssetSpec(
        asset="bow",
        source_sha="90619d8ee95ab34119be5a6510dad46bd21e975aed173a10982e346a66c40ce2",
        part_count=64,
        triangles=4846964,
        directions=DIRECTIONS,
        render_views=tuple(zip(("thin-front", "left", "right", "thin-back"), DIRECTIONS)),
        texture="icarus-bow-original-plate-basecolor.png",
        candidate="icarus-bow-color-review.blend",
        receipt="bow-uv-color-review.json",
        projection_for_chart=bow_plate,
        register_plates=register_profiles,
    ), sys.argv[sys.argv.index("--") + 1:])
