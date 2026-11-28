"""Package a reviewed GLB for Tripo Smart UV without uploading local preview textures."""

import argparse
import hashlib
import json
from pathlib import Path
import struct

from icarus_wing_parts import parse_glb


def referenced_views(node):
    if isinstance(node, list):
        for child in node:
            yield from referenced_views(child)
    elif isinstance(node, dict):
        if "bufferView" in node:
            yield node
        for child in node.values():
            yield from referenced_views(child)


def pack(source, expected_sha, output):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Source differs from the reviewed LOD")
    doc, buf = parse_glb(raw)
    if len(doc["buffers"]) != 1 or any(a.get("uri") for a in doc["buffers"]):
        raise ValueError("Use a self-contained GLB")
    if doc.get("extensionsRequired") or any(v.get("extensions") for v in doc["bufferViews"]):
        raise ValueError("A compressed or extended buffer requires a format-specific pass")
    triangles = 0
    for mesh in doc["meshes"]:
        for part in mesh["primitives"]:
            if part.get("mode", 4) != 4:
                raise ValueError("Only triangle input was qualified for this route")
            count = doc["accessors"][part["indices"]]["count"]
            if count % 3:
                raise ValueError("Invalid triangle index buffer")
            triangles += count // 3
            part.pop("material", None)
    if not 0 < triangles <= 80000:
        raise ValueError("Tripo Studio Smart UV accepts up to 80,000 triangles")
    for key in ("materials", "textures", "images", "samplers"):
        doc.pop(key, None)
    # A material-only extension may no longer be used once the materials are removed.
    if "extensionsUsed" in doc:
        def find_extensions(node):
            if isinstance(node, dict):
                yield from node.get("extensions", {})
                for value in node.values():
                    yield from find_extensions(value)
            elif isinstance(node, list):
                for value in node:
                    yield from find_extensions(value)
        used = set(find_extensions(doc))
        doc["extensionsUsed"] = [e for e in doc["extensionsUsed"] if e in used]
        if not doc["extensionsUsed"]:
            del doc["extensionsUsed"]
    views = doc.pop("bufferViews")
    references = list(referenced_views(doc))
    mapping, packed, kept = {}, bytearray(), []
    for old in sorted({r["bufferView"] for r in references}):
        view = dict(views[old])
        if view.get("buffer") != 0:
            raise ValueError("Unexpected external buffer")
        off = view.get("byteOffset", 0)
        packed.extend(b'\0' * (-len(packed) % 4))
        view["byteOffset"] = len(packed)
        payload = buf[off:off + view["byteLength"]]
        if len(payload) != view["byteLength"]:
            raise ValueError("Truncated geometry buffer")
        packed.extend(payload)
        mapping[old] = len(kept)
        kept.append(view)
    for entry in references:
        entry["bufferView"] = mapping[entry["bufferView"]]
    doc["bufferViews"] = kept
    doc["buffers"] = [{"byteLength": len(packed)}]
    packed.extend(b'\0' * (-len(packed) % 4))
    metadata = json.dumps(doc, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    result = (struct.pack('<4sIIII', b'glTF', 2, 28+len(metadata)+len(packed), len(metadata), 0x4E4F534A)
              + metadata + struct.pack('<II', len(packed), 0x004E4942) + packed)
    with output.open("xb") as file:
        file.write(result)
    return {"sourceSha256": expected_sha, "sha256": hashlib.sha256(result).hexdigest(),
            "triangles": triangles, "embeddedImages": 0, "retainedGeometryBufferViews": len(kept)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("source_sha256")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(pack(args.source, args.source_sha256, args.output)))
