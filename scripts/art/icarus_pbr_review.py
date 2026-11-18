"""Inspect an unrigged PBR candidate without claiming game-asset acceptance."""
import argparse
import sys
import bpy,json,math
from pathlib import Path
from mathutils import Vector
parser=argparse.ArgumentParser()
parser.add_argument('--root',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=Path(args.root).resolve()
assert bpy.app.version[:2] == (4,5)
assert (root/'meshy/icarus-pbr4k.glb').is_file()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'meshy/icarus-pbr4k.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
focus=(lo+hi)/2
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=12
scene.cycles.use_denoising=True
scene.render.resolution_x=768
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Neutral studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.2,.2,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='AgX'
size=max(hi-lo)
for name,offset,power in [('Key',(2,-3,3),400),('Fill',(-2,-2,2),250),('Rim',(1,3,3),300)]:
 light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(light);light.location=focus+Vector(offset)*size;light.data.energy=power*size*size;light.data.size=size*2;light.rotation_euler=(focus-light.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=size*1.6
out=root/'review';out.mkdir(exist_ok=False)
facts={'blender':bpy.app.version_string,'bounds':[list(lo),list(hi)],'objects':[],'images':[],'productionReady':False}
for o in meshes:
 o.data.calc_loop_triangles();facts['objects'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'materials':len(o.data.materials),'uvLayers':len(o.data.uv_layers)})
for im in bpy.data.images:
 facts['images'].append({'name':im.name,'size':list(im.size),'colorspace':im.colorspace_settings.name})
(out/'inspection.json').write_text(json.dumps(facts,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'icarus-pbr4k-inspection.blend'))
for name,angle in [('front',0),('side',90),('back',180),('three-quarter',35)]:
 a=math.radians(angle);cam.location=focus+Vector((math.sin(a),-math.cos(a),.05))*size*4;cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps(facts))
