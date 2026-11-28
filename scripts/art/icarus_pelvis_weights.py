"""Correct a localized opposing-thigh weight jump in the original Icarus VRM.

Use actual posed Body vertices exported by IcarusLayerSurfaceExport. Only
a small pelvis seam can redistribute support among the original hips and thighs.
The output retains the exact topology, materials, skin, bindpose and textures.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from icarus_chin_weights import SOURCE_SHA


def verify_hash(path, expected):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError(f"Unexpected source fingerprint for {path.name}")


def read_poses(path):
    with path.open("rb") as handle:
        def integer():
            return struct.unpack("<i",handle.read(4))[0]

        if integer()!=0x314C4349:
            raise ValueError("Expected the original Unity Icarus layer export")
        surfaces = []
        for _ in range(3):
            vertices, indices = integer(), integer()
            if not (0 < vertices < 100000 and 0 < indices < 1000000 and indices%3==0):
                raise ValueError("Unexpected posed layer size")
            faces = np.fromfile(handle,"<i4",indices).reshape(-1,3)
            if faces.min()<0 or faces.max()>=vertices:
                raise ValueError("Unexpected posed layer indices")
            surfaces.append((vertices,faces))
        count = integer()
        if not 16<=count<=120:
            raise ValueError("Missing dense Unity walk measurements")
        poses = []
        for _ in range(count):
            frame = [np.fromfile(handle,"<f4",size*3).reshape(size,3) for size,_ in surfaces]
            if not np.array_equal(frame[0],frame[1]):
                raise ValueError("Arm and leg measurements did not share the same baked Body")
            poses.append(frame[1])
        if handle.read(1):
            raise ValueError("Unexpected trailing pose measurements")
    return surfaces[1][1],np.asarray(poses,dtype=float)


def stream(data,doc,binary,primitive,name,layout,kind):
    row = doc["accessors"][primitive["attributes"][name]]
    view = doc["bufferViews"][row["bufferView"]]
    if row["componentType"]!=kind or row.get("sparse") or row.get("normalized"):
        raise ValueError(f"Unexpected original {name} layout")
    fmt = struct.Struct(layout)
    start = binary+view.get("byteOffset",0)+row.get("byteOffset",0)
    stride = view.get("byteStride",fmt.size)
    offsets = [start+index*stride for index in range(row["count"])]
    return offsets,np.asarray([fmt.unpack_from(data,offset) for offset in offsets])


def unique_edges(faces,positions):
    edges = np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
    rest = np.linalg.norm(positions[edges[:,0]]-positions[edges[:,1]],axis=1)
    return edges[rest>=.002],rest[rest>=.002]


def fit_rigid_poses(points,indices,weights,bone,poses):
    chosen = np.any((indices==bone)&(weights>.99999),axis=1)
    if np.count_nonzero(chosen)<12:
        raise ValueError("Insufficient single-joint measured vertices")
    design = points[chosen]
    fits = []
    errors = []
    for frame in poses:
        transform, _, rank, _ = np.linalg.lstsq(design,frame[chosen],rcond=None)
        error = float(np.max(np.linalg.norm(design@transform-frame[chosen],axis=1)))
        if rank!=4 or error>.00002:
            raise ValueError("Bone affine fit did not match the original Unity skin")
        fits.append(transform)
        errors.append(error)
    return np.asarray(fits),max(errors)


def ease(value,lower,upper):
    normalized = np.clip((value-lower)/(upper-lower),0,1)
    return normalized*normalized*(3-2*normalized)


def edge_stretch(poses,edges,rest):
    return np.linalg.norm(poses[:,edges[:,0]]-poses[:,edges[:,1]],axis=2)/rest


def facts(stretch):
    peaks = np.max(stretch,axis=0)
    return {
        "maximumLengthRatio": float(np.max(peaks)),
        "p99PerEdgeMaximumLengthRatio": float(np.percentile(peaks,99)),
        "edgesAboveDoubleRestLength": int(np.count_nonzero(peaks>2)),
    }


def build(source,pose_path,pose_sha,output):
    verify_hash(source,SOURCE_SHA)
    verify_hash(pose_path,pose_sha)
    edges_from_unity,poses = read_poses(pose_path)
    data = bytearray(source.read_bytes())
    json_size = struct.unpack_from("<I",data,12)[0]
    doc = json.loads(data[20:20+json_size])
    binary = 28+json_size
    node, = [node for node in doc["nodes"] if node.get("name")=="Body" and "mesh" in node]
    names = [doc["nodes"][index]["name"] for index in doc["skins"][node["skin"]]["joints"]]
    hip = names.index("hips")
    thighs = [names.index("upper_leg.L"),names.index("upper_leg.R")]
    lower,upper = doc["meshes"][node["mesh"]]["primitives"]
    if doc["materials"][lower["material"]]["name"]!="Material_lower_body":
        raise ValueError("Expected the original lower Body material")
    _,positions = stream(data,doc,binary,lower,"POSITION","<3f",5126)
    joint_kind = doc["accessors"][lower["attributes"]["JOINTS_0"]]["componentType"]
    joint_format = {5121:"<4B",5123:"<4H"}[joint_kind]
    joint_offsets,joints = stream(data,doc,binary,lower,"JOINTS_0",joint_format,joint_kind)
    weight_offsets,weights = stream(data,doc,binary,lower,"WEIGHTS_0","<4f",5126)
    _,upper_positions = stream(data,doc,binary,upper,"POSITION","<3f",5126)
    if poses.shape[1]!=len(positions)+len(upper_positions) or edges_from_unity.max()>=len(positions):
        raise ValueError("Posed Unity Body vertex order or material scope does not match the source")
    poses = poses[:,:len(positions),:]
    edges,rest = unique_edges(edges_from_unity,positions)
    stretch = edge_stretch(poses,edges,rest)
    per_edge = stretch.max(axis=0)
    affected = edges[per_edge>2]
    if len(affected)<20:
        raise ValueError("The retained motion lacks the measured pelvic edge discontinuity")
    anchors = positions[np.unique(affected)]
    low,high = anchors.min(axis=0),anchors.max(axis=0)
    if max(abs(low[0]),abs(high[0]))>.03 or not (.76<low[1]<high[1]<.94):
        raise ValueError("High strain exists beyond the measured pelvic seam")

    # Keep the original pelvis support and smooth the abrupt left/right
    # split over this measured seam. Taper toward the actual adjacent vertices.
    x,y,z = positions.T
    transfer_fraction = 1-ease(np.abs(x),.024,.075)
    transfer_fraction *= ease(y,low[1]-.045,low[1]-.005)*(1-ease(y,high[1]+.004,high[1]+.045))
    transfer_fraction *= ease(z,low[2]-.050,low[2]-.005)*(1-ease(z,high[2]+.004,high[2]+.050))
    left_support = ease(x,-.042,.042)
    points = np.column_stack((positions,np.ones(len(positions))))
    transform = {}
    fit_error = {}
    for bone in [hip,*thighs]:
        transform[bone],fit_error[names[bone]] = fit_rigid_poses(points,joints,weights,bone,poses)

    candidate = poses.copy()
    output_bytes = bytearray(data)
    corrected = []
    topology_limited = 0
    connected = [hip,*thighs]
    for vertex in np.flatnonzero(transfer_fraction>0):
        prior = {int(bone):float(value) for bone,value in zip(joints[vertex],weights[vertex]) if value>0}
        group = {bone:prior.get(bone,0.) for bone in connected}
        total = sum(group.values())
        pelvis = max(group[hip],.2*total)
        targets = [pelvis,(total-pelvis)*left_support[vertex],(total-pelvis)*(1-left_support[vertex])]
        updated = {bone:value for bone,value in prior.items() if bone not in connected}
        for bone,target in zip(connected,targets):
            value = group[bone]+(target-group[bone])*transfer_fraction[vertex]
            if value>1e-9:
                updated[bone] = value
        if len(updated)>4:
            topology_limited += 1
            continue
        if all(abs(updated.get(bone,0.)-group[bone])<1e-7 for bone in connected):
            continue
        if abs(sum(updated.values())-sum(prior.values()))>1e-6:
            raise ValueError("Pelvis transfer changed normalized weight mass")
        ids = sorted(updated)
        values = np.asarray([updated[bone] for bone in ids],dtype=np.float32).tolist()
        stored = dict(zip(ids,values))
        struct.pack_into(joint_format,output_bytes,joint_offsets[vertex],*(ids+[0]*(4-len(ids))))
        struct.pack_into("<4f",output_bytes,weight_offsets[vertex],*(values+[0.]*(4-len(values))))
        for bone in thighs:
            difference = transform[bone]-transform[hip]
            change = stored.get(bone,0.)-group[bone]
            candidate[:,vertex] += change*np.einsum("j,fjk->fk",points[vertex],difference)
        corrected.append(vertex)

    before,after = facts(stretch),facts(edge_stretch(candidate,edges,rest))
    if (not corrected or after["maximumLengthRatio"]>=before["maximumLengthRatio"]*.5 or
            after["edgesAboveDoubleRestLength"]>=before["edgesAboveDoubleRestLength"] or
            after["p99PerEdgeMaximumLengthRatio"]>before["p99PerEdgeMaximumLengthRatio"]+.15):
        raise ValueError(f"No qualifying local improvement: {before} -> {after}")
    maximum = np.unravel_index(stretch.argmax(),stretch.shape)
    worst = edges[maximum[1]]
    output.mkdir(parents=True,exist_ok=False)
    deliverable = output/"Icarus-PelvisReview.vrm"
    deliverable.write_bytes(output_bytes)
    (output/"pelvis-weights.json").write_text(json.dumps({
        "sourceSha256": SOURCE_SHA,"candidateSha256": hashlib.sha256(output_bytes).hexdigest(),
        "originalUnityPoseSha256":pose_sha,"changedLowerBodyVertices":len(corrected),
        "skippedFullInfluenceSlots":topology_limited,"observedOutlierBoundsMeters":[low.tolist(),high.tolist()],
        "measuredOriginalWorstEdge": {"indices":worst.tolist(),"frame":int(maximum[0]),
            "restLengthMeters":float(rest[maximum[1]]),"posedLengthMeters":float(rest[maximum[1]]*stretch[maximum])},
        "sampleFrames":len(poses),"comparedEdges":len(edges),"jointPoseFitMaximumErrorMeters":fit_error,
        "original":before,"correctedPredictionFromMeasuredPoses":after,"unityCandidateReimported":False,
        "affectedBoundsMeters":[positions[corrected].min(axis=0).tolist(),positions[corrected].max(axis=0).tolist()],
        "scope":"Private continuity weights for the original hips/thighs on the measured lower Body seam",
    },indent=2)+"\n")


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--poses",type=Path,required=True)
    parser.add_argument("--pose-sha256",required=True)
    parser.add_argument("--output",type=Path,required=True)
    args = parser.parse_args()
    build(args.source,args.poses,args.pose_sha256,args.output)
