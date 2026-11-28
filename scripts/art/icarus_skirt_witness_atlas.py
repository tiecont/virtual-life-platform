"""Map skirt contact witnesses back onto the original private lower-body texture."""
import argparse
import hashlib
import io
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw
from icarus_chin_weights import SOURCE_SHA


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vrm", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.vrm.read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise ValueError("The source texture must match the measured Icarus intake")
    json_size = struct.unpack_from("<I", source, 12)[0]
    gltf = json.loads(source[20:20 + json_size])
    lower, = [m for m in gltf["materials"] if m["name"] == "Material_lower_body"]
    tex = lower["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image = gltf["images"][gltf["textures"][tex]["source"]]
    view = gltf["bufferViews"][image["bufferView"]]
    start = 28 + json_size + view.get("byteOffset", 0)
    atlas = Image.open(io.BytesIO(source[start:start + view["byteLength"]])).convert("RGB")
    atlas.thumbnail((640, 640), Image.Resampling.LANCZOS)
    width, height = atlas.size
    sheet = Image.new("RGB", (width * 3, height + 32), "#202126")
    labels = ImageDraw.Draw(sheet)
    sheet.paste(atlas, (0, 32))
    labels.text((8, 8), "Original lower-body material", fill="white")
    for panel, (name, path) in enumerate((("Baseline", args.baseline), ("Local correction", args.candidate)), 1):
        report = json.loads(path.read_text())
        if report["sourceSha256"] != SOURCE_SHA:
            raise ValueError("Mismatched material and witness report")
        overlay = atlas.copy()
        paint = ImageDraw.Draw(overlay)
        for point in report["witnesses"]:
            u, v = point["gltfUv"]
            if not (math.isfinite(u) and math.isfinite(v) and 0 <= u <= 1 and 0 <= v <= 1):
                raise ValueError("Witness lies outside the pinned material atlas")
            x, y = round(u * (width - 1)), round(v * (height - 1))
            paint.ellipse((x - 1, y - 1, x + 1, y + 1), fill="#00e8ee")
        sheet.paste(overlay, (panel * width, 32))
        labels.text((panel * width + 8, 8), f"{name}   |   {len(report['witnesses'])} unoccluded samples", fill="white")
    with args.output.open("xb") as output:
        sheet.save(output, format="PNG")


if __name__ == "__main__":
    main()
