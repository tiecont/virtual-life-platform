"""Bind exact approved geometry and UVs to a retained Tripo segmentation.

Run with Blender 5.3 --background --python-exit-code 1. Inputs are the
original GLB, the retained Tripo segmented GLB, and the approved UV donor
recorded in the campaign candidate ledger. All files remain private.
"""

from __future__ import annotations

import argparse
import copy
import itertools
import json
import math
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_normalize_r2_batch import BatchError, repo_root, sha256_file
from blender_normalize_reviewed_pet import compare_views, triangles


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
SCALAR = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}
ARITY = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}
# Tripo's exports use a one-unit-wide provider mesh. Permit at most 20
# microunits of search radius, then require uniquely identified ORIGINAL
# coordinates and exactly one copy of every original oriented face.
MAX_PROVIDER_DRIFT = 2e-5
NEIGHBORS = tuple(itertools.product((-1, 0, 1), repeat=3))


class Glb:
    def __init__(self, path):
        data = path.read_bytes()
        magic, version, length = struct.unpack_from("<4sII", data)
        if (magic, version, length) != (b"glTF", 2, len(data)):
            raise BatchError(f"Invalid GLB header in {path.name}")
        json_size, json_type = struct.unpack_from("<II", data, 12)
        bin_size, bin_type = struct.unpack_from("<II", data, 20 + json_size)
        if (json_type, bin_type, 28 + json_size + bin_size) != (JSON_CHUNK, BIN_CHUNK, len(data)):
            raise BatchError("Expected one JSON chunk and one binary chunk")
        self.doc = json.loads(data[20:20 + json_size])
        self.payload = data[28 + json_size:]
        buffers = self.doc["buffers"]
        if len(buffers) != 1 or "uri" in buffers[0] or not 0 <= bin_size-buffers[0]["byteLength"] < 4:
            raise BatchError("Expected a closed single-buffer GLB")
        if any(self.doc.get(key) for key in ("extensionsRequired", "extensionsUsed", "animations", "skins", "textures")):
            raise BatchError("This stage expects uncompressed, untextured static provider data")
        if any(set(node) & {"matrix", "translation", "rotation", "scale", "skin"} for node in self.doc["nodes"]):
            raise BatchError("A transformed provider node requires an explicit geometry contract")

    def accessor(self, index, expected_type, allowed_types):
        row = self.doc["accessors"][index]
        view = self.doc["bufferViews"][row["bufferView"]]
        component = row["componentType"]
        if row["type"] != expected_type or component not in allowed_types or row.get("sparse") or row.get("normalized"):
            raise BatchError("Unsupported geometry accessor")
        fmt = struct.Struct("<" + SCALAR[component] * ARITY[expected_type])
        stride = view.get("byteStride", fmt.size)
        view_start = view.get("byteOffset", 0)
        start = view_start + row.get("byteOffset", 0)
        end = start + (row["count"] - 1)*stride + fmt.size
        if (view["buffer"] != 0 or stride < fmt.size or row["count"] < 1 or
                not 0 <= view_start <= start < end <= view_start + view["byteLength"] <= len(self.payload)):
            raise BatchError("Out-of-bounds geometry accessor")
        values = [fmt.unpack_from(self.payload, start + index*stride) for index in range(row["count"])]
        if component == 5126 and not all(math.isfinite(value) for item in values for value in item):
            raise BatchError("Non-finite attributes cannot be matched")
        return values

    def primitives(self, uv):
        expected = {"POSITION", "NORMAL", "TEXCOORD_0"} if uv else {"POSITION", "NORMAL"}
        for mesh in self.doc["meshes"]:
            if len(mesh["primitives"]) != 1:
                raise BatchError("This workflow expects one indexed primitive per retained part")
            primitive = mesh["primitives"][0]
            attrs = primitive["attributes"]
            if set(attrs) != expected or primitive.get("mode", 4) != 4 or primitive.get("targets"):
                raise BatchError("Primitive uses unsupported geometry channels")
            pos = self.accessor(attrs["POSITION"], "VEC3", {5126})
            norm = self.accessor(attrs["NORMAL"], "VEC3", {5126})
            tex = self.accessor(attrs["TEXCOORD_0"], "VEC2", {5126}) if uv else []
            if len(norm) != len(pos) or (uv and len(tex) != len(pos)):
                raise BatchError("Geometry attributes have inconsistent vertex counts")
            indices = [row[0] for row in self.accessor(primitive["indices"], "SCALAR", {5121, 5123, 5125})]
            if len(indices) % 3 or max(indices) >= len(pos):
                raise BatchError("Invalid triangle indices")
            faces = [tuple(indices[i:i+3]) for i in range(0, len(indices), 3)]
            yield pos, norm, tex, faces


