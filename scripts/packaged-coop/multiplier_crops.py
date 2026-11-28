"""Retain unscaled native cell crops for each multiplier in a committed board view."""
import json
from pathlib import Path
import sys

from PIL import Image

from board_capture import board_bounds, cell_center


def capture(frame, projection):
    state = json.loads(projection.read_text())
    board = state['state']['board']
    if len(board) != 64:
        raise ValueError('Expected an 8 by 8 board')
    bounds = board_bounds(frame)
    cell_size = (bounds[2] - 12) / 8
    crops = []
    with Image.open(frame) as image:
        for index, tile in enumerate(board):
            if tile['multiplier'] <= 1:
                continue
            x, y = cell_center(bounds, index)
            box = tuple(round(value) for value in (
                x - cell_size / 2, y - cell_size / 2, x + cell_size / 2, y + cell_size / 2))
            if box[0] < 0 or box[1] < 0 or box[2] > image.width or box[3] > image.height:
                raise ValueError(f'Multiplier cell {index} extends beyond the window')
            output = frame.with_name(f'{frame.stem}-cell-{index}.png')
            image.crop(box).save(output)
            crops.append(dict(cell=index, kind=tile['kind'], multiplier=tile['multiplier'],
                              bounds=box, file=output.name))
    return dict(version=state['version'], source=frame.name, cells=crops)


if __name__ == '__main__':
    print(json.dumps(capture(Path(sys.argv[1]), Path(sys.argv[2]))))
