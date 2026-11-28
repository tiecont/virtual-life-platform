"""Build a private Icarus ribbon clearance trial on the accepted center trim.

Use the exact center-corrected derivative and the four-camera original pose
capture. The output directory receives a new VRM and a scope receipt.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from icarus_inner_hem_weights import EXACT_SHA, bone_weights, pose_error, read_exact_renderers
from icarus_pelvis_weights import fit_rigid_poses, stream, verify_hash
from icarus_skirt_local_clearance import smooth


CENTER_SHA = "e54ef256c89a87e154bf1bb58088d9691a2f2ed31241f001506951bd495752e1"
MIRROR_X = np.array([-1., 1., 1.])
MAX_TRANSFER = .25
FRONT_WITNESSES = {
    "R": ("Spring_08_ribbon_right", 2134, (1479, 1484, 1486, 1490, 2548, 2554, 1449)),
    "L": ("Spring_07_ribbon_left", 2007, (238, 240, 243, 245, 246, 257, 258)),
}


def skin_streams(data, doc, binary, node):
    primitive = doc["meshes"][node["mesh"]]["primitives"][0]
    names = [doc["nodes"][index]["name"] for index in doc["skins"][node["skin"]]["joints"]]
    _, positions = stream(data, doc, binary, primitive, "POSITION", "<3f", 5126)
    _, joints = stream(data, doc, binary, primitive, "JOINTS_0", "<4B", 5121)
    offsets, weights = stream(data, doc, binary, primitive, "WEIGHTS_0", "<4f", 5126)
    _, indices = stream(data, doc, binary, {"attributes": primitive}, "indices", "<H", 5123)
    return positions, indices.reshape(-1, 3), names, joints, weights, offsets


def transfer_mask(positions, witnesses):
    # Weight changes fade over the witness neighbourhood. Duplicate positions
    # get the same value so both UV seam copies move together.
    near = np.linalg.norm(positions[:, None] - witnesses[None, :], axis=-1).min(axis=1)
    blend = 1. - smooth((near - .014) / .032)
    _, welded = np.unique(positions.astype("<f4").round(5), axis=0, return_inverse=True)
    welded = welded.reshape(-1)
    mask = np.ones(welded.max() + 1)
    np.minimum.at(mask, welded, blend)
    return mask[welded], welded


def model_ribbon(side, points, support, names, exact_pose, fits):
    modeled = {
        index: points @ fits[bone]
        for index, bone in enumerate(names)
        if bone in fits
    }
    residual = exact_pose - sum(positions * support[:, index, None] for index, positions in modeled.items())
    unknown = [index for index in range(len(names)) if index not in modeled]
    design = np.column_stack([points * support[:, index, None] for index in unknown])
    target = residual.transpose(1, 0, 2).reshape(len(points), -1)
    result, _, rank, _ = np.linalg.lstsq(design, target, rcond=None)
    if rank != design.shape[1]:
        raise ValueError("Ribbon influence transforms could not be isolated")
    for index, matrix in zip(unknown, np.split(result, len(unknown)), strict=True):
        modeled[index] = points @ matrix.reshape(4, len(exact_pose), 3).transpose(1, 0, 2)
    reconstructed = sum(positions * support[:, index, None] for index, positions in modeled.items())
    original_error = pose_error(reconstructed, exact_pose)
    root = modeled[names.index(f"ribbon_{side}_0")]
    root_error = pose_error(root, points @ fits["hips"])
    if max(original_error, root_error) > .00002:
        raise ValueError("Pinned spring-off ribbon skin fit exceeded 20 µm")
    return modeled[names.index(f"upper_leg.{side}")] - root, original_error, root_error


def build(center, poses_file, output):
    verify_hash(center, CENTER_SHA)
    verify_hash(poses_file, EXACT_SHA)
    data = center.read_bytes()
    size, = struct.unpack_from("<I", data, 12)
    doc = json.loads(data[20:20 + size])
    binary = 28 + size
    nodes = {node["name"]: node for node in doc["nodes"] if "mesh" in node}
    controls = {side: skin_streams(data, doc, binary, nodes[label])
                for side, (label, _, _) in FRONT_WITNESSES.items()}
    frames = read_exact_renderers(poses_file, {"Body": 23922, **{
        label: size for label, size, _ in FRONT_WITNESSES.values()
    }})
    positions, _, names, joints, weights, _ = skin_streams(data, doc, binary, nodes["Body"])
    points = np.column_stack((positions, np.ones(len(positions))))
    body = frames["Body"][:, :len(positions)]
    fits = {bone: fit_rigid_poses(points, joints, weights, names.index(bone), body)[0]
            for bone in ("hips", "upper_leg.R", "upper_leg.L")}
    witnesses = {
        side: positions[np.unique(faces[list(FRONT_WITNESSES[side][2])])]
        for side, (positions, faces, *_) in controls.items()
    }

    derivative = bytearray(data)
    touched_offsets = []
    reports = {}
    for side, mirror in (("R", "L"), ("L", "R")):
        label, _, face_ids = FRONT_WITNESSES[side]
        positions, _, names, joints, weights, offsets = controls[side]
        bilateral_witnesses = np.concatenate((witnesses[side], witnesses[mirror] * MIRROR_X))
        blend, welded = transfer_mask(positions, bilateral_witnesses)
        root, thigh = names.index(f"ribbon_{side}_0"), names.index(f"upper_leg.{side}")
        root_slot = (joints == root) & (weights > 0.)
        thigh_slot = (joints == thigh) & (weights > 0.)
        active = np.unique(joints[weights > 0.])
        support = bone_weights(joints, weights, active)
        delta, fit_error, root_error = model_ribbon(
            side, np.column_stack((positions, np.ones(len(positions)))), support,
            [names[index] for index in active], frames[label], fits
        )
        root_weight = np.sum(weights * root_slot, axis=1)
        move = np.minimum(root_weight, MAX_TRANSFER * blend * np.minimum(root_weight / .12, 1.))
        affected = np.flatnonzero(move > 1e-7)
        if (len(affected) != (165 if side == "R" else 152)
                or not np.all(np.sum(root_slot[affected], axis=1) == 1)
                or not np.all(np.sum(thigh_slot[affected], axis=1) == 1)):
            raise ValueError("The local witness patch lacks the expected bone slots")
        updated = (weights - root_slot * move[:, None] + thigh_slot * move[:, None]).astype("<f4")
        if np.min(updated) < 0. or not np.allclose(updated[affected].sum(axis=1), 1., atol=2e-7, rtol=0.):
            raise ValueError("Ribbon transfer changed normalized weight mass")
        for index in np.unique(welded[affected]):
            copies = welded == index
            if np.ptp(move[copies]) > 2e-7:
                raise ValueError("Ribbon transfer split a weld seam")
        for vertex in affected:
            offset = offsets[vertex]
            struct.pack_into("<4f", derivative, offset, *updated[vertex])
            touched_offsets.append(offset)
        displacement = delta * move[:, None]
        peak = float(np.linalg.norm(displacement, axis=-1).max())
        if peak > .021:
            raise ValueError("The local patch exceeded the measured 21 mm displacement bound")
        reports[label] = {
            "changedVertexIds": affected.tolist(),
            "witnessFaceIds": face_ids,
            "maximumPredictedDisplacementMeters": peak,
            "originalPoseFitMaximumErrorMeters": fit_error,
            "ribbonRootToHipsMaximumDifferenceMeters": root_error,
        }

    restored = bytearray(derivative)
    for offset in touched_offsets:
        restored[offset:offset + 16] = data[offset:offset + 16]
    if restored != data:
        raise ValueError("The derived VRM changed bytes outside local ribbon weights")
    receipt = json.dumps({
        "centerCorrectionSha256": CENTER_SHA,
        "candidateSha256": hashlib.sha256(derivative).hexdigest(),
        "exactUnityPoseSha256": EXACT_SHA,
        "maxWeightMovedFromRibbonRootToMatchingThigh": MAX_TRANSFER,
        "localWitnessFalloffMeters": [.014, .046],
        "scope": reports,
        "restoringPatchedRowsRecoversExactCenterCorrection": True,
        "unityCandidateReimported": False,
        "release": "DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC",
    }, indent=2) + "\n"
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    (output / "Icarus-RibbonClearanceReview.vrm").write_bytes(derivative)
    (output / "ribbon-clearance.json").write_text(receipt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--center-correction", type=Path, required=True)
    parser.add_argument("--exact-poses", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.center_correction, args.exact_poses, args.output)