def orientation(face):
    return min(face, face[1:] + face[:1], face[2:] + face[:2])


def exact_faces(primitives):
    catalog = {}
    for positions, _, uv, faces in primitives:
        for indices in faces:
            points = tuple(positions[i] for i in indices)
            key = tuple(sorted(points))
            if len(set(points)) != 3 or key in catalog:
                raise BatchError("Coincident, duplicate or collapsed source face makes UV ownership ambiguous")
            catalog[key] = (orientation(points), dict(zip(points, (uv[i] for i in indices))) if uv else {})
    return catalog


def spatial_correspondence(source, segmented):
    def cell(point):
        return tuple(math.floor(value/MAX_PROVIDER_DRIFT) for value in point)

    bins = defaultdict(list)
    for point in source:
        bins[cell(point)].append(point)
    result = {}
    ambiguity = Counter()
    displacement = []
    for point in segmented:
        x,y,z = cell(point)
        candidates = []
        for dx,dy,dz in NEIGHBORS:
            for reference in bins.get((x+dx,y+dy,z+dz), ()):
                distance = math.dist(reference,point)
                if distance <= MAX_PROVIDER_DRIFT:
                    candidates.append((reference,distance))
        ambiguity[len(candidates)] += 1
        if len(candidates) == 1:
            result[point] = candidates[0][0]
            displacement.append(candidates[0][1])

    facts = {
        "radiusProviderUnits": MAX_PROVIDER_DRIFT,
        "originalUniquePositions": len(source), "segmentedUniquePositions": len(segmented),
        "exactProviderPositions": len(source & segmented),
        "uniqueMatches": len(result), "unmatchedPositions": ambiguity[0],
        "ambiguousPositions": len(segmented)-ambiguity[0]-ambiguity[1],
        "maxDisplacementProviderUnits": max(displacement, default=None),
        "rmsDisplacementProviderUnits": (math.sqrt(sum(v*v for v in displacement)/len(displacement))
                                         if displacement else None),
    }
    return result, facts


def append_accessor(doc, payload, kind, component, values, target):
    payload.extend(bytes(-len(payload) % 4))
    offset = len(payload)
    fmt = struct.Struct("<" + SCALAR[component]*ARITY[kind])
    for value in values:
        payload.extend(fmt.pack(*value))
    view = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload)-offset, "target": target})
    row = {"bufferView": view, "componentType": component, "count": len(values), "type": kind}
    if kind == "VEC3" and component == 5126:
        row["min"] = [min(item[axis] for item in values) for axis in range(3)]
        row["max"] = [max(item[axis] for item in values) for axis in range(3)]
    index = len(doc["accessors"])
    doc["accessors"].append(row)
    return index


def encode_glb(doc, payload):
    doc["buffers"][0]["byteLength"] = len(payload)
    encoded = json.dumps(doc, separators=(",", ":"), allow_nan=False, ensure_ascii=False).encode()
    encoded += b" " * (-len(encoded) % 4)
    payload += bytes(-len(payload) % 4)
    return (struct.pack("<4sIII", b"glTF", 2, 28+len(encoded)+len(payload), len(encoded))
            + struct.pack("<I", JSON_CHUNK) + encoded
            + struct.pack("<II", len(payload), BIN_CHUNK) + payload)


def bounds(points):
    return [[min(p[axis] for p in points) for axis in range(3)], [max(p[axis] for p in points) for axis in range(3)]]


