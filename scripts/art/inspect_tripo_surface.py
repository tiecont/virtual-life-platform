"""Inspect downloaded Tripo GLB maps and compare them with the submitted production geometry."""
import argparse
from io import BytesIO
import json
from pathlib import Path

from PIL import Image
from icarus_wing_parts import checksum, parse_glb


def inventory(path):
    data = path.read_bytes()
    doc, binary = parse_glb(data)
    maps = []
    for image in doc.get("images", []):
        view = doc["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        raw = binary[start:start + view["byteLength"]]
        with Image.open(BytesIO(raw)) as decoded:
            decoded.load()
            maps.append({"size": list(decoded.size), "format": decoded.format, "sha256": checksum(raw)})
    primitives = [part for mesh in doc["meshes"] for part in mesh["primitives"]]
    triangles = sum(doc["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    materials = doc.get("materials", [])
    base = []
    for part in primitives:
        material = materials[part["material"]] if "material" in part else {}
        info = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        base.append(doc["textures"][info["index"]]["source"] if info else None)
    return {"sha256": checksum(data), "triangles": triangles, "meshes": len(doc["meshes"]),
            "skins": len(doc.get("skins", [])), "morphTargets": sum(len(p.get("targets", [])) for p in primitives),
            "images": maps, "baseColorImagesByPrimitive": base}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("delivery", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    original, returned = inventory(args.source), inventory(args.delivery)
    base = returned["baseColorImagesByPrimitive"]
    qualifies = bool(base) and all(i is not None and returned["images"][i]["size"] == [4096, 4096] for i in base)
    with args.output.open("x") as out:
        json.dump({"submitted": original, "delivered": returned, "allBaseColors4K": qualifies}, out, indent=2)
    print(f"triangles {original['triangles']} -> {returned['triangles']}, base color 4K {qualifies}")
