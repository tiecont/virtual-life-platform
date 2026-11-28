"""Add one review-only bilateral smile to the original Charakuru VRM."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

SOURCE = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a"


def build(source, output):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE:
        raise ValueError("Use the original approved Icarus VRM")
    size = struct.unpack_from("<I",raw,12)[0]
    doc = json.loads(raw[20:20+size])
    binary = bytearray(raw[28+size:28+size+doc["buffers"][0]["byteLength"]])
    head_node, = [i for i,n in enumerate(doc["nodes"]) if n.get("name") == "Head" and "mesh" in n]
    mesh = doc["meshes"][doc["nodes"][head_node]["mesh"]]
    primitive, = mesh["primitives"]
    pos = doc["accessors"][primitive["attributes"]["POSITION"]]
    view = doc["bufferViews"][pos["bufferView"]]
    if pos["type"] != "VEC3" or pos["componentType"] != 5126 or primitive.get("targets"):
        raise ValueError("Unexpected Head layout")
    start = view.get("byteOffset",0) + pos.get("byteOffset",0)
    offsets = []
    for i in range(pos["count"]):
        x,y,z = struct.unpack_from("<3f",binary,start+i*view.get("byteStride",12))
        # Coordinates are in the source mesh's rest frame. The painted lip
        # commissures lie near ±16 mm and 1.454 m. Protect the eyes and jawline.
        lateral = (abs(x)-.016)/.016
        vertical = (y-1.454)/.013
        depth = min(1., max(0., (z-.143)/.012))
        weight = max(0., 1.-lateral*lateral-vertical*vertical)**2 * depth*depth*(3-2*depth)
        offsets.append((math.copysign(.0018*weight,x), .0031*weight, -.0007*weight))
    if max(v[1] for v in offsets)<.0025:
        raise ValueError("Missing original lip corners")
    binary.extend(b'\0'*(-len(binary)%4))
    offset = len(binary)
    payload = b''.join(struct.pack("<3f",*v) for v in offsets)
    binary.extend(payload)
    doc["bufferViews"].append({"buffer":0,"byteOffset":offset,"byteLength":len(payload),"target":34962})
    doc["accessors"].append({"bufferView":len(doc["bufferViews"])-1,"componentType":5126,"type":"VEC3",
        "count":len(offsets),"min":[min(axis) for axis in zip(*offsets)],"max":[max(axis) for axis in zip(*offsets)]})
    primitive["targets"] = [{"POSITION":len(doc["accessors"])-1}]
    mesh["weights"] = [0.]
    mesh.setdefault("extras",{})["targetNames"] = ["IcarusSoftSmile"]
    happy = doc["extensions"]["VRMC_vrm"]["expressions"]["preset"]["happy"]
    if happy.get("morphTargetBinds"):
        raise ValueError("Existing expression ownership changed")
    happy["morphTargetBinds"] = [{"node":head_node,"index":0,"weight":1.}]
    doc["buffers"][0]["byteLength"] = len(binary)
    metadata = json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()
    metadata += b' ' * (-len(metadata)%4)
    binary.extend(b'\0'*(-len(binary)%4))
    total = 28 + len(metadata) + len(binary)
    result = struct.pack("<4sIIII",b"glTF",2,total,len(metadata),0x4E4F534A)+metadata+struct.pack("<II",len(binary),0x004E4942)+binary
    output.mkdir(parents=True,exist_ok=False)
    (output/"IcarusSoftSmile.vrm").write_bytes(result)
    (output/"expression-source.json").write_text(json.dumps({
        "classification":"PRIVATE_H1_EXPRESSION_STUDY","sourceSha256":SOURCE,
        "candidateSha256":hashlib.sha256(result).hexdigest(),
        "affectedVertices":sum(v[1]>.00001 for v in offsets),"maxRiseMeters":max(v[1] for v in offsets),
        "neutralWeight":0,"preset":"happy"},indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",type=Path)
    parser.add_argument("output",type=Path)
    args = parser.parse_args()
    build(args.source,args.output)
