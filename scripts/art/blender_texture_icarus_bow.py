"""Color the approved Icarus bow and its restored physical string from the original views."""
import sys
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
    ), sys.argv[sys.argv.index("--") + 1:])
