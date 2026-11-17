"""Inspect actual Unity frames, not a claimed render or a still-only video."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
args = parser.parse_args()
facts = json.loads((args.directory/'inspection.json').read_text())
assert facts['editor'] == '6000.3.14f1'
assert facts['frames'] == 440 and facts['framesPerSecond'] == 20
assert facts['bones'] == 74 and facts['materials'] == 3
assert 26000 <= facts['triangles'] <= 29500
assert facts['productionReady'] is False
frames = sorted(args.directory.glob('frame-*.png'))
assert len(frames) == 440
changed = []
for start, end in [(0, 159), (160, 239), (240, 439)]:
    first = Image.open(frames[start]).convert('RGB')
    middle = Image.open(frames[(start+end)//2]).convert('RGB')
    assert first.size == (960, 960)
    assert sum(ImageStat.Stat(first).stddev) > 20, 'Blank image'
    background = Image.new('RGB', first.size, first.getpixel((0, 0)))
    bounds = ImageChops.difference(first, background).getbbox()
    assert bounds and bounds[0] > 5 and bounds[1] > 5 and bounds[2] < 955 and bounds[3] < 955, 'Cropped model'
    difference = sum(ImageStat.Stat(ImageChops.difference(first, middle)).mean)
    assert difference > 0.05, 'Animation frames do not change'
    changed.append(round(difference, 4))
print(json.dumps({'result': 'PASS', 'frames': len(frames), 'fps': 20, 'seconds': 22, 'nonblank': True, 'framing': 'PASS', 'animationPixelDifferences': changed, 'productionReady': False}))