def topology(faces):
    neighbors = defaultdict(set)
    edges = Counter()
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):
            neighbors[a].add(b)
            neighbors[b].add(a)
            edges[tuple(sorted((a,b)))] += 1
    unseen = set(neighbors)
    components = 0
    while unseen:
        queue = [unseen.pop()]
        while queue:
            next_points = neighbors[queue.pop()] & unseen
            unseen.difference_update(next_points)
            queue.extend(next_points)
        components += 1
    return {"vertexConnectedComponents": components, "boundaryEdges": sum(count == 1 for count in edges.values()),
            "internalNonManifoldEdges": sum(count > 2 for count in edges.values())}


def bind(segmented, primitives, mapping, catalog, donor):
    doc = copy.deepcopy(segmented.doc)
    payload = bytearray(segmented.payload)
    node_names = defaultdict(list)
    for node in doc["nodes"]:
        if "mesh" in node:
            node_names[node["mesh"]].append(node["name"])
    if set(node_names) != set(range(len(primitives))) or any(len(names)!=1 for names in node_names.values()):
        raise BatchError("Provider mesh parts require unique scene node ownership")
    if len({name for names in node_names.values() for name in names}) != len(primitives):
        raise BatchError("Provider part names are not unique")

    used = set()
    reports = []
    expected_parts = []
    for index,(positions,normals,_,faces) in enumerate(primitives):
        primitive = doc["meshes"][index]["primitives"][0]
        dest, reference_faces = {}, []
        out_pos, out_norm, out_uv, out_indices = [],[],[],[]
        for face in faces:
            restored = tuple(mapping[positions[vertex]] for vertex in face)
            key = tuple(sorted(restored))
            if key in used or key not in catalog or catalog[key][0] != orientation(restored):
                raise BatchError(f"Part {node_names[index][0]} changes winding, repeats or lacks a source face")
            used.add(key)
            reference_faces.append(restored)
            uv_by_corner = donor[key][1]
            for vertex, point in zip(face,restored):
                uv = uv_by_corner[point]
                corner_key = (vertex,uv)
                if corner_key not in dest:
                    dest[corner_key] = len(out_pos)
                    out_pos.append(point)
                    out_norm.append(normals[vertex])
                    out_uv.append(uv)
                out_indices.append((dest[corner_key],))
        primitive["attributes"] = {
            "POSITION": append_accessor(doc,payload,"VEC3",5126,out_pos,34962),
            "NORMAL": append_accessor(doc,payload,"VEC3",5126,out_norm,34962),
            "TEXCOORD_0": append_accessor(doc,payload,"VEC2",5126,out_uv,34962),
        }
        primitive["indices"] = append_accessor(doc,payload,"SCALAR",5123 if len(out_pos)<=65536 else 5125,out_indices,34963)
        expected_parts.append((out_pos,out_norm,out_uv,[tuple(value[0] for value in out_indices[i:i+3])
                                                       for i in range(0,len(out_indices),3)]))
        reports.append({
            "partId": node_names[index][0], "meshName": doc["meshes"][index]["name"],
            "providerMaterialIndex": primitive.get("material"), "triangles": len(faces),
            "providerVertices": len(positions), "derivedVertices": len(out_pos),
            "restoredBounds": bounds(out_pos), **topology(reference_faces),
        })
    if used != set(catalog):
        raise BatchError("Provider parts do not cover every approved face exactly once")
    return encode_glb(doc,payload), reports, expected_parts


