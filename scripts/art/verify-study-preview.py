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
assert facts['frames'] == 980 and facts['framesPerSecond'] == 20
assert facts['bones'] == 74 and facts['materials'] == 3
assert 26000 <= facts['triangles'] <= 29500
assert facts['productionReady'] is False
assert facts['renderMethod'] == 'SampleAnimation + BakeMesh + URP GPU render'
frames = sorted(args.directory.glob('frame-*.png'))
assert len(frames) == 980
expected = [('idle', 160), ('intro', 300), ('normal', 80), ('rage', 120), ('signature', 200), ('turntable', 120)]
assert [(s['name'], s['frames']) for s in facts['segments']] == expected
changed = []
cursor = 0
for segment in facts['segments']:
    start, end = cursor, cursor+segment['frames']-1
    assert segment['startFrame'] == start
    assert segment['cameraMoves'] is (segment['name'] == 'turntable')
    cursor = end+1
    first = Image.open(frames[start]).convert('RGB')
    middle = Image.open(frames[(start+end)//2]).convert('RGB')
    assert first.size == (960, 960)
    for index in range(start, end+1, 8):
        sample = Image.open(frames[index]).convert('RGB')
        assert sum(ImageStat.Stat(sample).stddev) > 20, 'Blank image'
        background = Image.new('RGB', sample.size, sample.getpixel((0, 0)))
        bounds = ImageChops.difference(sample, background).getbbox()
        assert bounds and bounds[0] > 5 and bounds[1] > 5 and bounds[2] < 955 and bounds[3] < 955, f'Cropped model at frame {index}'
    difference = sum(ImageStat.Stat(ImageChops.difference(first, middle)).mean)
    minimum = 0.05 if segment['name'] == 'idle' else 5
    assert difference > minimum, f'Visible animation motion missing for clip starting at {start}'
    body_difference = None
    if not segment['cameraMoves']:
        body = (260, 300, 720, 700)
        body_difference = sum(ImageStat.Stat(ImageChops.difference(first.crop(body), middle.crop(body))).mean)
        assert body_difference > minimum, f'Body animation missing for {segment["name"]}'
    changed.append({'name': segment['name'], 'full': round(difference, 4), 'body': None if body_difference is None else round(body_difference, 4)})
print(json.dumps({'result': 'PASS', 'frames': len(frames), 'fps': 20, 'seconds': 49, 'nonblank': True, 'framing': 'PASS', 'animationPixelDifferences': changed, 'productionReady': False}))
