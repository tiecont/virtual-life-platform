"""Separate the provider arrow and mount a review bow, preserving every raw file."""
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path('artifacts/character-production/icarus').resolve()
OUT = ROOT / 'blender/assembled-04'


def subset(source, name, arrow):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    remove = [f for f in bm.faces if all(v.co.x > .108 for v in f.verts) != arrow]
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def main():
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--character', default=str(ROOT / 'blender/refined-03/icarus-refined.blend'))
    parser.add_argument('--output', default=str(OUT))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    OUT = Path(args.output).resolve()
    assert bpy.app.version[:2] == (4, 5)
    OUT.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'meshy/bow-01/model.glb'))
    raw = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bow = subset(raw, 'PhoenixFireBow_DRAFT', False)
    arrow = subset(raw, 'PhoenixArrow_DRAFT', True)
    assert len(bow.data.polygons) + len(arrow.data.polygons) == len(raw.data.polygons)
    bpy.data.objects.remove(raw, do_unlink=True)
    for obj in (bow, arrow):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 1:
            (OUT / 'textures').mkdir(exist_ok=True)
            image.name = 'PhoenixBow_BaseColor'
            image.filepath_raw = str(OUT / 'textures/PhoenixBow_BaseColor.png')
            image.file_format = 'PNG'
            image.save()
            image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'phoenix-bow.blend'))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'phoenix-bow.glb'), export_format='GLB', use_selection=True)
    bpy.ops.export_scene.fbx(filepath=str(OUT / 'phoenix-bow.fbx'), use_selection=True, object_types={'MESH'},
                             bake_anim=False, path_mode='COPY', embed_textures=True, axis_forward='-Z', axis_up='Y')
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.character).resolve()))
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 1:
            image.name = 'Icarus_BaseColor'
            image.filepath_raw = str(OUT / 'textures/Icarus_BaseColor.png')
            image.file_format = 'PNG'
            image.save()
            image.pack()
    with bpy.data.libraries.load(str(OUT / 'phoenix-bow.blend'), link=False) as (available, target):
        target.objects = ['PhoenixFireBow_DRAFT']
    bow = target.objects[0]
    bpy.context.scene.collection.objects.link(bow)
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    rig.animation_data.action = bpy.data.actions['idle']
    rig.animation_data.action_slot = bpy.data.actions['idle'].slots[0]
    bpy.context.scene.frame_set(1)
    hand = rig.matrix_world @ rig.data.bones['LeftHand'].head_local
    factor = 1.10 / .9511719942
    for vertex in bow.data.vertices:
        vertex.co = (vertex.co - Vector((-.03, 0, 0))) * factor
    bow.location = hand
    bpy.context.view_layer.update()
    world = bow.matrix_world.copy()
    bow.parent, bow.parent_type, bow.parent_bone = rig, 'BONE', 'LeftHand'
    bow.matrix_world = world
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'icarus-assembled.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in {'MESH', 'ARMATURE'} and 'LOD1' not in obj.name and 'LOD2' not in obj.name:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(filepath=str(OUT / 'icarus-review.fbx'), use_selection=True,
                             object_types={'ARMATURE','MESH'}, add_leaf_bones=False,
                             bake_anim=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=True,
                             path_mode='COPY', embed_textures=True, axis_forward='-Z', axis_up='Y')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'icarus-review.glb'), use_selection=True,
                              export_format='GLB', export_animation_mode='ACTIONS')
    result = {'state':'ART_REVISION_REQUIRED', 'bowHeightMeters':1.10, 'arrowSeparated':True,
              'attachment':'LeftHand', 'productionReady':False,
              'issues':['Bow string remains provider geometry; no tension deformation',
                        'Bow depth is inferred and too thin for final close-up',
                        'Arrow export separate; not yet nocked/animated',
                        'Hand grip has no finger rig', 'LOD exports not integrated']}
    (OUT / 'validation.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
