"""Build a private skin-weight trial for the measured Icarus front ornament.

Use the original Charakuru VRM, 32 captured Body samples from the corrected
walk, and its four exact camera samples. The private output directory receives
the derivative and a receipt. Reuse the original VRM to roll back the trial.

Supply original.bin from IcarusLayerSurfaceExport and exact-poses.bin from
the matched four-frame Body readback. Both inputs are pinned below.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from icarus_pelvis_weights import (
    SOURCE_SHA,
    edge_stretch,
    facts,
    fit_rigid_poses,
    read_poses,
    stream,
    unique_edges,
    verify_hash,
)


DENSE_SHA = "fc3d6f0bd88750a0f811873234c753457609a2a318c5b07bdd3b761fe3618d70"
EXACT_SHA = "0b6a87b4aae494ef9853cc3dbbe75454030583a79e49793306c44f8b10833aef"
WALK_SHA = "44a08db1ae92bb4093be2d8cfccded2a65b86ac42803fc5160beb1ddd607a251"
WITNESSES = (5965, 6032)
CAMERA_FRACTIONS = (.1, .35, .6, .85)
THIGH_RETENTION = 0.10


def ornament_component(positions, triangles):
    # Include every UV seam copy at the same rest-space position.
    _, welded = np.unique(positions.astype("<f4").round(5), axis=0, return_inverse=True)
    welded = welded.reshape(-1)
    parents = list(range(welded.max() + 1))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for a, b, c in welded[triangles]:
        parents[root(b)] = root(a)
        parents[root(c)] = root(a)
    anchor = root(welded[triangles[WITNESSES[0], 0]])
    vertices = np.flatnonzero([root(index) == anchor for index in welded])
    face_ids = np.flatnonzero(np.isin(triangles, vertices).all(axis=1))
    if ((len(vertices), len(np.unique(welded[vertices])), len(face_ids)) != (399, 328, 620)
            or not np.isin(WITNESSES, face_ids).all()):
        raise ValueError("Expected the measured 399-slot front ornament component")
    return vertices, face_ids, welded[vertices]


def read_exact_renderers(path, renderer_sizes):
    samples = {name: [] for name in renderer_sizes}
    with path.open("rb") as capture:
        for _ in CAMERA_FRACTIONS:
            for _ in range(11):
                count, = struct.unpack("<i", capture.read(4))
                values = np.fromfile(capture, "<f4", 3 * count).reshape(count, 3)
                name = capture.read(ord(capture.read(1))).decode()
                if name in samples:
                    samples[name].append(values)
        if capture.read(1) or any(np.shape(samples[name]) != (len(CAMERA_FRACTIONS), size, 3)
                                for name, size in renderer_sizes.items()):
            raise ValueError("Unexpected exact camera pose capture")
    return {name: np.asarray(values, dtype=float) for name, values in samples.items()}


def bone_weights(joints, weights, bones):
    return np.column_stack([np.sum(weights * (joints == bone), axis=1) for bone in bones])


def fit_ornament(positions, joints, weights, poses, bones, vertices):
    points = np.column_stack((positions, np.ones(len(positions))))
    rigid = [fit_rigid_poses(points, joints, weights, bone, poses) for bone in bones[:3]]
    transforms, errors = map(list, zip(*rigid, strict=True))
    support = bone_weights(joints, weights, bones)

    # The lower Body has only three spine-only anchors. Mixed hips/spine
    # rows provide a full-rank fit after subtracting the fitted hips support.
    hips, _, _, spine = support.T
    mixed = (spine > .2) & (np.abs(hips + spine - 1) < 2e-7)
    design = points[mixed] * spine[mixed, None]
    measured = poses[:, mixed] - (points[mixed] @ transforms[0]) * hips[mixed, None]
    rows = measured.transpose(1, 0, 2).reshape(len(design), -1)
    result, _, rank, _ = np.linalg.lstsq(design, rows, rcond=None)
    spine_error = pose_error((design @ result).reshape(len(design), len(poses), 3).transpose(1, 0, 2),
                             measured)
    if rank != 4 or spine_error > .00002:
        raise ValueError("Mixed spine anchors do not reproduce the Unity pose")
    transforms.append(result.reshape(4, len(poses), 3).transpose(1, 0, 2))
    errors.append(spine_error)
    modeled = np.stack([points[vertices] @ t for t in transforms], axis=2)
    return support[vertices], modeled, errors


def pose_error(actual, expected):
    return float(np.max(np.linalg.norm(actual - expected, axis=-1)))


def edit_weights(source, vertices, joint_offsets, weight_offsets, joints, weights, bones):
    hips, left, right, _ = bones
    derivative = bytearray(source)
    edited = []
    for vertex in vertices:
        joint_row = joints[vertex]
        weight_row = weights[vertex]
        thigh_slots = (weight_row > 0.) & np.isin(joint_row, [left, right])
        if not np.any(thigh_slots):
            continue
        hip_slots = np.flatnonzero((joint_row == hips) & (weight_row > 0.))
        hip_slot = hip_slots[0] if len(hip_slots) else np.flatnonzero(weight_row == 0.)[0]
        changed_joints = joint_row.copy()
        changed_weights = weight_row.copy()
        changed_joints[hip_slot] = hips
        moved = weight_row[thigh_slots] * (1. - THIGH_RETENTION)
        changed_weights[thigh_slots] -= moved
        changed_weights[hip_slot] += moved.sum()
        struct.pack_into("<4B", derivative, joint_offsets[vertex], *changed_joints)
        struct.pack_into("<4f", derivative, weight_offsets[vertex], *changed_weights)
        edited.append(int(vertex))

    # Restoring these exact records must reconstruct the entire owner source.
    restored = bytearray(derivative)
    for vertex in edited:
        for offset, width in [(joint_offsets[vertex], 4), (weight_offsets[vertex], 16)]:
            restored[offset:offset + width] = source[offset:offset + width]
    if len(edited) != 298 or restored != source:
        raise ValueError("Patched data escaped the measured skin-weight records")
    return derivative, edited


def verify_seams(weights, welded):
    for index in np.unique(welded):
        if np.ptp(weights[welded == index], axis=0).max() > 2e-7:
            raise ValueError("Seam copies have inconsistent bone support")


def face_normals(points, faces):
    a, b, c = np.moveaxis(points[..., faces, :], -2, 0)
    return np.cross(b - a, c - a)


def strain(positions, faces, posed, hip_reference, face_ids):
    edges, rest_lengths = unique_edges(faces, positions)
    stretch = facts(edge_stretch(posed, edges, rest_lengths))
    normals = face_normals(posed, faces)
    rest_areas = np.linalg.norm(face_normals(positions, faces), axis=-1)
    if np.any(rest_areas <= 0.):
        raise ValueError("Expected nondegenerate ornament triangles")
    areas = np.linalg.norm(normals, axis=-1) / rest_areas
    reversed_faces = np.sum(normals * face_normals(hip_reference, faces), axis=-1) < 0.
    witness_frame = len(areas) - len(CAMERA_FRACTIONS) + CAMERA_FRACTIONS.index(.35)
    camera_area = areas[witness_frame, np.isin(face_ids, WITNESSES)]
    return dict(stretch, maximumTriangleAreaRatio=float(np.max(areas)),
                reversedTriangleFrameSamples=int(np.count_nonzero(reversed_faces)),
                witnessAreaRatiosAt35Percent=dict(zip(WITNESSES, camera_area.tolist(), strict=True)))


def build(source, dense_path, exact_path, output):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("Expected the original owner-designated Icarus VRM")
    verify_hash(dense_path, DENSE_SHA)
    verify_hash(exact_path, EXACT_SHA)
    unity_thighs, dense = read_poses(dense_path)
    exact = read_exact_renderers(exact_path, {"Body": 23922})["Body"]
    if dense.shape != (32, 23922, 3):
        raise ValueError("Expected the original dense walk capture")

    size, = struct.unpack_from("<I", data, 12)
    doc = json.loads(data[20:20 + size])
    binary = 28 + size
    body, = [node for node in doc["nodes"] if node.get("name") == "Body" and "mesh" in node]
    lower, upper = doc["meshes"][body["mesh"]]["primitives"]
    if doc["materials"][lower["material"]]["name"] != "Material_lower_body":
        raise ValueError("Expected Body primitive 0")
    names = [doc["nodes"][index]["name"] for index in doc["skins"][body["skin"]]["joints"]]
    bones = [names.index(name) for name in ("hips", "upper_leg.L", "upper_leg.R", "spine")]
    _, positions = stream(data, doc, binary, lower, "POSITION", "<3f", 5126)
    _, upper_positions = stream(data, doc, binary, upper, "POSITION", "<3f", 5126)
    joint_offsets, joints = stream(data, doc, binary, lower, "JOINTS_0", "<4B", 5121)
    weight_offsets, weights = stream(data, doc, binary, lower, "WEIGHTS_0", "<4f", 5126)
    _, triangle_slots = stream(data, doc, binary, {"attributes": lower}, "indices", "<H", 5123)
    triangles = triangle_slots.reshape(-1, 3)
    if (len(positions) + len(upper_positions) != dense.shape[1]
            or unity_thighs.max() >= len(positions)):
        raise ValueError("Original Body vertex order differs from the Unity samples")
    vertices, face_ids, welded = ornament_component(positions, triangles)
    faces = np.searchsorted(vertices, triangles[face_ids])
    if not np.isin(joints[vertices][weights[vertices] > 0.], bones).all():
        raise ValueError("Unexpected front ornament bone influence")

    poses = np.concatenate((dense, exact))[:, :len(positions)]
    support, modeled, errors = fit_ornament(positions, joints, weights, poses, bones, vertices)
    verify_seams(support, welded)
    baseline = poses[:, vertices]
    original_error = pose_error(np.sum(modeled * support[None, :, :, None], axis=2), baseline)
    if original_error > .00002:
        raise ValueError(f"Original ornament reconstruction error exceeds 20 μm: {original_error}")

    derivative, edited = edit_weights(data, vertices, joint_offsets, weight_offsets, joints, weights, bones)
    _, candidate_joints = stream(derivative, doc, binary, lower, "JOINTS_0", "<4B", 5121)
    _, candidate_weights = stream(derivative, doc, binary, lower, "WEIGHTS_0", "<4f", 5126)
    updated = bone_weights(candidate_joints[vertices], candidate_weights[vertices], bones)
    verify_seams(updated, welded)
    if (not np.allclose(updated.sum(axis=1), 1., atol=2e-7, rtol=0.)
            or not np.array_equal(updated[:, 3], support[:, 3])
            or not np.allclose(updated[:, 1:3], support[:, 1:3] * THIGH_RETENTION, atol=1e-8, rtol=0.)):
        raise ValueError("Candidate bone support failed normalization or transfer validation")
    predicted = baseline + np.sum(modeled * (updated - support)[None, :, :, None], axis=2)
    original, candidate = [
        strain(positions[vertices], faces, posed, modeled[:, :, 0], face_ids)
        for posed in (baseline, predicted)
    ]
    if (original["edgesAboveDoubleRestLength"] == 0 or candidate["edgesAboveDoubleRestLength"] != 0
            or candidate["maximumTriangleAreaRatio"] > 1.3
            or candidate["reversedTriangleFrameSamples"] != 0
            or max(candidate["witnessAreaRatiosAt35Percent"].values()) > 1.3):
        raise ValueError(f"Measured walk strain did not qualify: {original} -> {candidate}")

    receipt = json.dumps({
        "sourceSha256": SOURCE_SHA,
        "candidateSha256": hashlib.sha256(derivative).hexdigest(),
        "walkSha256": WALK_SHA,
        "denseUnityPoseSha256": DENSE_SHA,
        "exactUnityPoseSha256": EXACT_SHA,
        "samples": {"evenWalk": len(dense), "cameraFractions": CAMERA_FRACTIONS},
        "scope": {"mesh": "Body", "primitive": 0, "componentVertexSlots": len(vertices),
                  "componentWeldedPositions": len(np.unique(welded)), "componentTriangles": len(faces),
                  "sourceVertexIdsChanged": edited},
        "thighWeightRetention": THIGH_RETENTION,
        "jointPoseFitMaximumErrorsMeters": dict(zip((names[bone] for bone in bones), errors, strict=True)),
        "originalOrnamentReconstructionErrorMeters": original_error,
        "maximumPredictedVertexDeltaMeters": pose_error(predicted, baseline),
        "originalUnitySamples": original,
        "candidatePredictionFromMeasuredPoses": candidate,
        "restoringPatchedRowsRecoversExactSource": True,
        "unityCandidateReimported": False,
        "release": "DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC",
    }, indent=2) + "\n"
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    (output / "Icarus-InnerHemReview.vrm").write_bytes(derivative)
    (output / "inner-hem-weights.json").write_text(receipt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dense-poses", type=Path, required=True)
    parser.add_argument("--exact-poses", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.dense_poses, args.exact_poses, args.output)
