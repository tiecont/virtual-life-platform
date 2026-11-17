"""Package the pinned Icarus high-poly candidate for offline geometry repair.

Run with Blender 4.5 LTS --background --python this_file -- --output NEW_DIR.
This imports verified GLB bytes into a new process; it never edits the live scene.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def copy_verified(source, destination, expected):
    if sha(source) != expected:
        raise ValueError(f'Source hash mismatch: {source.name}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    if sha(destination) != expected:
        raise ValueError(f'Copy hash mismatch: {destination.name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if bpy.app.version[:2] != (4, 5):
        raise ValueError('Use the pinned Blender 4.5 LTS authoring toolchain')
    repo = Path(__file__).resolve().parents[2]
    manifest_path = repo / 'specs/pet-arena/references/icarus/production-v4-pbr.json'
    manifest = json.loads(manifest_path.read_text())
    candidate = next(item for item in manifest['candidateModels']
                     if item['sha256'] == '943ad8fc0258e80e120349e1bf97521eebb108abc04d399f02c75758647b7d9c')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    reference = output / 'references/owner-selected-design-01.png'
    copy_verified(Path(manifest['reference']), reference, manifest['referenceSha256'])
    model = output / 'source/icarus-highpoly-unrigged.glb'
    copy_verified(Path(candidate['localPath']), model, candidate['sha256'])
    for entry in manifest['designImages'] + manifest['continuityFollowup']['images']:
        copy_verified(repo / entry['path'], output / 'proposals' / Path(entry['path']).parent.name
                      / Path(entry['path']).name, entry['sha256'])
    shutil.copyfile(manifest_path, output / 'source/candidate-record.json')
    shutil.copyfile(Path(__file__), output / 'source/icarus_pbr_handoff.py')
    profiles = json.loads((repo / 'specs/pet-arena/v3.1/data/limited_animation_profiles.json').read_text())
    profile = next(p for p in profiles['petAnimations'] if p['petId'] == manifest['petId'])
    (output / 'source/canonical-animation-contract.json').write_text(json.dumps(profile, indent=2) + '\n')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == 'MESH']
    facts = {'blender': bpy.app.version_string, 'petId': manifest['petId'],
             'sourceRevision': subprocess.check_output(
                 ['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip(),
             'sourceGlbSha256': candidate['sha256'], 'productionReady': False,
             'artAcceptance': 'ART_REVISION_REQUIRED', 'geometryEdited': False,
             'armatures': sum(o.type == 'ARMATURE' for o in scene.objects),
             'actions': len(bpy.data.actions), 'meshes': [], 'textures': []}
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        count = len(obj.data.loop_triangles)
        triangles += count
        facts['meshes'].append({'name': obj.name, 'triangles': count,
                               'vertices': len(obj.data.vertices), 'uvLayers': len(obj.data.uv_layers)})
    if triangles != candidate['triangles'] or facts['armatures'] or facts['actions']:
        raise ValueError('Imported candidate does not match the unrigged high-poly record')
    for image in bpy.data.images:
        if image.source == 'FILE':
            image.pack()
            facts['textures'].append({'name': image.name, 'size': list(image.size),
                                      'packed': bool(image.packed_file),
                                      'colorspace': image.colorspace_settings.name})
    if len(facts['textures']) != 3 or not all(i['packed'] for i in facts['textures']):
        raise ValueError('Expected all three embedded candidate textures to be packed')
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Neutral inspection')
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs[0].default_value = (.2, .2, .2, 1)
    background.inputs[1].default_value = .5
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -1.2
    for name, location, power in [('Key', (3, -4, 4), 950),
                                   ('Fill', (-3, -3, 2), 650),
                                   ('Rim', (2, 4, 3), 750)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location = location
        light.data.energy = power
        light.data.size = 3
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('InspectionCamera', bpy.data.cameras.new('InspectionCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    views = [
        ('hand-negative-x-dorsal', (-.53, -.18, .43), (0, 0, 1), .40),
        ('hand-negative-x-palm', (-.53, -.18, .43), (0, 0, -1), .40),
        ('hand-negative-x-edge', (-.53, -.18, .43), (0, -1, .15), .40),
        ('hand-positive-x-dorsal', (.53, -.18, .43), (0, 0, 1), .40),
        ('hand-positive-x-palm', (.53, -.18, .43), (0, 0, -1), .40),
        ('portrait', (0, -.07, .64), (0, -1, .03), .60),
        ('wing-roots-back', (0, .08, .42), (0, 1, .1), 1.05),
        ('full-front', (0, 0, 0), (0, -1, .02), 2.20),
    ]
    (output / 'review').mkdir()
    facts['views'] = []
    for name, target, direction, scale in views:
        focus = Vector(target)
        camera.location = focus + Vector(direction).normalized() * 4
        camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = str(output / 'review' / (name + '.png'))
        bpy.ops.render.render(write_still=True)
        facts['views'].append({'path': 'review/' + name + '.png', 'focus': target,
                               'direction': direction, 'orthoScale': scale})
    # Keep the delivered file independent of this workstation and open on the full figure.
    scene.render.filepath = '//../review/reopened.png'
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'source/icarus-highpoly-unrigged.blend'))
    (output / 'inspection.json').write_text(json.dumps(facts, indent=2) + '\n')
    work = '''# Icarus: nguồn để sửa mỹ thuật, chưa đạt production

Đây là nguồn high-poly chưa rig, không phải prefab Unity hay benchmark đã đạt.
Không có chỉnh sửa hình học hoặc animation trong lần đóng gói này.
Chỉ references/owner-selected-design-01.png là mẫu chủ sở hữu. Các ảnh proposals/
là diễn giải AI chưa được duyệt; không được dùng để thay thế mẫu gốc.

## Mở và kiểm tra

Mở source/icarus-highpoly-unrigged.blend bằng Blender 4.5 LTS; texture đã pack.
GLB nguyên bản được giữ cạnh file blend. inspection.json ghi dữ liệu đo thực tế;
inventory.json ghi hash từng file. review/ chứa các góc trung tính cùng ánh sáng.
Các đường dẫn localPath trong candidate-record.json là lịch sử, không phải phụ thuộc
để mở gói. Không chạy lại script từ bản sao gói: chạy từ checkout nguồn của PR51.

## Thứ tự sửa và điều kiện nghiệm thu

1. Giữ mặt người trưởng thành phong cách anime, tóc hồng nhiều lớp, váy trắng/vàng,
   cánh lông trắng và cung theo mẫu. Chốt cấu trúc tóc/lưng/váy giữa các góc; ảnh bổ
   sung không tự chứng minh tính nhất quán. Không hứa tỷ lệ giống 100% bằng số đo mesh.
2. Kiểm tra cả hai bàn tay từ mu, lòng và cạnh. Có đầu ngón nhìn tách ở góc mu;
   chưa có bằng chứng khớp ngón, mạng cạnh để uốn hoặc khả năng nắm cung. Xây lại
   palm/thumb opposition, từng đốt và webbing khi cần; giữ giáp cổ tay và tỷ lệ.
   Nghiệm thu bằng bàn tay mở, nắm cung, kéo dây, không xuyên hoặc dính ngón.
3. Tách cấu trúc vai/cánh, các lớp lông và điểm gắn khỏi tóc/áo. Kiểm tra cánh xòe,
   gập và kéo cung ở trước/cạnh/sau; không dùng xoay cả tấm cánh để thay khớp.
4. Khôi phục chi tiết mặt, mí/mắt, tóc và viền vàng bị mềm; xem ánh sáng trung tính
   trước khi thêm glow. PBR trong nguồn có normal 2K, không phải toàn bộ kênh 4K.
5. Retopology theo vùng uốn, UV và bake từ nguồn này. Không decimate rồi tuyên bố
   đạt. Ngân sách game hiện hành: LOD0 26k–29.5k tam giác, tối đa 3 material,
   74 xương Icarus. Yêu cầu 4K/8K của chủ sở hữu là nguồn chất lượng cao; ngân sách
   texture runtime phải được kiểm thử riêng với contract Unity, không tự nâng.
6. Rig/skin toàn thân, tay và cánh; kiểm tra cực hạn vai/khuỷu/cổ tay/gối/cánh và
   xuyên tóc/váy. Thực hiện đủ 16 action trong canonical-animation-contract.json.
   Các tên normal_sword_hit/rage_sword_100 là khóa canonical hiện có; giữ khóa,
   diễn hoạt cung đúng thiết kế, không âm thầm đổi protocol/gameplay.
7. Import Unity URP đúng phiên bản repo, prefab/material/Animator/VFX FIRE_ZONE,
   footage thực sự có chuyển động nhân vật, reduced-motion và đo hiệu năng.
   Presentation không quyết định damage, capture hoặc outcome của Rust.

Chưa có rig, action, game topology, Unity prefab hoặc chấp thuận release trong gói.
Năm Limited khác vẫn chờ thiết kế chủ sở hữu; Pet thường chỉ làm ảnh ở scope hiện tại.
Không upload gói này như asset production và không liên hệ/thuê người bên ngoài.
'''
    (output / 'WORK_ORDER.md').write_text(work)
    inventory = [{'path': str(p.relative_to(output)), 'bytes': p.stat().st_size, 'sha256': sha(p)}
                 for p in sorted(output.rglob('*')) if p.is_file()]
    (output / 'inventory.json').write_text(json.dumps({'productionReady': False, 'files': inventory}, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'files': len(inventory), 'triangles': triangles,
                      'productionReady': False, 'geometryEdited': False}))


if __name__ == '__main__':
    main()
