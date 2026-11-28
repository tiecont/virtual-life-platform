#!/usr/bin/env python3
"""
Produce Aetheria: SoulBound Wave D4 reference-faithful 2D UI, functional jewel,
element/race/rarity, 4-resource wallet, artifact/item/skill icon kit, and
side-by-side comparison sheets from the owner's cinematic kit (R01-R05).

Outputs:
- Private HD masters & provenance manifest:
    /home/tiecont/Projects/Aetheria-Workspace/wave-d4-ui-kit/
- Unity runtime resources (atlases, icons, 9-slice frames, map cards, portraits):
    apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/FunctionalTiles/
    apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/
- Public-safe visual comparison & mapping sheets:
    assets/review/wave-d4/design-system/
"""
from __future__ import annotations

import hashlib
import json
import math
import pathlib
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

REPO_ROOT = pathlib.Path("/home/tiecont/Projects/Aetheria")
KIT_ROOT = pathlib.Path("/home/tiecont/Downloads/aetheria-soulbound-cinematic-kit (1)/aetheria-soulbound-cinematic-kit")
WORKSPACE_OUT = pathlib.Path("/home/tiecont/Projects/Aetheria-Workspace/wave-d4-ui-kit")
UNITY_RES = REPO_ROOT / "apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources"
FUNC_TILES_DIR = UNITY_RES / "FunctionalTiles"
WAVED4_RES_DIR = UNITY_RES / "WaveD4"
REVIEW_OUT = REPO_ROOT / "assets/review/wave-d4/design-system"


def sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        [
            "/usr/share/fonts/noto/NotoSans-Bold.ttf",
            "/usr/share/fonts/noto/NotoSerif-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        ]
        if bold
        else [
            "/usr/share/fonts/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/noto/NotoSerif-Regular.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
        ]
    )
    for c in candidates:
        p = pathlib.Path(c)
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
    )