def blender_triangles(path, part_count):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.gltf(filepath=str(path)) != {"FINISHED"}:
        raise BatchError("Blender glTF import failed")
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != part_count:
        raise BatchError("Blender imported an unexpected number of part meshes")
    return np.concatenate([triangles(obj) for obj in objects],axis=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-id", required=True)
    for argument in ("original", "segmented", "uv-donor", "output"):
        parser.add_argument("--"+argument, type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    if bpy.app.version[:2] != (5,3) or args.output.resolve().is_relative_to(repo_root()):
        raise BatchError("Use Blender 5.3 and a fresh private output directory outside Git")
    sources = [path.resolve(strict=True) for path in (args.original,args.segmented,args.uv_donor)]
    hashes = [sha256_file(path) for path in sources]
    ledger = json.loads((repo_root()/"specs/pet-arena/campaign-v4-content.json").read_text())
    item = ledger["meshCandidates"][args.asset_id]
    segmented_record = item["segmentedExport"]
    if item["ownerSilhouetteReview"] != "keep-for-mesh-processing" or hashes != [
            item["glbSha256"],segmented_record["glbSha256"],item["localUvCandidate"]["glbSha256"]]:
        raise BatchError("Input bytes do not match the recorded owner-reviewed lineage")
    original, segmented, donor = [Glb(path) for path in sources]
    original_primitives = list(original.primitives(uv=False))
    segmented_primitives = list(segmented.primitives(uv=False))
    donor_primitives = list(donor.primitives(uv=True))
    source_faces = exact_faces(original_primitives)
    donor_faces = exact_faces(donor_primitives)
    if (source_faces.keys()!=donor_faces.keys() or any(row[0]!=donor_faces[key][0] for key,row in source_faces.items())
            or len(source_faces)!=item["triangles"] or len(segmented_primitives)!=segmented_record["meshParts"]):
        raise BatchError("UV donor or provider segmentation does not match the recorded surface contract")

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    source_points = {point for positions,_,_,_ in original_primitives for point in positions}
    segmented_points = {point for positions,_,_,_ in segmented_primitives for point in positions}
    mapping, proximity = spatial_correspondence(source_points,segmented_points)
    report = {
        "assetId": args.asset_id, "blender": bpy.app.version_string,
        "originalSha256": hashes[0], "segmentedSha256": hashes[1], "uvDonorSha256": hashes[2],
        "segmentationOperationId": segmented_record["operationId"], "newCreditsSpent": 0,
        "proximity": proximity, "originalBoundsYUp": bounds(source_points), "providerSegmentedBoundsYUp": bounds(segmented_points),
        "releaseState": "draft-only", "unityAdmission": False,
    }
    try:
        if set(mapping) != segmented_points or set(mapping.values()) != source_points:
            raise BatchError("Unmatched or ambiguous coordinate correspondence")
        encoded, parts, expected = bind(segmented,segmented_primitives,mapping,source_faces,donor_faces)
        deliverable = output/(args.asset_id+"-segmented-uv.glb")
        deliverable.write_bytes(encoded)
        reloaded = Glb(deliverable)
        actual = list(reloaded.primitives(uv=True))
        if (actual != expected or reloaded.doc["nodes"] != segmented.doc["nodes"]
                or reloaded.doc["scenes"] != segmented.doc["scenes"]
                or reloaded.doc.get("materials") != segmented.doc.get("materials")
                or not reloaded.payload.startswith(segmented.payload)):
            raise BatchError("Reopened GLB did not preserve parts, original payload or exact restored attributes")
        original_triangles = blender_triangles(sources[0],len(original_primitives))
        exported_triangles = blender_triangles(deliverable,len(segmented_primitives))
        views, _ = compare_views(original_triangles,exported_triangles,output)
        if any(view["changedPixels"] for view in views.values()):
            raise BatchError("Actual reimported silhouettes differ from the owner-approved original")
        if [sha256_file(path) for path in sources] != hashes:
            raise BatchError("An original source changed during integration")
        report.update({
            "classification": "PRIVATE_SEGMENTED_UV_REVIEW",
            "restoredGroundedPivotYUp": [0,0,0], "exactOrientedFaceCoverage": len(source_faces),
            "derivedFile": deliverable.name, "derivedSha256": sha256_file(deliverable),
            "derivedBytes": deliverable.stat().st_size, "providerPartCount": len(parts),
            "providerMaterialBindings": sum(part["providerMaterialIndex"] is not None for part in parts),
            "originalProviderBinaryPrefixPreserved": True, "parts": parts, "silhouette": views,
        })
    except BatchError as error:
        report.update({"classification": "PRIVATE_REVIEW_NEEDS_CORRECTION", "reason": str(error)})
        raise
    finally:
        (output/"segmented-uv-review.json").write_text(json.dumps(report,indent=2)+"\n")


if __name__ == "__main__":
    main()
