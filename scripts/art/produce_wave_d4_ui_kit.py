"""Pack the six functional jewels from the verified R04 provider master."""
import argparse
import hashlib
from pathlib import Path

from PIL import Image


MASTER_SHA256 = "a1d1264705632fb709bb6c95032a1676eef8f59dee229d58acd8a768c20a3ad1"
KINDS = ("sword", "mana", "rage", "heart", "shield", "special")
RESOURCES = (Path(__file__).resolve().parents[2] / "apps/unity-client/Assets/Aetheria"
             / "Features/PetArena/Presentation/Resources")


def pack(master: Path) -> None:
    if hashlib.sha256(master.read_bytes()).hexdigest() != MASTER_SHA256:
        raise ValueError("Expected the R04 provider master recorded in specs/media/hydrogen-production.md")
    with Image.open(master) as sheet:
        if sheet.mode != "RGBA" or sheet.size != (1536, 1024):
            raise ValueError("Expected a 3 by 2 sheet of 512-pixel RGBA tiles")
        atlas = Image.new("RGBA", (512, 256))
        for index, kind in enumerate(KINDS):
            x, y = index % 3 * 512, index // 3 * 512
            tile = sheet.crop((x, y, x + 512, y + 512))
            icon = tile.resize((256, 256), Image.Resampling.LANCZOS)
            icon.save(RESOURCES / "WaveD4" / "Icons" / f"gem_{kind}.png")
            sprite = tile.resize((128, 128), Image.Resampling.LANCZOS)
            atlas.paste(sprite, (index % 4 * 128, index // 4 * 128))
        atlas.save(RESOURCES / "FunctionalTiles" / "FunctionalGems.png")


def pack_reference_icons(master: Path) -> None:
    expected = "26fe604af853af4606216d359117dbc022cba4e59ece7a9f8f0dde858057a588"
    if hashlib.sha256(master.read_bytes()).hexdigest() != expected:
        raise ValueError("Expected the R04 leaf, snowflake and star provider master")
    with Image.open(master) as sheet:
        edge = sheet.height
        for index, kind in enumerate(("wood_leaf", "ice_snowflake", "light_star")):
            tile = sheet.crop((index * edge, 0, (index + 1) * edge, edge))
            tile.resize((256, 256), Image.Resampling.LANCZOS).save(
                RESOURCES / "WaveD4" / "Icons" / f"gem_{kind}.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider_master", type=Path)
    parser.add_argument("--reference-icons", type=Path)
    args = parser.parse_args()
    pack(args.provider_master)
    if args.reference_icons:
        pack_reference_icons(args.reference_icons)
