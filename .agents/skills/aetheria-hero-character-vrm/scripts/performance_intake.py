"""Report actual VRM performance bindings and locally resolved Unity capabilities."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PROJECT = ROOT / "apps/unity-client"
ICARUS = PROJECT / "Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm"
PACKAGES = ("com.vrmc.vrm", "com.unity.render-pipelines.universal", "com.unity.shadergraph",
            "com.unity.timeline", "com.unity.cinemachine", "com.unity.recorder",
            "com.unity.animation.rigging", "com.unity.visualeffectgraph", "jp.lilxyzw.liltoon")


def inventory(roots):
    records = []
    for root in roots:
        for skill in sorted(root.glob("*/SKILL.md")):
            text = skill.read_text()
            name = re.search(r"^name:\s*(.+)$", text, re.M)
            if name:
                records.append({"name": name[1].strip(), "path": str(skill),
                                "sha256": hashlib.sha256(text.encode()).hexdigest()})
    return records


def inspect(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("Incomplete GLB")
    magic, version, length, chunk, kind = struct.unpack_from("<4sIIII",data)
    if magic != b"glTF" or version != 2 or length != len(data) or kind != 0x4E4F534A or chunk > length - 20:
        raise ValueError("Invalid GLB header")
    doc = json.loads(data[20:20+chunk])
    ext = doc.get("extensions", {})
    vrm = ext.get("VRMC_vrm")
    if not vrm:
        raise ValueError("The asset must declare VRM 1.0")
    spring = ext.get("VRMC_springBone", {})
    expressions = {}
    for group, clips in vrm.get("expressions", {}).items():
        for name, clip in clips.items():
            entries = clip.get("morphTargetBinds", [])
            for bind in entries:
                node = doc["nodes"][bind["node"]]
                primitives = doc["meshes"][node["mesh"]]["primitives"]
                if bind["index"] < 0 or not any(bind["index"] < len(p.get("targets", [])) for p in primitives):
                    raise ValueError(f"Invalid morph target for {name}")
            expressions[f"{group}/{name}"] = {field: len(clip.get(field, [])) for field in
                                               ("morphTargetBinds", "materialColorBinds", "textureTransformBinds")}
    return {"sha256": hashlib.sha256(data).hexdigest(), "meshCount": len(doc.get("meshes", [])),
            "mappedHumanoidBones": len(vrm["humanoid"]["humanBones"]), "expressions": expressions,
            "eyeBones": [eye for eye in ["leftEye","rightEye"] if eye in vrm["humanoid"]["humanBones"]],
            "lookAt": vrm.get("lookAt", {}).get("type"), "skins": len(doc.get("skins", [])),
            "springChains": len(spring.get("springs", [])), "colliders": len(spring.get("colliders", [])),
            "metaPermissions": {k: vrm["meta"].get(k) for k in ("commercialUsage","modification","allowRedistribution")}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vrm", type=Path, default=ICARUS)
    parser.add_argument("--skill-root", type=Path, action="append", default=[])
    args = parser.parse_args()
    deps = json.loads((PROJECT / "Packages/packages-lock.json").read_text())["dependencies"]
    print(json.dumps({"source": inspect(args.vrm), "resolvedPackages": {p: deps.get(p, {}).get("version") for p in PACKAGES},
                      "skills": inventory([ROOT / ".agents/skills", *args.skill_root])}, ensure_ascii=False))
