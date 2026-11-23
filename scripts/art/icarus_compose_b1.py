"""Assemble the requested review sheets from native Blender renders."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "artifacts/b1"
PREVIEW = ROOT / "assets/base_templates/preview"
PANEL = "#2d343a"
PAGE = "#1e2429"
FG = "#f4f5f5"
MUTED = "#bac6cc"
ACCENT = "#90d0cb"
LINE = "#455259"
FONTS = Path("/usr/share/fonts/TTF")


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


def read_render(panel):
    path = AUDIT / "renders" / f"{panel['panel']}.png"
    with Image.open(path) as encoded:
        assert encoded.format == "PNG" and encoded.mode == "RGBA"
        encoded.verify()
    with Image.open(path) as encoded:
        image = encoded.copy()
    assert list(image.size) == panel["size_px"]
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
    assert bbox
    extrema = image.convert("L").getextrema()
    assert extrema[1] - extrema[0] >= 60
    if panel["panel"].startswith("body"):
        x0, y0, x1, y1 = bbox
        assert 0 < x0 < x1 < image.width and 0 < y0 < y1 < image.height
    panel["foreground_bbox_px_at_alpha_128"] = list(bbox)
    panel["foreground_coverage_fraction"] = sum(alpha.histogram()[128:]) / (image.width * image.height)
    panel["raw_png_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    return image


def save_sheet(filename, title, details, panels, footer, projection=None):
    margin, gap, top, caption = 36, 18, 122, 50
    panel_width, panel_height = panels[0][1].size
    size = (2 * margin + len(panels) * panel_width + (len(panels) - 1) * gap,
            top + panel_height + caption + 63)
    sheet = Image.new("RGB", size, PAGE)
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 22), "B1  /  ANIME FEMALE BASE", font=font(17, True), fill=ACCENT)
    draw.text((margin, 54), title, font=font(38, True), fill=FG)
    draw.text((size[0] - margin, 79), details, font=font(18), fill=MUTED, anchor="ra")
    for index, (label, image) in enumerate(panels):
        x = margin + index * (panel_width + gap)
        draw.rectangle((x, top, x + panel_width - 1, top + panel_height - 1), fill=PANEL)
        if projection is not None:
            project = projection[index]
            crown = round(top + panel_height * (1 - project["max"][1]))
            ground = round(top + panel_height * (1 - project["min"][1]))
            draw.line((x + 20, ground, x + panel_width - 20, ground), fill=LINE, width=1)
            if index == 0:
                draw.line((x + 43, crown, x + 43, ground), fill=LINE)
                for y, tick in ((crown, "1.68 m"), (ground, "0.00 m")):
                    draw.line((x + 39, y, x + 48, y), fill=ACCENT)
                    draw.text((x + 55, y - 8), tick, font=font(13), fill=MUTED)
        sheet.paste(image, (x, top), image)
        baseline = top + panel_height + caption
        draw.text((x, baseline - 37), label, font=font(23, True), fill=FG)
        draw.line((x, baseline, x + panel_width - 1, baseline), fill=LINE)
    draw.text((margin, size[1] - 37), footer, font=font(18), fill=MUTED)
    path = PREVIEW / filename
    sheet.save(path, optimize=True)
    with Image.open(path) as encoded:
        assert encoded.format == "PNG"
        encoded.verify()
    with Image.open(path) as encoded:
        assert encoded.size == sheet.size and not ImageChops.difference(sheet, encoded).getbbox()
    return {"path": str(path.relative_to(ROOT)), "size_px": list(size),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    facts = json.loads((AUDIT / "reopen.json").read_text())
    renders = {panel["panel"]: read_render(panel) for panel in facts["render_panels"]}
    assert len({renders[name].tobytes() for name in ("head_clay", "head_wire", "head_uv")}) == 3
    assert renders["body_front"].tobytes() != renders["body_side"].tobytes()
    projections = facts["full_body_projection"]
    outputs = [
        save_sheet(
            "B1_face_gray_and_textured.png", "Face diagnostics", "Orthographic front  /  Shared framing",
            [("Gray clay", renders["head_clay"]), ("Original polygon wire", renders["head_wire"]),
             ("Diagnostic UV checker", renders["head_uv"])],
            "Procedural 24-cell checker sampled from the imported UVMap",
        ),
        save_sheet(
            "B1_fullbody_front_and_side.png", "Full body", "Orthographic  /  Shared scale",
            [("Front  /  -Y", renders["body_front"]), ("Side  /  +X", renders["body_side"])],
            "1.68 m nominal height  /  Ground plane Z = 0 m",
            [projections["body_front"], projections["body_side"]],
        ),
    ]
    assert {path.name for path in PREVIEW.glob("B1_*.png")} == {Path(output["path"]).name for output in outputs}
    (AUDIT / "render-verification.json").write_text(json.dumps({
        "status": "PASS",
        "panels": facts["render_panels"],
        "final_pngs": outputs,
    }, indent=2) + "\n")


if __name__ == "__main__":
    PREVIEW.mkdir(parents=True, exist_ok=True)
    main()
