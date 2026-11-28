"""Pack the nine approved jewels from the verified R04 provider masters."""
import argparse
import hashlib
from pathlib import Path

from PIL import Image


MASTER_SHA256 = "a1d1264705632fb709bb6c95032a1676eef8f59dee229d58acd8a768c20a3ad1"
ADVANCED_SHA256 = "26fe604af853af4606216d359117dbc022cba4e59ece7a9f8f0dde858057a588"
KINDS = ("sword", "mana", "rage", "heart", "shield", "special")
ADVANCED_ICON_NAMES = ("wood_leaf", "ice_snowflake", "light_star")
SPRITE_EDGE = 128
EXTRUSION = 2
PITCH = SPRITE_EDGE + 2 * EXTRUSION
ATLAS_COLUMNS = 3
RESOURCES = (Path(__file__).resolve().parents[2] / "apps/unity-client/Assets/Aetheria"
             / "Features/PetArena/Presentation/Resources")


def read_tiles(master: Path, expected_sha256: str, edge: int, rows: int) -> list[Image.Image]:
    if hashlib.sha256(master.read_bytes()).hexdigest() != expected_sha256:
        raise ValueError(f"Unexpected R04 provider master: {master}")
    with Image.open(master) as sheet:
        if sheet.mode != "RGBA" or sheet.size != (3 * edge, rows * edge):
            raise ValueError(f"Unexpected dimensions or color mode: {master}")
        return [sheet.crop((x, y, x + edge, y + edge))
                for y in range(0, sheet.height, edge)
                for x in range(0, sheet.width, edge)]


def normalize(tile: Image.Image, edge: int) -> Image.Image:
    # The masters contain very low alpha specks outside the generated silhouettes.
    # Crop to visible bounds and scale uniformly, keeping a one-pixel clear edge.
    bounds = tile.getchannel("A").point(lambda alpha: 255 if alpha >= 16 else 0).getbbox()
    if bounds is None:
        raise ValueError("The provider cell is empty")
    cropped = tile.crop(bounds)
    scale = (edge - 2) / max(cropped.size)
    size = tuple(round(dimension * scale) for dimension in cropped.size)
    if min(size) < edge * .96:
        raise ValueError(f"Jewel does not fit the full-cell bounds: {size}")
    result = Image.new("RGBA", (edge, edge))
    result.paste(cropped.resize(size, Image.Resampling.LANCZOS),
                 tuple((edge - dimension) // 2 for dimension in size))
    visible = result.getchannel("A").point(lambda alpha: 255 if alpha >= 16 else 0).getbbox()
    if visible is None or min(visible[2] - visible[0], visible[3] - visible[1]) < edge * .96:
        raise ValueError(f"Resized jewel does not fit the visible bounds: {visible}")
    return result


def extrude(sprite: Image.Image) -> Image.Image:
    edge = SPRITE_EDGE
    padding = EXTRUSION
    padded = Image.new("RGBA", (PITCH, PITCH))
    padded.paste(sprite, (padding, padding))
    padded.paste(sprite.crop((0, 0, 1, edge)).resize((padding, edge), Image.Resampling.NEAREST),
                 (0, padding))
    padded.paste(sprite.crop((edge - 1, 0, edge, edge)).resize((padding, edge), Image.Resampling.NEAREST),
                 (padding + edge, padding))
    padded.paste(padded.crop((0, padding, PITCH, padding + 1)).resize((PITCH, padding), Image.Resampling.NEAREST),
                 (0, 0))
    padded.paste(padded.crop((0, padding + edge - 1, PITCH, padding + edge))
                 .resize((PITCH, padding), Image.Resampling.NEAREST), (0, padding + edge))
    return padded


def pack(master: Path, advanced_master: Path) -> None:
    basic = read_tiles(master, MASTER_SHA256, 512, 2)
    advanced = read_tiles(advanced_master, ADVANCED_SHA256, 724, 1)
    names = KINDS + ADVANCED_ICON_NAMES
    tiles = basic + advanced
    icons = [normalize(tile, 256) for tile in tiles]
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * PITCH, PITCH * 3))
    for index, tile in enumerate(tiles):
        sprite = extrude(normalize(tile, SPRITE_EDGE))
        atlas.paste(sprite, (index % ATLAS_COLUMNS * PITCH, index // ATLAS_COLUMNS * PITCH))
    for name, icon in zip(names, icons, strict=True):
        icon.save(RESOURCES / "WaveD4" / "Icons" / f"gem_{name}.png")
    atlas.save(RESOURCES / "FunctionalTiles" / "FunctionalGems.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider_master", type=Path)
    parser.add_argument("--reference-icons", type=Path, required=True)
    args = parser.parse_args()
    pack(args.provider_master, args.reference_icons)
