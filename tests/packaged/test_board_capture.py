from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'packaged-coop'))
from board_capture import enabled_action_frames


class EnabledActionFramesTest(unittest.TestCase):
    def scan(self, image, bounds):
        with TemporaryDirectory() as directory:
            frame = Path(directory) / 'hud.png'
            image.save(frame)
            return list(enabled_action_frames(frame, bounds))

    def test_compact_text_leaves_short_full_width_fill_spans(self):
        image = Image.new('RGB', (1024, 768), (106, 76, 81))
        draw = ImageDraw.Draw(image)
        draw.rectangle((375, 630, 508, 664), fill=(43, 34, 57))
        # Two lines of label text leave disjoint runs of visible button fill.
        for top in (633, 649):
            for x in range(392, 489, 9):
                draw.rectangle((x, top, x + 3, top + 10), fill=(251, 232, 194))
        draw.rectangle((515, 630, 648, 664), fill=(58, 45, 63))  # Disabled.
        self.assertEqual(self.scan(image, (234, 59, 556)), [(375, 630, 509, 665)])

    def test_larger_hud_keeps_adjacent_hovered_and_enabled_buttons_separate(self):
        image = Image.new('RGB', (1280, 720), (106, 76, 81))
        draw = ImageDraw.Draw(image)
        draw.rectangle((382, 588, 506, 626), fill=(75, 52, 80))
        draw.rectangle((512, 588, 637, 626), fill=(43, 34, 57))
        # A short strip matching the fill is not a button frame.
        draw.rectangle((644, 589, 767, 602), fill=(43, 34, 57))
        self.assertEqual(self.scan(image, (375, 54, 522)), [
            (382, 588, 507, 627), (512, 588, 638, 627),
        ])


if __name__ == '__main__':
    unittest.main()
