"""Apply a bounded ruby-iris paint correction to the preserved draft atlas."""
import json
from pathlib import Path

import bpy
import numpy as np

ROOT = Path('artifacts/character-production/icarus').resolve()
OUT = ROOT / 'blender/face-refined-02'


def main():
    assert bpy.app.version[:2] == (4, 5)
    OUT.mkdir(parents=True, exist_ok=False)
    (OUT / 'textures').mkdir()
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'blender/assembled-04/icarus-assembled.blend'))
    body = bpy.data.objects['Icarus_LOD0']
    image = next(n.image for m in body.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height,width,4)
    original = pixels.copy()
    body.data.calc_loop_triangles()
    for triangle in body.data.loop_triangles:
        points = np.array([body.data.vertices[i].co[:] for i in triangle.vertices])
        if min(points[:,1]) > -.18 or max(points[:,2]) < 1.41 or min(points[:,2]) > 1.46 or min(abs(points[:,0])) > .08:
            continue
        uv = np.array([body.data.uv_layers.active.data[i].uv[:] for i in triangle.loops]) * [width-1,height-1]
        low = np.maximum(0, np.floor(uv.min(axis=0)).astype(int))
        high = np.minimum([width-1,height-1], np.ceil(uv.max(axis=0)).astype(int))
        if np.any(high < low):
            continue
        xx, yy = np.meshgrid(np.arange(low[0],high[0]+1),np.arange(low[1],high[1]+1))
        matrix = np.array([[uv[0,0],uv[1,0],uv[2,0]],[uv[0,1],uv[1,1],uv[2,1]],[1,1,1]])
        if abs(np.linalg.det(matrix)) < 1e-8:
            continue
        weights = np.linalg.inv(matrix) @ np.array([xx.ravel(),yy.ravel(),np.ones(xx.size)])
        world = weights.T @ points
        inside = (weights.min(axis=0) >= -1e-5) & (world[:,1] < -.18)
        x, z = world[:,0],world[:,2]
        distance = ((np.abs(x)-.047)/.014)**2 + ((z-1.435)/.012)**2
        mask = inside & (distance < 1)
        if not np.any(mask):
            continue
        tx, ty = xx.ravel()[mask],yy.ravel()[mask]
        vertical = np.clip((z[mask]-1.423)/.024,0,1)
        ruby = np.stack([.62-.35*vertical,.06-.035*vertical,.14-.08*vertical],axis=1)
        pupil = (np.abs(np.abs(x[mask])-.047) < .004) & (z[mask] > 1.429)
        ruby[pupil] = [.06,.008,.018]
        glint = ((np.abs(x[mask])-.043)/.003)**2+((z[mask]-1.442)/.003)**2 < 1
        ruby[glint] = [.95,.84,.85]
        alpha = np.minimum(1,(1-distance[mask])*5)[:,None]*.9
        pixels[ty,tx,:3] = pixels[ty,tx,:3]*(1-alpha)+ruby*alpha
    changed = int(np.sum(np.max(abs(original-pixels),axis=2) > .01))
    assert changed > 20, 'Ruby correction did not reach actual face UVs'
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.filepath_raw = str(OUT / 'textures/Icarus_BaseColor.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    bow_image = bpy.data.images['PhoenixBow_BaseColor']
    bow_image.filepath_raw = str(OUT / 'textures/PhoenixBow_BaseColor.png')
    bow_image.file_format = 'PNG'
    bow_image.save()
    bow_image.pack()
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    rig.animation_data.action = bpy.data.actions['idle']
    rig.animation_data.action_slot = bpy.data.actions['idle'].slots[0]
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'icarus-assembled.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in {'MESH','ARMATURE'} and 'LOD1' not in obj.name and 'LOD2' not in obj.name:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(filepath=str(OUT / 'icarus-review.fbx'),use_selection=True,
        object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=True,
        bake_anim_use_nla_strips=False,bake_anim_use_all_actions=True,path_mode='COPY',embed_textures=True,axis_forward='-Z',axis_up='Y')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'icarus-review.glb'),use_selection=True,export_format='GLB',export_animation_mode='ACTIONS')
    (OUT / 'validation.json').write_text(json.dumps({'state':'ART_REVISION_REQUIRED','changedAtlasPixels':changed,
        'objective':'Restore approved ruby iris color without changing face geometry',
        'interpretation':'UV-space hand-painted supplement, not new owner-approved art',
        'remaining':'Facial likeness/expressions and topology still require manual refinement','productionReady':False},indent=2)+'\n')
    print('RUBY_IRIS_PAINT_PIXELS',changed,flush=True)


if __name__ == '__main__':
    main()
