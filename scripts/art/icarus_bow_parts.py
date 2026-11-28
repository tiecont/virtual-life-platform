"""Rebind Tripo's 46 bow parts to the exact original textured surface."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bind_reviewed_pet_segments import (
    BIN_CHUNK, JSON_CHUNK, Glb, append_accessor, blender_triangles, bounds, encode_glb, orientation,
    spatial_correspondence,
)
from blender_normalize_r2_batch import BatchError, repo_root, sha256_file
from blender_normalize_reviewed_pet import compare_views


ORIGINAL = "8384d2be36fe9abf8c439503a4c478b80489e2d89ff84812091b787c2bc18e25"
SEGMENTED = "8424dedcab68921e8afeb9fa57ac73d908a16226d61781dbc9d595824994cb43"


class TexturedGlb(Glb):
    def __init__(self,path):
        data=path.read_bytes()
        magic,version,length,json_size,json_type=struct.unpack_from("<4sIIII",data)
        start=20+json_size
        bin_size,bin_type=struct.unpack_from("<II",data,start)
        if (magic,version,length,json_type,bin_type,start+8+bin_size)!=(
                b"glTF",2,len(data),JSON_CHUNK,BIN_CHUNK,len(data)):
            raise BatchError("Expected a closed textured GLB v2 asset")
        self.doc=json.loads(data[20:start])
        self.payload=data[start+8:]
        buffers=self.doc["buffers"]
        if len(buffers)!=1 or "uri" in buffers[0] or not 0<=len(self.payload)-buffers[0]["byteLength"]<4:
            raise BatchError("Expected one embedded binary asset")
        if any(self.doc.get(key) for key in ("extensionsRequired","animations","skins")):
            raise BatchError("Bow part binding requires static uncompressed inputs")
        if any(set(node)&{"matrix","rotation","translation","scale","skin"} for node in self.doc["nodes"]):
            raise BatchError("Unexpected provider object-space transform")
        if any("bufferView" not in image or "uri" in image for image in self.doc["images"]):
            raise BatchError("Bow textures must be embedded in the pinned GLBs")

    def image_hashes(self):
        hashes=[]
        for image in self.doc["images"]:
            view=self.doc["bufferViews"][image["bufferView"]]
            begin=view.get("byteOffset",0)
            hashes.append(hashlib.sha256(self.payload[begin:begin+view["byteLength"]]).hexdigest())
        return hashes


def original_string(positions,faces):
    # Indexed connectivity preserves the four separate provider strips across
    # the bow axis and does not accidentally select the adjacent tip or limb.
    neighbors=defaultdict(set)
    used=set()
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):
            neighbors[a].add(b)
            neighbors[b].add(a)
            used.add(a)
    strips=[]
    while used:
        group={used.pop()}
        pending=list(group)
        while pending:
            added=neighbors[pending.pop()]&used
            used.difference_update(added)
            group.update(added)
            pending.extend(added)
        low,high=bounds([positions[index] for index in group])
        width,height,depth=[b-a for a,b in zip(low,high)]
        if width<.005 and depth<.01 and height>.35 and high[2]<-.07:
            strips.append((group,low,high))

    if len(strips)!=4 or any(len(group)!=10 for group,_,_ in strips):
        raise BatchError("Expected the four original topological string strips")
    string_faces={index for index,face in enumerate(faces) if any(set(face)<=group for group,_,_ in strips)}
    if len(string_faces)!=32:
        raise BatchError("The original string did not retain its exact triangle count")
    view=[{"vertices":len(group),"boundsYUp":[low,high]} for group,low,high in strips]
    return string_faces,view


def source_face_map(positions,faces):
    result={}
    for index,face in enumerate(faces):
        geometry=tuple(positions[i] for i in face)
        key=tuple(sorted(geometry))
        if len(set(geometry))!=3 or key in result:
            raise BatchError("Source bow contains ambiguous coincident faces")
        result[key]=(index,orientation(geometry))
    return result


def partitions(provider,original_positions,original_faces):
    provider_meshes=list(provider.primitives(uv=True))
    part_names={node["mesh"]:node["name"] for node in provider.doc["nodes"] if "mesh" in node}
    if len(provider_meshes)!=46 or set(part_names)!=set(range(46)) or len(set(part_names.values()))!=46:
        raise BatchError("The exact provider export must retain 46 unique part IDs")
    provider_points={point for positions,_,_,_ in provider_meshes for point in positions}
    source_points=set(original_positions)
    low,high=bounds(source_points)
    provider_low,provider_high=bounds(provider_points)
    if low[1]!=0 or provider_low[1]!=0:
        raise BatchError("Unexpected provider ground reference")
    uniform_scale=high[1]/provider_high[1]
    if not .998 < uniform_scale < 1.002:
        raise BatchError("Unexpected normalization factor for these exact bow sources")
    scaled={point:tuple(value*uniform_scale for value in point) for point in provider_points}
    mapping,proof=spatial_correspondence(source_points,set(scaled.values()))
    if set(mapping)!=set(scaled.values()) or set(mapping.values())!=source_points:
        raise BatchError(f"Ambiguous or unmatched scaled position correspondence: {proof}")
    proof.update({"providerScaleForMatchingOnly":uniform_scale,
                  "providerBoundsYUp":[provider_low,provider_high],"originalBoundsYUp":[low,high]})
    source_keys=source_face_map(original_positions,original_faces)
    touched=set()
    result=[]
    for mesh_index,(vertices,_,_,faces) in enumerate(provider_meshes):
        original_indices=[]
        for face in faces:
            points=tuple(mapping[scaled[vertices[corner]]] for corner in face)
            row=source_keys.get(tuple(sorted(points)))
            if row is None or row[0] in touched or row[1]!=orientation(points):
                raise BatchError("Provider part has an absent, repeated or flipped original face")
            touched.add(row[0])
            original_indices.append(row[0])
        result.append((part_names[mesh_index],original_indices))
    if len(touched)!=len(original_faces):
        raise BatchError("Provider parts did not partition the full original textured bow")
    return result,proof


def build(original,provider,groups,faces,positions,normals,uv):
    doc=copy.deepcopy(original.doc)
    payload=bytearray(original.payload)
    doc["nodes"]=copy.deepcopy(provider.doc["nodes"])
    doc["scenes"]=copy.deepcopy(provider.doc["scenes"])
    doc["scene"]=provider.doc.get("scene",0)
    doc["meshes"]=[]
    expected=[]
    material=original.doc["meshes"][0]["primitives"][0]["material"]
    for name,rows in groups:
        indices=[vertex for index in rows for vertex in faces[index]]
        vertices=sorted(set(indices))
        remap={vertex:index for index,vertex in enumerate(vertices)}
        local_pos=[positions[v] for v in vertices]
        local_norm=[normals[v] for v in vertices]
        local_uv=[uv[v] for v in vertices]
        triangles=[tuple(remap[vertex] for vertex in faces[row]) for row in rows]
        doc["meshes"].append({"name":name,"primitives":[{
            "mode":4,"material":material,
            "indices":append_accessor(doc,payload,"SCALAR",5123,[(v,) for face in triangles for v in face],34963),
            "attributes":{
                "POSITION":append_accessor(doc,payload,"VEC3",5126,local_pos,34962),
                "NORMAL":append_accessor(doc,payload,"VEC3",5126,local_norm,34962),
                "TEXCOORD_0":append_accessor(doc,payload,"VEC2",5126,local_uv,34962),
            },
        }]})
        expected.append((local_pos,local_norm,local_uv,triangles))
    return encode_glb(doc,payload),expected


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for option in ("original","segmented","output"):
        parser.add_argument("--"+option,type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    if bpy.app.version[:2]!=(5,3) or args.output.resolve().is_relative_to(repo_root()):
        raise BatchError("Use Blender 5.3 and a new private output directory outside the checkout")
    if sha256_file(args.original)!=ORIGINAL or sha256_file(args.segmented)!=SEGMENTED:
        raise BatchError("The supplied GLBs are not the exact traced bow exports")
    original,provider=TexturedGlb(args.original),TexturedGlb(args.segmented)
    (positions,normals,uv,faces),=original.primitives(uv=True)
    if len(faces)!=10521 or len(original.doc["materials"])!=1 or len(original.image_hashes())!=1:
        raise BatchError("Original material or surface totals changed")
    groups,proof=partitions(provider,positions,faces)
    string_faces,strips=original_string(positions,faces)
    string_ids=[name for name,group in groups if set(group)==string_faces]
    if string_ids!=["tripo_part_27"]:
        raise BatchError("The provider labels do not uniquely isolate the exact original string")
    destination=args.output.resolve()
    destination.mkdir(parents=True,exist_ok=False,mode=0o700)
    result=destination/"IcarusBowExactTexturedParts.glb"
    encoded,expected=build(original,provider,groups,faces,positions,normals,uv)
    result.write_bytes(encoded)
    derivative=TexturedGlb(result)
    if (list(derivative.primitives(uv=True))!=expected or derivative.doc["nodes"]!=provider.doc["nodes"]
            or derivative.image_hashes()!=original.image_hashes()
            or derivative.doc["materials"]!=original.doc["materials"]
            or derivative.doc["textures"]!=original.doc["textures"]
            or not derivative.payload.startswith(original.payload)):
        raise BatchError("Stored candidate changed exact original geometry attributes or source atlas")
    views,_=compare_views(blender_triangles(args.original,1),blender_triangles(result,46),destination)
    if any(view["changedPixels"] for view in views.values()):
        raise BatchError("Blender reimport did not preserve exact source silhouettes")
    if sha256_file(args.original)!=ORIGINAL or sha256_file(args.segmented)!=SEGMENTED:
        raise BatchError("A provider source was changed")
    imported_images=[{"name":image.name,"pixels":[int(x) for x in image.size]} for image in bpy.data.images
                     if tuple(image.size)!=(0,0) and image.source=="FILE"]
    receipt={
        "classification":"PRIVATE_ORIGINAL_TEXTURED_BOW_PARTS","originalSha256":ORIGINAL,"segmentedProviderSha256":SEGMENTED,
        "derivedFile":result.name,"derivedSha256":sha256_file(result),"originalTextureSha256":original.image_hashes()[0],
        "providerImageCount":len(provider.image_hashes()),"providerImageMatchesOriginal":sum(
            image==original.image_hashes()[0] for image in provider.image_hashes()),
        "preservedOriginalMaterialsAndUvs":True,"preservedOriginalBinaryPrefix":True,
        "originalTextureImported":imported_images,"parts":[{"partId":name,"triangles":len(rows)} for name,rows in groups],
        "faces":len(faces),"stringPartId":string_ids[0],"stringTriCount":len(string_faces),"stringStrips":strips,
        "geometryCorrespondence":proof,"silhouettes":views,"unityAdmission":False,"newCreditsSpent":0,
    }
    (destination/"bow-parts-review.json").write_text(json.dumps(receipt,indent=2)+"\n")


if __name__=="__main__":
    main()