def make_cushion_base(
    size: int,
    top_col: tuple[int, int, int],
    bot_col: tuple[int, int, int],
    rim_col: tuple[int, int, int],
    shape: str = "cushion",
) -> Image.Image:
    """Create high-res glossy R04-faithful rounded cushion/medallion jewel base."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.07)
    box = (pad, pad, size - pad, size - pad)
    radius = int(size * (0.44 if shape == "circle" else 0.28))

    # Drop shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    s_off = int(size * 0.025)
    sd.rounded_rectangle(
        (box[0] + s_off, box[1] + s_off * 2, box[2] + s_off, box[3] + s_off * 2),
        radius=radius,
        fill=(12, 10, 28, 155),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.03))
    img.alpha_composite(shadow)

    # Outer rim mask
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(box, radius=radius, fill=255)

    # Vertical gradient + subtle radial glow
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gp = grad.load()
    cx, cy = size * 0.5, size * 0.38
    max_r = size * 0.52
    for y in range(box[1], box[3]):
        vt = (y - box[1]) / max(1, (box[3] - box[1]))
        base_c = lerp_color(top_col, bot_col, vt)
        for x in range(box[0], box[2]):
            dist = math.hypot(x - cx, y - cy) / max_r
            glow = max(0.0, 1.0 - dist * 0.85)
            c = lerp_color(base_c, (255, 255, 255), glow * 0.22)
            gp[x, y] = (*c, 255)
    img = Image.composite(grad, img, mask)

    # Bevel inner ring & rim outline
    rim_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim_layer)
    rd.rounded_rectangle(box, radius=radius, outline=(*rim_col, 240), width=max(3, size // 42))
    inset = pad + max(4, size // 30)
    rd.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=max(8, radius - max(4, size // 30)),
        outline=(255, 255, 255, 95),
        width=max(2, size // 72),
    )
    # Glossy top-left crescent highlight matching R04 jewels
    hl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse(
        (int(size * 0.18), int(size * 0.11), int(size * 0.82), int(size * 0.46)),
        fill=(255, 255, 255, 78),
    )
    hd.ellipse(
        (int(size * 0.21), int(size * 0.14), int(size * 0.42), int(size * 0.27)),
        fill=(255, 255, 255, 135),
    )
    hl = hl.filter(ImageFilter.GaussianBlur(radius=size * 0.022))
    # Clip highlight inside cushion
    hl_masked = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hl_masked.paste(hl, (0, 0), mask)
    img.alpha_composite(hl_masked)
    img.alpha_composite(rim_layer)
    return img


def draw_emblem_with_shadow(
    base: Image.Image,
    draw_fn,
    fill_top: tuple[int, int, int],
    fill_bot: tuple[int, int, int],
    outline_col: tuple[int, int, int, int],
    outline_w: int,
) -> Image.Image:
    size = base.width
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    draw_fn(md, 255)

    # Dark warm drop shadow under symbol
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sh_mask = ImageChops.offset(mask, int(size * 0.012), int(size * 0.022)).filter(
        ImageFilter.GaussianBlur(radius=size * 0.018)
    )
    sh.paste((25, 12, 8, 155), (0, 0), sh_mask)
    out = base.copy()
    out.alpha_composite(sh)

    # Gradient fill for symbol
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gp = grad.load()
    for y in range(size):
        t = max(0.0, min(1.0, (y - size * 0.18) / (size * 0.64)))
        c = lerp_color(fill_top, fill_bot, t)
        for x in range(size):
            gp[x, y] = (*c, 255)

    # Expand mask slightly for crisp dark/gold outline
    dilated = mask.filter(ImageFilter.MaxFilter(outline_w * 2 + 1))
    outline_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    outline_img.paste(outline_col, (0, 0), dilated)
    out.alpha_composite(outline_img)

    sym_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sym_img.paste(grad, (0, 0), mask)
    # Inner specular highlight at top of emblem
    eroded = mask.filter(ImageFilter.MinFilter(5))
    spec = Image.new("RGBA", (size, size), (255, 255, 255, 80))
    spec_mask = ImageChops.subtract(mask, ImageChops.offset(eroded, 0, int(size * 0.02)))
    sym_img.alpha_composite(Image.composite(spec, Image.new("RGBA", (size, size), (0, 0, 0, 0)), spec_mask))
    out.alpha_composite(sym_img)
    return out


def make_r04_jewel(kind: str, size: int = 256) -> Image.Image:
    s = size
    ow = max(2, s // 64)
    if kind == "sword":
        # R04 Attack mapping: Golden cushion + bold radiant lightning bolt
        base = make_cushion_base(s, (255, 212, 94), (218, 134, 28), (255, 236, 158), "cushion")
        pts = [
            (s * 0.57, s * 0.17),
            (s * 0.31, s * 0.53),
            (s * 0.48, s * 0.53),
            (s * 0.40, s * 0.83),
            (s * 0.69, s * 0.45),
            (s * 0.52, s * 0.45),
        ]
        return draw_emblem_with_shadow(
            base,
            lambda d, v: d.polygon(pts, fill=v),
            (255, 253, 210),
            (255, 196, 46),
            (148, 78, 10, 235),
            ow,
        )
    if kind == "mana":
        # R04 Mana mapping: Azure circle/cushion + glossy water droplet
        base = make_cushion_base(s, (78, 184, 255), (24, 96, 214), (168, 228, 255), "circle")

        def drop_fn(d: ImageDraw.ImageDraw, v: int):
            pts = []
            # Teardrop curve
            for i in range(60):
                ang = math.pi * 2 * i / 60
                # Parametric teardrop
                x = s * 0.50 + s * 0.21 * math.sin(ang) * (0.78 + 0.28 * math.cos(ang - math.pi / 2))
                y = s * 0.55 - s * 0.30 * math.cos(ang)
                pts.append((x, y))
            d.polygon(pts, fill=v)
            d.polygon([(s * 0.50, s * 0.21), (s * 0.35, s * 0.51), (s * 0.65, s * 0.51)], fill=v)
            d.ellipse((s * 0.32, s * 0.40, s * 0.68, s * 0.78), fill=v)

        img = draw_emblem_with_shadow(
            base, drop_fn, (224, 250, 255), (82, 192, 255), (14, 58, 148, 235), ow
        )
        hd = ImageDraw.Draw(img)
        hd.ellipse((s * 0.39, s * 0.52, s * 0.47, s * 0.66), fill=(255, 255, 255, 195))
        return img
    if kind == "rage":
        # R04 Rage mapping: Crimson-coral circle/cushion + roaring inner flame
        base = make_cushion_base(s, (246, 98, 72), (182, 34, 30), (255, 176, 132), "circle")

        def flame_fn(d: ImageDraw.ImageDraw, v: int):
            outer = [
                (s * 0.51, s * 0.19),
                (s * 0.63, s * 0.35),
                (s * 0.61, s * 0.45),
                (s * 0.70, s * 0.37),
                (s * 0.72, s * 0.56),
                (s * 0.64, s * 0.73),
                (s * 0.50, s * 0.80),
                (s * 0.35, s * 0.73),
                (s * 0.29, s * 0.55),
                (s * 0.35, s * 0.39),
                (s * 0.41, s * 0.46),
            ]
            d.polygon(outer, fill=v)
            d.ellipse((s * 0.33, s * 0.46, s * 0.67, s * 0.80), fill=v)

        img = draw_emblem_with_shadow(
            base, flame_fn, (255, 242, 142), (255, 126, 36), (122, 18, 14, 235), ow
        )
        # Inner bright flame tongue
        idraw = ImageDraw.Draw(img)
        idraw.ellipse((s * 0.42, s * 0.55, s * 0.58, s * 0.77), fill=(255, 248, 196, 225))
        return img
    if kind == "heart":
        # R04 Heart mapping: Rose-pink cushion + plump glossy heart
        base = make_cushion_base(s, (252, 142, 202), (208, 66, 144), (255, 204, 234), "cushion")

        def heart_fn(d: ImageDraw.ImageDraw, v: int):
            pts = []
            for i in range(90):
                t = math.pi * 2 * i / 90
                hx = 16 * (math.sin(t) ** 3)
                hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
                pts.append((s * 0.50 + hx * s * 0.0155, s * 0.49 - hy * s * 0.0155))
            d.polygon(pts, fill=v)

        img = draw_emblem_with_shadow(
            base, heart_fn, (255, 224, 242), (255, 118, 184), (146, 28, 92, 235), ow
        )
        hd = ImageDraw.Draw(img)
        hd.ellipse((s * 0.34, s * 0.33, s * 0.44, s * 0.43), fill=(255, 255, 255, 185))
        return img
    if kind == "shield":
        # R04 Shield mapping: Royal cobalt cushion + silver-bordered crest shield
        base = make_cushion_base(s, (72, 138, 248), (28, 68, 178), (168, 212, 255), "cushion")

        def shield_fn(d: ImageDraw.ImageDraw, v: int):
            pts = [
                (s * 0.50, s * 0.20),
                (s * 0.73, s * 0.27),
                (s * 0.70, s * 0.56),
                (s * 0.50, s * 0.80),
                (s * 0.30, s * 0.56),
                (s * 0.27, s * 0.27),
            ]
            d.polygon(pts, fill=v)

        img = draw_emblem_with_shadow(
            base, shield_fn, (238, 248, 255), (146, 198, 255), (16, 42, 118, 240), ow + 1
        )
        # Inner split royal blue shield face matching R04
        inner = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        idraw = ImageDraw.Draw(inner)
        idraw.polygon(
            [(s * 0.50, s * 0.27), (s * 0.66, s * 0.32), (s * 0.64, s * 0.54), (s * 0.50, s * 0.72)],
            fill=(42, 122, 234, 245),
        )
        idraw.polygon(
            [(s * 0.50, s * 0.27), (s * 0.34, s * 0.32), (s * 0.36, s * 0.54), (s * 0.50, s * 0.72)],
            fill=(88, 174, 255, 245),
        )
        img.alpha_composite(inner)
        return img
    if kind == "special":
        # R04 Special / SoulBound mapping: Honey-gold cushion + creamy 4-toe paw emblem
        base = make_cushion_base(s, (248, 196, 88), (198, 122, 28), (255, 228, 152), "cushion")

        def paw_fn(d: ImageDraw.ImageDraw, v: int):
            # Main pad
            d.ellipse((s * 0.33, s * 0.47, s * 0.67, s * 0.76), fill=v)
            # 4 toes matching R04
            for tx, ty, rx, ry in [
                (0.30, 0.40, 0.065, 0.085),
                (0.43, 0.31, 0.068, 0.090),
                (0.57, 0.31, 0.068, 0.090),
                (0.70, 0.40, 0.065, 0.085),
            ]:
                d.ellipse(
                    (s * (tx - rx), s * (ty - ry), s * (tx + rx), s * (ty + ry)),
                    fill=v,
                )

        return draw_emblem_with_shadow(
            base, paw_fn, (255, 252, 238), (255, 232, 182), (138, 76, 14, 235), ow
        )
    if kind == "wood_leaf":
        base = make_cushion_base(s, (124, 214, 88), (52, 138, 42), (194, 246, 156), "cushion")

        def leaf_fn(d: ImageDraw.ImageDraw, v: int):
            pts = [(s * 0.68, s * 0.24), (s * 0.66, s * 0.58), (s * 0.48, s * 0.74), (s * 0.30, s * 0.62), (s * 0.38, s * 0.34)]
            d.polygon(pts, fill=v)

        return draw_emblem_with_shadow(base, leaf_fn, (226, 255, 186), (134, 224, 88), (26, 86, 22, 235), ow)
    if kind == "ice_snowflake":
        base = make_cushion_base(s, (118, 198, 255), (52, 118, 218), (198, 236, 255), "cushion")

        def snow_fn(d: ImageDraw.ImageDraw, v: int):
            cx, cy = s * 0.5, s * 0.5
            for k in range(6):
                ang = math.pi * k / 3.0
                ex, ey = cx + math.cos(ang) * s * 0.28, cy + math.sin(ang) * s * 0.28
                d.line((cx, cy, ex, ey), fill=v, width=max(6, s // 26))
                bx, by = cx + math.cos(ang) * s * 0.17, cy + math.sin(ang) * s * 0.17
                for side in (-0.55, 0.55):
                    tx = bx + math.cos(ang + side) * s * 0.09
                    ty = by + math.sin(ang + side) * s * 0.09
                    d.line((bx, by, tx, ty), fill=v, width=max(4, s // 36))

        return draw_emblem_with_shadow(base, snow_fn, (255, 255, 255), (206, 238, 255), (24, 68, 148, 235), ow)
    if kind == "light_star":
        base = make_cushion_base(s, (186, 118, 248), (114, 54, 196), (228, 186, 255), "cushion")

        def star_fn(d: ImageDraw.ImageDraw, v: int):
            pts = []
            for k in range(8):
                ang = -math.pi / 2 + k * math.pi / 4
                r = s * (0.30 if k % 2 == 0 else 0.10)
                pts.append((s * 0.5 + math.cos(ang) * r, s * 0.5 + math.sin(ang) * r))
            d.polygon(pts, fill=v)

        return draw_emblem_with_shadow(base, star_fn, (255, 236, 255), (226, 168, 255), (68, 24, 128, 235), ow)
    raise ValueError(f"Unknown jewel kind: {kind}")


def make_multiplier_badge(mult: int, size: int = 128) -> Image.Image:
    """Create crisp R04-styled golden fantasy multiplier badge x2..x8."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tier_colors = {
        2: ((58, 72, 138), (246, 214, 118)),
        3: ((46, 108, 132), (168, 242, 255)),
        4: ((98, 56, 152), (236, 192, 255)),
        5: ((156, 68, 42), (255, 214, 132)),
        6: ((178, 44, 78), (255, 206, 224)),
        7: ((168, 108, 22), (255, 244, 162)),
        8: ((196, 38, 38), (255, 248, 178)),
    }
    bg, border = tier_colors.get(mult, ((58, 72, 138), (246, 214, 118)))
    pad = int(size * 0.12)
    d.rounded_rectangle(
        (pad, int(size * 0.24), size - pad, int(size * 0.76)),
        radius=int(size * 0.18),
        fill=(*bg, 242),
        outline=(*border, 255),
        width=max(3, size // 28),
    )
    font = load_font(int(size * 0.34), bold=True)
    txt = f"×{mult}"
    tb = d.textbbox((0, 0), txt, font=font)
    tx = (size - (tb[2] - tb[0])) / 2 - tb[0]
    ty = (size - (tb[3] - tb[1])) / 2 - tb[1]
    d.text((tx + 2, ty + 2), txt, font=font, fill=(14, 8, 22, 220))
    d.text((tx, ty), txt, font=font, fill=(255, 250, 228, 255))
    return img


def make_currency_icon(kind: str, size: int = 256) -> Image.Image:
    """Create the 4 R02 wallet icons: energy, premium_diamond, coin, luminous_stone."""
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == "energy":
        pts = [
            (s * 0.58, s * 0.08),
            (s * 0.24, s * 0.54),
            (s * 0.47, s * 0.54),
            (s * 0.36, s * 0.92),
            (s * 0.76, s * 0.42),
            (s * 0.53, s * 0.42),
        ]
        return draw_emblem_with_shadow(
            img,
            lambda md, v: md.polygon(pts, fill=v),
            (255, 252, 182),
            (248, 174, 28),
            (116, 62, 8, 245),
            max(4, s // 42),
        )
    if kind == "premium_diamond":
        # Pale luminous 4-point star crystal (R02 slot 2)
        pts = [
            (s * 0.50, s * 0.08),
            (s * 0.64, s * 0.36),
            (s * 0.92, s * 0.50),
            (s * 0.64, s * 0.64),
            (s * 0.50, s * 0.92),
            (s * 0.36, s * 0.64),
            (s * 0.08, s * 0.50),
            (s * 0.36, s * 0.36),
        ]
        out = draw_emblem_with_shadow(
            img,
            lambda md, v: md.polygon(pts, fill=v),
            (245, 252, 255),
            (156, 218, 255),
            (46, 88, 168, 240),
            max(4, s // 44),
        )
        # Iridescent facets
        fd = ImageDraw.Draw(out)
        fd.polygon([(s * 0.5, s * 0.12), (s * 0.62, s * 0.38), (s * 0.5, s * 0.5)], fill=(255, 255, 255, 175))
        fd.polygon([(s * 0.5, s * 0.5), (s * 0.88, s * 0.5), (s * 0.62, s * 0.62)], fill=(118, 196, 255, 175))
        fd.polygon([(s * 0.5, s * 0.5), (s * 0.38, s * 0.62), (s * 0.5, s * 0.88)], fill=(228, 186, 255, 160))
        return out
    if kind == "coin":
        # Embossed gold Coin with 5-point star emblem (R02 slot 3)
        base = make_cushion_base(s, (255, 224, 108), (208, 138, 24), (255, 244, 176), "circle")
        cd = ImageDraw.Draw(base)
        cd.ellipse((s * 0.19, s * 0.19, s * 0.81, s * 0.81), outline=(168, 98, 14, 215), width=max(4, s // 36))
        pts = []
        for k in range(10):
            ang = -math.pi / 2 + k * math.pi / 5
            r = s * (0.22 if k % 2 == 0 else 0.10)
            pts.append((s * 0.5 + math.cos(ang) * r, s * 0.5 + math.sin(ang) * r))
        cd.polygon(pts, fill=(255, 246, 192, 245), outline=(154, 88, 12, 220))
        return base
    if kind == "luminous_stone":
        # Distinct tilted faceted rose-violet prism crystal (R02 slot 4 — unmistakable vs pale 4-point diamond!)
        pts = [
            (s * 0.58, s * 0.10),
            (s * 0.82, s * 0.34),
            (s * 0.72, s * 0.78),
            (s * 0.42, s * 0.90),
            (s * 0.18, s * 0.64),
            (s * 0.28, s * 0.22),
        ]
        out = draw_emblem_with_shadow(
            img,
            lambda md, v: md.polygon(pts, fill=v),
            (255, 198, 246),
            (186, 78, 228),
            (78, 28, 124, 245),
            max(4, s // 44),
        )
        fd = ImageDraw.Draw(out)
        fd.polygon([(s * 0.58, s * 0.13), (s * 0.79, s * 0.35), (s * 0.52, s * 0.48), (s * 0.31, s * 0.24)], fill=(255, 232, 252, 165))
        fd.polygon([(s * 0.52, s * 0.48), (s * 0.79, s * 0.35), (s * 0.69, s * 0.75)], fill=(246, 112, 214, 175))
        fd.polygon([(s * 0.19, s * 0.63), (s * 0.52, s * 0.48), (s * 0.42, s * 0.87)], fill=(104, 196, 255, 155))
        return out
    raise ValueError(kind)


def make_element_medallion(element: str, size: int = 192) -> Image.Image:
    """Create R01 glossy circular element medallions with gold ring border."""
    palettes = {
        "fire": ((248, 106, 64), (178, 32, 24)),
        "water": ((68, 178, 255), (22, 88, 208)),
        "electric": ((252, 208, 68), (196, 122, 18)),
        "ghost": ((188, 124, 246), (104, 52, 182)),
        "ground": ((214, 156, 98), (128, 78, 38)),
        "light": ((255, 224, 92), (208, 138, 24)),
    }
    top_c, bot_c = palettes[element]
    base = make_cushion_base(size, top_c, bot_c, (244, 212, 136), "circle")
    s = size
    ow = max(2, s // 56)
    if element == "fire":
        return make_r04_jewel("rage", size)
    if element == "water":
        return make_r04_jewel("mana", size)
    if element == "electric":
        pts = [(s * 0.57, s * 0.17), (s * 0.32, s * 0.53), (s * 0.49, s * 0.53), (s * 0.41, s * 0.83), (s * 0.68, s * 0.45), (s * 0.52, s * 0.45)]
        return draw_emblem_with_shadow(base, lambda d, v: d.polygon(pts, fill=v), (255, 255, 214), (255, 204, 52), (124, 68, 8, 235), ow)
    if element == "ghost":
        def ghost_fn(d: ImageDraw.ImageDraw, v: int):
            d.ellipse((s * 0.30, s * 0.24, s * 0.70, s * 0.64), fill=v)
            d.polygon([(s * 0.30, s * 0.44), (s * 0.70, s * 0.44), (s * 0.73, s * 0.76), (s * 0.60, s * 0.68), (s * 0.50, s * 0.78), (s * 0.40, s * 0.68), (s * 0.27, s * 0.76)], fill=v)

        img = draw_emblem_with_shadow(base, ghost_fn, (252, 246, 255), (224, 198, 255), (68, 28, 122, 235), ow)
        gd = ImageDraw.Draw(img)
        gd.ellipse((s * 0.40, s * 0.39, s * 0.46, s * 0.47), fill=(48, 24, 88, 245))
        gd.ellipse((s * 0.54, s * 0.39, s * 0.60, s * 0.47), fill=(48, 24, 88, 245))
        return img
    if element == "ground":
        def rock_fn(d: ImageDraw.ImageDraw, v: int):
            d.polygon([(s * 0.50, s * 0.24), (s * 0.74, s * 0.68), (s * 0.26, s * 0.68)], fill=v)
            d.polygon([(s * 0.33, s * 0.42), (s * 0.52, s * 0.72), (s * 0.20, s * 0.72)], fill=v)
            d.polygon([(s * 0.66, s * 0.44), (s * 0.80, s * 0.72), (s * 0.48, s * 0.72)], fill=v)

        return draw_emblem_with_shadow(base, rock_fn, (248, 214, 168), (186, 128, 72), (88, 48, 18, 235), ow)
    if element == "light":
        def sun_fn(d: ImageDraw.ImageDraw, v: int):
            for k in range(8):
                ang = k * math.pi / 4
                p1 = (s * 0.5 + math.cos(ang) * s * 0.34, s * 0.5 + math.sin(ang) * s * 0.34)
                p2 = (s * 0.5 + math.cos(ang - 0.22) * s * 0.19, s * 0.5 + math.sin(ang - 0.22) * s * 0.19)
                p3 = (s * 0.5 + math.cos(ang + 0.22) * s * 0.19, s * 0.5 + math.sin(ang + 0.22) * s * 0.19)
                d.polygon([p1, p2, p3], fill=v)
            d.ellipse((s * 0.33, s * 0.33, s * 0.67, s * 0.67), fill=v)

        return draw_emblem_with_shadow(base, sun_fn, (255, 254, 218), (255, 198, 56), (138, 78, 12, 235), ow)
    raise ValueError(element)


def make_rarity_badge(rank: str, size: int = 192) -> Image.Image:
    """Create R01 octagonal faceted rarity shields: B, A, S, Limited."""
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    styles = {
        "B": ((142, 162, 188), (82, 98, 124), (218, 230, 246), "B"),
        "A": ((188, 124, 244), (106, 54, 178), (238, 206, 255), "A"),
        "S": ((252, 212, 98), (188, 118, 24), (255, 244, 186), "S"),
        "LIMITED": ((168, 92, 248), (78, 36, 158), (255, 224, 128), "S+"),
    }
    top_c, bot_c, rim_c, label = styles[rank]
    pts = []
    for k in range(8):
        ang = -math.pi / 2 + k * math.pi / 4
        r = s * 0.42
        pts.append((s * 0.5 + math.cos(ang) * r, s * 0.5 + math.sin(ang) * r))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gp = grad.load()
    for y in range(s):
        c = lerp_color(top_c, bot_c, y / max(1, s))
        for x in range(s):
            gp[x, y] = (*c, 255)
    img = Image.composite(grad, img, mask)
    d = ImageDraw.Draw(img)
    d.polygon(pts, outline=(*rim_c, 255), width=max(4, s // 30))
    font = load_font(int(s * (0.34 if len(label) > 1 else 0.44)), bold=True)
    tb = d.textbbox((0, 0), label, font=font)
    tx = (s - (tb[2] - tb[0])) / 2 - tb[0]
    ty = (s - (tb[3] - tb[1])) / 2 - tb[1]
    d.text((tx + 2, ty + 3), label, font=font, fill=(22, 12, 38, 210))
    d.text((tx, ty), label, font=font, fill=(255, 252, 240, 255))
    return img


def make_artifact_or_item_icon(item_id: str, size: int = 192) -> Image.Image:
    """Create fantasy item artwork for Core, Aegis, Rune, Upgrade Crystal, Skill Tome, EXP Scroll."""
    s = size
    configs = {
        "artifact_core": ((252, 132, 76), (168, 38, 34), (255, 218, 138), "diamond"),
        "artifact_aegis": ((88, 168, 252), (32, 76, 184), (218, 238, 255), "shield"),
        "artifact_rune": ((186, 118, 248), (92, 42, 168), (242, 208, 255), "rune"),
        "material_essence": ((98, 224, 248), (32, 124, 196), (214, 252, 255), "crystal"),
        "skill_tome": ((156, 108, 238), (74, 42, 148), (248, 216, 142), "book"),
        "exp_scroll": ((124, 218, 148), (44, 128, 78), (238, 255, 214), "scroll"),
    }
    top_c, bot_c, rim_c, glyph = configs[item_id]
    base = make_cushion_base(s, top_c, bot_c, rim_c, "cushion")
    ow = max(2, s // 56)
    if glyph == "diamond":
        pts = [(s * 0.5, s * 0.20), (s * 0.74, s * 0.50), (s * 0.5, s * 0.80), (s * 0.26, s * 0.50)]
        return draw_emblem_with_shadow(base, lambda d, v: d.polygon(pts, fill=v), (255, 248, 198), (255, 164, 68), (118, 24, 18, 235), ow)
    if glyph == "shield":
        return make_r04_jewel("shield", s)
    if glyph == "rune":
        def rune_fn(d: ImageDraw.ImageDraw, v: int):
            d.ellipse((s * 0.26, s * 0.26, s * 0.74, s * 0.74), outline=v, width=max(6, s // 22))
            pts = [(s * 0.5, s * 0.24), (s * 0.68, s * 0.62), (s * 0.32, s * 0.62)]
            d.polygon(pts, outline=v, width=max(5, s // 26))

        return draw_emblem_with_shadow(base, rune_fn, (255, 244, 214), (234, 184, 255), (58, 22, 112, 235), ow)
    if glyph == "crystal":
        pts = [(s * 0.5, s * 0.18), (s * 0.69, s * 0.38), (s * 0.63, s * 0.78), (s * 0.37, s * 0.78), (s * 0.31, s * 0.38)]
        return draw_emblem_with_shadow(base, lambda d, v: d.polygon(pts, fill=v), (238, 255, 255), (124, 226, 255), (18, 68, 128, 235), ow)
    if glyph == "book":
        def book_fn(d: ImageDraw.ImageDraw, v: int):
            d.rounded_rectangle((s * 0.28, s * 0.24, s * 0.72, s * 0.76), radius=int(s * 0.06), fill=v)

        img = draw_emblem_with_shadow(base, book_fn, (255, 242, 196), (236, 188, 92), (56, 24, 98, 235), ow)
        bd = ImageDraw.Draw(img)
        bd.rectangle((s * 0.33, s * 0.28, s * 0.67, s * 0.71), fill=(98, 56, 178, 245))
        bd.ellipse((s * 0.43, s * 0.41, s * 0.57, s * 0.55), fill=(255, 234, 152, 245))
        return img
    if glyph == "scroll":
        def scr_fn(d: ImageDraw.ImageDraw, v: int):
            d.rounded_rectangle((s * 0.30, s * 0.24, s * 0.70, s * 0.76), radius=int(s * 0.08), fill=v)

        return draw_emblem_with_shadow(base, scr_fn, (255, 252, 228), (228, 246, 196), (28, 86, 48, 235), ow)
    raise ValueError(item_id)


def make_ornamental_frame(kind: str, size: tuple[int, int] = (256, 256)) -> Image.Image:
    """Create 9-sliceable R01/R04/R05 fantasy panel frames (gold_board, ivory_card, royal_header, cta_gold, cta_violet)."""
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == "gold_board":
        # Deep indigo-velvet board interior + rich R04 warm-gold border (outer RGB(178,123,76) ring preserved for test_board_capture compatibility + luminous gold inner bevel!)
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=18, fill=(28, 30, 58, 248), outline=(178, 123, 76, 255), width=4)
        d.rounded_rectangle((4, 4, w - 5, h - 5), radius=15, outline=(246, 212, 132, 255), width=3)
        d.rounded_rectangle((9, 9, w - 10, h - 10), radius=11, outline=(122, 86, 52, 220), width=2)
        # Corner diamond filigree accents
        for cx, cy in [(14, 14), (w - 15, 14), (14, h - 15), (w - 15, h - 15)]:
            d.polygon([(cx, cy - 7), (cx + 7, cy), (cx, cy + 7), (cx - 7, cy)], fill=(255, 236, 168, 255), outline=(146, 94, 34, 255))
        return img
    if kind == "ivory_card":
        # R01 / R05 warm ivory-lilac parchment surface with gold border
        grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        gp = grad.load()
        for y in range(h):
            c = lerp_color((252, 247, 242), (238, 229, 248), y / max(1, h - 1))
            for x in range(w):
                gp[x, y] = (*c, 246)
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=20, fill=255)
        img = Image.composite(grad, img, mask)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=20, outline=(218, 176, 102, 255), width=3)
        d.rounded_rectangle((5, 5, w - 6, h - 6), radius=16, outline=(255, 255, 255, 190), width=2)
        return img
    if kind == "royal_header":
        # R01 / R02 / R04 deep royal blue-violet navigation ribbon with warm gold frame
        grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        gp = grad.load()
        for y in range(h):
            c = lerp_color((64, 58, 126), (36, 38, 86), y / max(1, h - 1))
            for x in range(w):
                gp[x, y] = (*c, 244)
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=18, fill=255)
        img = Image.composite(grad, img, mask)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=18, outline=(238, 198, 116, 255), width=3)
        return img
    if kind == "cta_blue_gold":
        # R04 "Kết thúc lượt >>" / R02 primary luminous sky-sapphire button in gold bezel
        grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        gp = grad.load()
        for y in range(h):
            c = lerp_color((74, 168, 248), (32, 98, 206), y / max(1, h - 1))
            for x in range(w):
                gp[x, y] = (*c, 252)
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=22, fill=255)
        img = Image.composite(grad, img, mask)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=22, outline=(248, 214, 128, 255), width=4)
        return img
    raise ValueError(kind)


def build_functional_atlas(jewels_256: dict[str, Image.Image]) -> Image.Image:
    """Pack 6 functional jewels into the exact 512x256 Sprite layout expected by FunctionalGems.png.meta."""
    atlas = Image.new("RGBA", (512, 256), (0, 0, 0, 0))
    # Top row (y=0 in PIL == y=128 in Unity): sword, mana, rage, heart
    for idx, k in enumerate(["sword", "mana", "rage", "heart"]):
        tile = jewels_256[k].resize((128, 128), Image.Resampling.LANCZOS)
        atlas.paste(tile, (idx * 128, 0))
    # Bottom row (y=128 in PIL == y=0 in Unity): shield, special
    for idx, k in enumerate(["shield", "special"]):
        tile = jewels_256[k].resize((128, 128), Image.Resampling.LANCZOS)
        atlas.paste(tile, (idx * 128, 128))
    return atlas


def build_gem_mapping_and_state_sheet(
    jewels_256: dict[str, Image.Image],
    mult_badges: dict[int, Image.Image],
    r04_board_crop: Image.Image,
) -> Image.Image:
    """Create the O-A06 / O-A07 / O-A10 visual mapping, state, x2-x8 multiplier & grayscale accessibility sheet."""
    sheet = Image.new("RGBA", (1600, 1020), (244, 239, 248, 255))
    d = ImageDraw.Draw(sheet)
    # Header bar
    d.rounded_rectangle((24, 20, 1576, 96), radius=16, fill=(44, 42, 96, 255), outline=(232, 192, 108, 255), width=3)
    f_title = load_font(28, bold=True)
    f_sub = load_font(16, bold=False)
    f_lbl = load_font(17, bold=True)
    f_small = load_font(14, bold=False)
    d.text((48, 34), "Aetheria: SoulBound — Functional 8×8 Gem Visual Mapping & State Atlas (R04 Reference)", font=f_title, fill=(255, 246, 218))
    d.text((48, 68), "Candidate visual mapping preserving functional TileKind rules (Sword, Mana, Rage, Heart, Shield, Special) + x2–x8 multipliers", font=f_sub, fill=(208, 218, 248))

    # Left panel: 6 Functional kinds + states (Normal, Hover/Selected, Matched, Disabled, Grayscale, 32px in-game)
    d.rounded_rectangle((24, 114, 1060, 650), radius=16, fill=(252, 249, 244, 255), outline=(214, 174, 102, 255), width=2)
    cols = ["Functional Kind", "Normal (64px)", "Selected", "Matched", "Disabled", "Grayscale", "32px Board"]
    col_x = [46, 300, 430, 555, 680, 805, 935]
    for cx, cname in zip(col_x, cols):
        d.text((cx, 128), cname, font=f_lbl, fill=(52, 42, 88))

    mapping_notes = [
        ("sword", "Sword (Attack)", "Golden Lightning"),
        ("mana", "Mana (Restore MP)", "Azure Droplet"),
        ("rage", "Rage (Build Rage)", "Crimson Flame"),
        ("heart", "Heart (Heal HP)", "Rose Heart"),
        ("shield", "Shield (Guard)", "Cobalt Shield"),
        ("special", "Special (SoulBound)", "Golden Paw"),
    ]
    for row_i, (kind, label, ref_desc) in enumerate(mapping_notes):
        ry = 166 + row_i * 78
        d.line((40, ry - 6, 1044, ry - 6), fill=(228, 218, 236), width=1)
        d.text((46, ry + 10), label, font=f_lbl, fill=(38, 32, 68))
        d.text((46, ry + 34), f"R04: {ref_desc}", font=f_small, fill=(106, 88, 132))
        src = jewels_256[kind]
        norm = src.resize((64, 64), Image.Resampling.LANCZOS)
        # Socket bg
        for sx in col_x[1:6]:
            d.rounded_rectangle((sx, ry + 2, sx + 68, ry + 70), radius=10, fill=(36, 38, 68, 255), outline=(168, 134, 82, 255), width=2)
        sheet.alpha_composite(norm, (col_x[1] + 2, ry + 4))
        # Hover/Selected: bright gold glow border + +15% brightness
        sel = ImageEnhance.Brightness(norm).enhance(1.16)
        d.rounded_rectangle((col_x[2] - 2, ry, col_x[2] + 70, ry + 72), radius=12, outline=(255, 238, 148, 255), width=3)
        sheet.alpha_composite(sel, (col_x[2] + 2, ry + 4))
        # Matched: luminous bloom
        matched = ImageEnhance.Brightness(norm).enhance(1.32)
        sheet.alpha_composite(matched, (col_x[3] + 2, ry + 4))
        # Disabled: dimmed 55%
        dis = norm.copy()
        r, g, b, a = dis.split()
        dis = Image.merge("RGBA", (r, g, b, a.point(lambda p: int(p * 0.52))))
        sheet.alpha_composite(dis, (col_x[4] + 2, ry + 4))
        # Grayscale accessibility check
        gray_rgb = ImageOps.grayscale(norm.convert("RGB")).convert("RGB")
        gray = Image.merge("RGBA", (*gray_rgb.split(), norm.getchannel("A")))
        sheet.alpha_composite(gray, (col_x[5] + 2, ry + 4))
        # 32px actual compact board scale
        d.rounded_rectangle((col_x[6] + 14, ry + 18, col_x[6] + 50, ry + 54), radius=6, fill=(36, 38, 68, 255))
        sheet.alpha_composite(src.resize((32, 32), Image.Resampling.LANCZOS), (col_x[6] + 16, ry + 20))

    # Right panel: R04 original reference board crop for honest side-by-side comparison
    d.rounded_rectangle((1080, 114, 1576, 650), radius=16, fill=(252, 249, 244, 255), outline=(214, 174, 102, 255), width=2)
    d.text((1102, 128), "Owner Reference R04 Crop (Comparison Authority)", font=f_lbl, fill=(52, 42, 88))
    rc = r04_board_crop.resize((456, 456), Image.Resampling.LANCZOS)
    sheet.alpha_composite(rc, (1100, 162))
    d.text((1102, 624), "Retained non-board symbols: Leaf, Snowflake, Violet Star", font=f_small, fill=(96, 82, 122))

    # Bottom row: Multiplier x2..x8 on actual tiles + Retained extra icons + 4 R02 Wallet Currencies + Active Elements
    d.rounded_rectangle((24, 668, 1576, 996), radius=16, fill=(252, 249, 244, 255), outline=(214, 174, 102, 255), width=2)
    d.text((46, 682), "Progressive Multipliers (x2 – x8 on Board Tiles) & R01/R02 Active Elements, Rarities, and 4-Resource Wallet Icons", font=f_lbl, fill=(52, 42, 88))

    sample_kinds = ["sword", "mana", "rage", "heart", "shield", "special", "sword"]
    for idx, m in enumerate(range(2, 9)):
        bx = 46 + idx * 104
        by = 720
        d.rounded_rectangle((bx, by, bx + 84, by + 84), radius=12, fill=(36, 38, 68, 255), outline=(218, 176, 102, 255), width=2)
        t_img = jewels_256[sample_kinds[idx]].resize((74, 74), Image.Resampling.LANCZOS)
        sheet.alpha_composite(t_img, (bx + 5, by + 5))
        mb = mult_badges[m].resize((42, 34), Image.Resampling.LANCZOS)
        sheet.alpha_composite(mb, (bx + 42, by + 1))
        d.text((bx + 26, by + 90), f"Tier x{m}", font=f_small, fill=(52, 42, 88))

    # Wallet 4 icons in R02 canonical order
    wx0 = 810
    for idx, (wk, wname) in enumerate([
        ("energy", "1. Energy"),
        ("premium_diamond", "2. Diamond"),
        ("coin", "3. Coin"),
        ("luminous_stone", "4. Stone"),
    ]):
        bx = wx0 + idx * 182
        by = 724
        d.rounded_rectangle((bx, by, bx + 166, by + 64), radius=30, fill=(42, 52, 98, 255), outline=(226, 192, 118, 255), width=2)
        ic = make_currency_icon(wk, 128).resize((52, 52), Image.Resampling.LANCZOS)
        sheet.alpha_composite(ic, (bx + 8, by + 6))
        d.text((bx + 66, by + 22), wname, font=f_small, fill=(255, 248, 228))

    # Active 6 MVP Elements + 4 Rarities row at y=842
    for idx, el in enumerate(["fire", "water", "electric", "ghost", "ground", "light"]):
        ex = 46 + idx * 116
        ey = 846
        em = make_element_medallion(el, 128).resize((68, 68), Image.Resampling.LANCZOS)
        sheet.alpha_composite(em, (ex, ey))
        d.text((ex + 8, ey + 72), el.capitalize(), font=f_small, fill=(52, 42, 88))

    for idx, rk in enumerate(["B", "A", "S", "LIMITED"]):
        rx = 810 + idx * 140
        ry = 846
        rb = make_rarity_badge(rk, 128).resize((68, 68), Image.Resampling.LANCZOS)
        sheet.alpha_composite(rb, (rx, ry))
        d.text((rx + 8, ry + 72), f"Rank {rk}", font=f_small, fill=(52, 42, 88))

    return sheet


def make_clean_sky_backdrop(seed_palette: str, size: tuple[int, int] = (1280, 720)) -> Image.Image:
    """Create luminous anime-fantasy layered sky & floating-island background without any baked UI text."""
    w, h = size
    palettes = {
        "sky_hub": ((68, 152, 242), (178, 224, 255), (255, 214, 232)),
        "cinder-terraces": ((88, 52, 118), (238, 118, 72), (255, 208, 128)),
        "tideglass-lagoon": ((38, 128, 224), (96, 218, 238), (214, 252, 255)),
        "stormcoil-fields": ((52, 64, 148), (134, 112, 232), (255, 232, 124)),
        "lantern-necropolis": ((42, 34, 92), (118, 78, 184), (224, 178, 255)),
        "ochre-labyrinth": ((92, 138, 214), (218, 162, 96), (255, 228, 172)),
        "dawn-prism-sanctum": ((78, 146, 238), (198, 214, 255), (255, 244, 196)),
    }
    top_c, mid_c, horizon_c = palettes[seed_palette]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = lerp_color(top_c, mid_c, t * 1.4) if t < 0.65 else lerp_color(mid_c, horizon_c, (t - 0.65) / 0.35)
        for x in range(w):
            px[x, y] = (*c, 255)
    # Luminous sun/moon halo + soft fantasy clouds + distant floating islands silhouette (leaving center clear for 8x8 board!)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((w * 0.34, h * 0.04, w * 0.66, h * 0.58), fill=(*horizon_c, 72))
    # Left & right floating island ledges framing Pet & Boss stages
    for side in (-1, 1):
        cx = w * (0.14 if side < 0 else 0.86)
        od.polygon(
            [
                (cx - 190, h * 0.66),
                (cx + 190, h * 0.66),
                (cx + 135, h * 0.78),
                (cx, h * 0.90),
                (cx - 140, h * 0.79),
            ],
            fill=(58, 54, 92, 225),
        )
        od.ellipse((cx - 200, h * 0.62, cx + 200, h * 0.70), fill=(*lerp_color(mid_c, (255, 255, 255), 0.35), 235))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=3))
    img.alpha_composite(overlay)
    return img


def main() -> None:
    for d in [
        WORKSPACE_OUT / "jewels",
        WORKSPACE_OUT / "multipliers",
        WORKSPACE_OUT / "currencies",
        WORKSPACE_OUT / "elements",
        WORKSPACE_OUT / "rarities",
        WORKSPACE_OUT / "items",
        WORKSPACE_OUT / "frames",
        WORKSPACE_OUT / "maps",
        WAVED4_RES_DIR / "Icons",
        WAVED4_RES_DIR / "Frames",
        WAVED4_RES_DIR / "Maps",
        REVIEW_OUT,
    ]:
        d.mkdir(parents=True, exist_ok=True)

    manifest_entries = []

    def save_pair(img: Image.Image, master_rel: str, unity_rel: str | None, category: str, canonical_id: str):
        m_path = WORKSPACE_OUT / master_rel
        m_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(m_path, format="PNG")
        u_hash = None
        if unity_rel is not None:
            u_path = WAVED4_RES_DIR / unity_rel
            u_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(u_path, format="PNG")
            u_hash = sha256_file(u_path)
        manifest_entries.append(
            {
                "canonicalId": canonical_id,
                "category": category,
                "masterPath": str(m_path),
                "masterSha256": sha256_file(m_path),
                "unityResource": f"WaveD4/{unity_rel[:-4]}" if unity_rel else None,
                "unitySha256": u_hash,
                "dimensions": f"{img.width}x{img.height}",
                "provenance": "Original vector/procedural reconstruction calibrated to owner cinematic kit R01-R05",
                "reviewStatus": "CANDIDATE_READY_FOR_OWNER_REVIEW",
            }
        )

    # 1. All 9 R04 jewels (6 active functional + 3 retained reference jewels)
    jewels_256: dict[str, Image.Image] = {}
    for k in ["sword", "mana", "rage", "heart", "shield", "special", "wood_leaf", "ice_snowflake", "light_star"]:
        j = make_r04_jewel(k, 256)
        jewels_256[k] = j
        save_pair(j, f"jewels/{k}_256.png", f"Icons/gem_{k}.png", "functional_jewel", f"gem-{k}")

    # Update FunctionalGems.png and FunctionalGemsGemini.png (exact 512x256 6-cell layout preserving .meta GUIDs!)
    atlas = build_functional_atlas(jewels_256)
    atlas_master = WORKSPACE_OUT / "jewels/functional_gems_r04_atlas.png"
    atlas.save(atlas_master, format="PNG")
    atlas.save(FUNC_TILES_DIR / "FunctionalGems.png", format="PNG")
    atlas.save(FUNC_TILES_DIR / "FunctionalGemsGemini.png", format="PNG")
    manifest_entries.append(
        {
            "canonicalId": "functional-gems-atlas-r04",
            "category": "runtime_sprite_atlas",
            "masterPath": str(atlas_master),
            "masterSha256": sha256_file(atlas_master),
            "unityResource": "FunctionalTiles/FunctionalGems",
            "unitySha256": sha256_file(FUNC_TILES_DIR / "FunctionalGems.png"),
            "dimensions": "512x256",
            "provenance": "R04 cushion jewel atlas (sword, mana, rage, heart, shield, special)",
            "reviewStatus": "CANDIDATE_READY_FOR_OWNER_REVIEW",
        }
    )

    # 2. Multiplier badges x2..x8
    mult_badges: dict[int, Image.Image] = {}
    for m in range(2, 9):
        mb = make_multiplier_badge(m, 128)
        mult_badges[m] = mb
        save_pair(mb, f"multipliers/mult_x{m}.png", f"Icons/mult_x{m}.png", "multiplier_badge", f"multiplier-x{m}")

    # 3. Four R02 Wallet Currency Icons
    for ck in ["energy", "premium_diamond", "coin", "luminous_stone"]:
        ci = make_currency_icon(ck, 256)
        save_pair(ci, f"currencies/{ck}_256.png", f"Icons/currency_{ck}.png", "wallet_currency", f"currency-{ck}")

    # 4. Six Active MVP Element Medallions (R01)
    for el in ["fire", "water", "electric", "ghost", "ground", "light"]:
        ei = make_element_medallion(el, 192)
        save_pair(ei, f"elements/{el}_192.png", f"Icons/element_{el}.png", "element_icon", f"element-{el}")

    # 5. Rarity Badges (R01)
    for rk in ["B", "A", "S", "LIMITED"]:
        ri = make_rarity_badge(rk, 192)
        save_pair(ri, f"rarities/rarity_{rk.lower()}_192.png", f"Icons/rarity_{rk.lower()}.png", "rarity_badge", f"rarity-{rk.lower()}")

    # 6. Artifact & Inventory Item Icons
    for ik in ["artifact_core", "artifact_aegis", "artifact_rune", "material_essence", "skill_tome", "exp_scroll"]:
        ii = make_artifact_or_item_icon(ik, 192)
        save_pair(ii, f"items/{ik}_192.png", f"Icons/{ik}.png", "inventory_item", ik)

    # 7. Ornamental 9-slice Frames
    for fk in ["gold_board", "ivory_card", "royal_header", "cta_blue_gold"]:
        fi = make_ornamental_frame(fk, (256, 256))
        save_pair(fi, f"frames/{fk}_256.png", f"Frames/{fk}.png", "ui_frame", f"frame-{fk}")

    # 8. Clean text-free layered map cards & hub sky backdrop
    for mk in [
        "sky_hub",
        "cinder-terraces",
        "tideglass-lagoon",
        "stormcoil-fields",
        "lantern-necropolis",
        "ochre-labyrinth",
        "dawn-prism-sanctum",
    ]:
        mi = make_clean_sky_backdrop(mk, (640, 360))
        save_pair(mi, f"maps/{mk}_card.png", f"Maps/{mk}.png", "map_illustration", f"map-card-{mk}")

    # 9. Review & Mapping Comparison Sheet (public-safe WebP + private PNG master)
    r04 = Image.open(KIT_ROOT / "design/05_battle_fire_zone_normal.webp").convert("RGBA")
    r04_crop = r04.crop((485, 115, 1025, 625))
    sheet = build_gem_mapping_and_state_sheet(jewels_256, mult_badges, r04_crop)
    sheet_png = WORKSPACE_OUT / "gem_mapping_and_design_system_sheet.png"
    sheet.save(sheet_png, format="PNG")
    sheet_webp = REVIEW_OUT / "wave-d4-gem-mapping-and-ui-kit.webp"
    sheet.convert("RGB").save(sheet_webp, format="WEBP", quality=90)

    # Write provenance & hash manifest
    manifest = {
        "schemaVersion": 1,
        "title": "Aetheria: SoulBound Wave D4 Reference-Driven UI & Icon Production Kit",
        "references": {
            "R01_elements_and_races": sha256_file(KIT_ROOT / "design/02_elements_and_races.webp"),
            "R02_pve_regular_map": sha256_file(KIT_ROOT / "design/03_pve_regular_map.webp"),
            "R03_pve_legendary_map": sha256_file(KIT_ROOT / "design/04_pve_legendary_map.webp"),
            "R04_battle_fire_zone_normal": sha256_file(KIT_ROOT / "design/05_battle_fire_zone_normal.webp"),
            "R05_settings": sha256_file(KIT_ROOT / "design/17_settings.webp"),
        },
        "reviewSheetWebp": str(sheet_webp.relative_to(REPO_ROOT)),
        "reviewSheetSha256": sha256_file(sheet_webp),
        "assetCount": len(manifest_entries),
        "assets": manifest_entries,
    }
    (WORKSPACE_OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Produced {len(manifest_entries)} UI/icon assets; atlas SHA={sha256_file(FUNC_TILES_DIR / 'FunctionalGems.png')[:12]}")


if __name__ == "__main__":
    main()
