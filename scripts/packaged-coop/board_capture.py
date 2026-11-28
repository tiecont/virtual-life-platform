"""Locate the native board and verify that functional tiles have rendered."""

import sys

from PIL import Image


def board_bounds(filename):
    # The frame has the same color for both rulesets. Scan its upper edge on
    # the captured player window so positions follow the actual viewport.
    with Image.open(filename) as image:
        width, height = image.size
        pixels = image.convert('RGB').load()
        center = width // 2
        for y in range(32, min(height, 240)):
            def is_edge(x):
                return pixels[x, y] == (178, 123, 76)
            if not is_edge(center) or not is_edge(center - 100) or not is_edge(center + 100):
                continue
            left, right = center, center
            while left > 0 and is_edge(left - 1):
                left -= 1
            while right < width - 1 and is_edge(right + 1):
                right += 1
            if right - left < 290:
                continue
            # Borders have 8px rounded corners. Four pixels of uncertainty at
            # the edge leave all eight click centers inside their buttons.
            side = right - left + 13
            return (left - 6, y, side)
    raise RuntimeError(f'No centered battle grid in {filename}')


def cell_center(bounds, index):
    left, top, side = bounds
    cell_size = (side - 12) / 8
    return (
        round(left + 6 + (index % 8 + .5) * cell_size),
        round(top + 6 + (index // 8 + .5) * cell_size),
    )

def populated_board(filename):
    try:
        bounds = board_bounds(filename)
    except RuntimeError:
        return None
    left, top, side = bounds
    with Image.open(filename) as frame:
        if left < 0 or left + side > frame.width or top + side > frame.height:
            return None
        for index in range(64):
            x, y = cell_center(bounds, index)
            # The pre-Start cells contain one flat background and a tiny dot.
            # Each functional icon adds texture at the center of its cell.
            if frame.crop((x - 10, y - 10, x + 10, y + 10)).getcolors(maxcolors=64) is not None:
                return None
    return bounds


if __name__ == '__main__':
    for filename in sys.argv[1:]:
        if populated_board(filename) is None:
            sys.exit(f'Expected 64 rendered functional tiles in {filename}')
