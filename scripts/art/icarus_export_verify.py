"""Reimport both draft formats and verify actual skinning and packed textures."""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    assert bpy.app.version[:2] == (4, 5)
    source = Path(args.source).resolve()
    records = []
    for extension in ('glb', 'fbx'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        file = source / f'icarus-review.{extension}'
        if extension == 'glb':
            bpy.ops.import_scene.gltf(filepath=str(file))
        else:
            bpy.ops.import_scene.fbx(filepath=str(file))
        rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
        body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and 'LOD0' in o.name)
        assert len(rig.data.bones) == 44
        assert any(m.type == 'ARMATURE' and m.object == rig for m in body.modifiers)
        unweighted = sum(not v.groups for v in body.data.vertices)
        max_influences = max(len(v.groups) for v in body.data.vertices)
        assert unweighted == 0
        assert max_influences <= 4
        assert len(body.data.uv_layers) == 1
        images = [image for image in bpy.data.images if image.source != 'GENERATED' and image.size[0] > 1]
        print('TEXTURES', extension, [(image.name, list(image.size), image.filepath) for image in images], flush=True)
        assert len(images) >= 2 and all(tuple(image.size) == (2048, 2048) for image in images), 'Character and bow texture sets must both survive'
        actions = list(bpy.data.actions)
        moves = []
        for name in ('idle', 'wing_fold_test', 'bow_draw_test'):
            action = next(a for a in actions if a.name == name or a.name.endswith('|' + name))
            rig.animation_data_create()
            rig.animation_data.action = action
            rig.animation_data.action_slot = action.slots[0]
            samples = []
            for fraction in (0, .25, .5):
                bpy.context.scene.frame_set(int(action.frame_range[0] + fraction * (action.frame_range[1]-action.frame_range[0])))
                evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
                mesh = evaluated.to_mesh()
                samples.append([evaluated.matrix_world @ v.co for v in mesh.vertices])
                evaluated.to_mesh_clear()
            delta = max((a-b).length for sample in samples[1:] for a,b in zip(samples[0], sample))
            assert delta > .0001, f'No deformation in {extension} {name}'
            moves.append({'name':name, 'maximumVertexDisplacementMeters':delta})
        body.data.calc_loop_triangles()
        records.append({'format':extension, 'result':'PASS', 'bones':len(rig.data.bones),
                        'bodyTriangles':len(body.data.loop_triangles), 'unweightedVertices':unweighted,
                        'maximumInfluences':max_influences, 'textureCount':len(images), 'motions':moves,
                        'artAcceptance':'ART_REVISION_REQUIRED', 'productionReady':False})
    Path(args.output).write_text(json.dumps({'blender':bpy.app.version_string, 'reimport':records},indent=2)+'\n')
    print(json.dumps(records), flush=True)


if __name__ == '__main__':
    main()
