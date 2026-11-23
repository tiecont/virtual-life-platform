"""Build or reopen and audit the B1 FBX template in background Blender."""

from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "artifacts/b1"
SOURCE = ROOT / "assets/base_templates/BaseMesh/source/anime_gril.fbx"
OUTPUT = ROOT / "assets/base_templates/base_anime_female.blend"
BASE = "Anime Female Base"
CLAY = "Base - Clay"
CHECKER = "Diagnostic - UV Checker"
WIRE = "Diagnostic - Topology Wire"
HEIGHT = 1.68


def save_json(name, data):
    (AUDIT / name).write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")


def extents(points):
    points = list(points)
    return {
        "min": [min(point[axis] for point in points) for axis in range(len(points[0]))],
        "max": [max(point[axis] for point in points) for axis in range(len(points[0]))],
    }


def mesh_fingerprints(mesh):
    topology = hashlib.sha256()
    positions = hashlib.sha256()
    for vertex in mesh.vertices:
        positions.update(struct.pack("<fff", *vertex.co))
    topology.update(struct.pack("<III", len(mesh.vertices), len(mesh.edges), len(mesh.polygons)))
    for edge in mesh.edges:
        topology.update(struct.pack("<II", *edge.vertices))
    for face in mesh.polygons:
        indices = tuple(face.vertices)
        topology.update(struct.pack(f"<{1 + len(indices)}I", len(indices), *indices))
    uv_layers = {}
    for layer in mesh.uv_layers:
        digest = hashlib.sha256()
        for loop in layer.uv:
            digest.update(struct.pack("<ff", *loop.vector))
        uv_layers[layer.name] = digest.hexdigest()
    return {"topology_sha256": topology.hexdigest(), "uv_loop_sha256": uv_layers,
            "positions_sha256": positions.hexdigest()}


def connected_sets(pairs, vertices=()):
    neighbors = {vertex: set() for vertex in vertices}
    for a, b in pairs:
        neighbors.setdefault(a, set()).add(b)
        neighbors.setdefault(b, set()).add(a)
    remaining = set(neighbors)
    while remaining:
        first = remaining.pop()
        stack = [first]
        component = {first}
        while stack:
            vertex = stack.pop()
            new_vertices = neighbors[vertex] & remaining
            remaining.difference_update(new_vertices)
            component.update(new_vertices)
            stack.extend(new_vertices)
        yield component, {vertex: neighbors[vertex] for vertex in component}


def boundary_region(bounds):
    x0, y0, z0 = bounds["min"]
    x1, y1, z1 = bounds["max"]
    x, y, z = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    if z0 > 1.40:
        if y < -0.015 and z < 1.51:
            return "mouth / lower face"
        if y < -0.015 and z < 1.60:
            return "eye / midface (negative X)" if x < 0 else "eye / midface (positive X)"
        return "head"
    if abs(x) > 0.53:
        return "hand / wrist (negative X)" if x < 0 else "hand / wrist (positive X)"
    if z0 > 1.28 and z1 < 1.44 and abs(x) < 0.13:
        return "neck"
    if z1 < 0.12:
        return "foot (negative X)" if x < 0 else "foot (positive X)"
    return "body / other"


def inspect_mesh(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = [(edge.verts[0].index, edge.verts[1].index) for edge in bm.edges if edge.is_boundary]
    boundaries = []
    for component, neighbors in connected_sets(boundary):
        bounds = extents(obj.matrix_world @ mesh.vertices[index].co for index in component)
        boundaries.append({
            "region": boundary_region(bounds),
            "vertices": len(component),
            "edges": sum(map(len, neighbors.values())) // 2,
            "vertex_degrees": dict(Counter(map(len, neighbors.values()))),
            "bounds_m": bounds,
            "first_vertex": min(component),
        })
    boundaries.sort(key=lambda item: (-item["edges"], item["first_vertex"]))
    components = []
    pairs = (tuple(edge.vertices) for edge in mesh.edges)
    for component, _ in connected_sets(pairs, range(len(mesh.vertices))):
        bounds = extents(obj.matrix_world @ mesh.vertices[index].co for index in component)
        components.append({"vertices": len(component), "bounds_m": bounds, "first_vertex": min(component)})
    components.sort(key=lambda item: (-item["vertices"], item["first_vertex"]))
    layers = {}
    for layer in mesh.uv_layers:
        coordinates = [tuple(loop.vector) for loop in layer.uv]
        finite = all(math.isfinite(value) for uv in coordinates for value in uv)
        zero_area = exact_zero_area = reversed_winding = 0
        for tri in mesh.loop_triangles:
            a, b, c = (coordinates[index] for index in tri.loops)
            signed_area_twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            zero_area += abs(signed_area_twice) <= 1e-12
            exact_zero_area += signed_area_twice == 0
            reversed_winding += signed_area_twice < -1e-12
        edge_faces = defaultdict(list)
        for poly in mesh.polygons:
            loops = list(poly.loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                edge_uv = tuple(sorted(((mesh.loops[a].vertex_index, coordinates[a]),
                                        (mesh.loops[b].vertex_index, coordinates[b]))))
                edge_faces[edge_uv].append(poly.index)
        links = ((faces[0], other) for faces in edge_faces.values() for other in faces[1:])
        island_sizes = sorted(
            (len(group) for group, _ in connected_sets(links, range(len(mesh.polygons)))),
            reverse=True,
        )
        layers[layer.name] = {
            "loops": len(coordinates), "finite": finite,
            "bounds": extents(coordinates) if finite else None,
            "out_of_0_1_loops": sum(not (0 <= u <= 1 and 0 <= v <= 1) for u, v in coordinates),
            "outside_0_1_beyond_1e_6_loops": sum(
                not (-1e-6 <= u <= 1 + 1e-6 and -1e-6 <= v <= 1 + 1e-6) for u, v in coordinates
            ),
            "zero_area_triangles": exact_zero_area,
            "triangles_with_absolute_double_area_at_most_1e_12": zero_area,
            "negative_winding_triangles": reversed_winding,
            "islands_by_exact_edge_uv": len(island_sizes), "island_face_counts": island_sizes,
        }
    facts = {
        "vertices": len(mesh.vertices), "edges": len(mesh.edges), "faces": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "face_sizes": dict(Counter(p.loop_total for p in mesh.polygons)),
        "finite_vertices": all(math.isfinite(v) for vertex in mesh.vertices for v in vertex.co),
        "surface_components": components,
        "boundary_edges": len(boundary),
        "boundary_components": boundaries,
        "boundary_regions": dict(Counter(item["region"] for item in boundaries)),
        "edges_with_more_than_two_faces": sum(len(e.link_faces) > 2 for e in bm.edges),
        "wire_edges": sum(e.is_wire for e in bm.edges),
        "loose_vertices": sum(not v.link_edges for v in bm.verts),
        "zero_area_mesh_triangles": sum(t.area <= 1e-12 for t in mesh.loop_triangles),
        "uv": layers,
        **mesh_fingerprints(mesh),
    }
    bm.free()
    return facts


def material(name, color, roughness=0.72):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    surface = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    surface.inputs["Base Color"].default_value = (*color, 1)
    surface.inputs["Roughness"].default_value = roughness
    return result, surface


def checker_material(uv_name):
    result, surface = material("B1 | UV checker", (0.12, 0.40, 0.43))
    nodes, links = result.node_tree.nodes, result.node_tree.links
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    uv.location = (-520, 40)
    checker = nodes.new("ShaderNodeTexChecker")
    checker.location = (-270, 40)
    checker.inputs["Scale"].default_value = 24
    checker.inputs["Color1"].default_value = (0.035, 0.25, 0.28, 1)
    checker.inputs["Color2"].default_value = (0.81, 0.72, 0.46, 1)
    links.new(uv.outputs["UV"], checker.inputs["Vector"])
    links.new(checker.outputs["Color"], surface.inputs["Base Color"])
    return result


def add_wire(obj, ink):
    group = bpy.data.node_groups.new("B1 | Original polygon edges", "GeometryNodeTree")
    group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes, links = group.nodes, group.links
    input_node = nodes.new("NodeGroupInput")
    edges = nodes.new("GeometryNodeMeshToCurve")
    profile = nodes.new("GeometryNodeCurvePrimitiveCircle")
    profile.inputs["Resolution"].default_value = 4
    profile.inputs["Radius"].default_value = 0.00020
    tubes = nodes.new("GeometryNodeCurveToMesh")
    assign = nodes.new("GeometryNodeSetMaterial")
    assign.inputs["Material"].default_value = ink
    output_node = nodes.new("NodeGroupOutput")
    for node, location in zip((input_node, edges, profile, tubes, assign, output_node),
                              ((0, 0), (210, 0), (210, -200), (430, 0), (650, 0), (850, 0))):
        node.location = location
    links.new(input_node.outputs["Geometry"], edges.inputs["Mesh"])
    links.new(edges.outputs["Curve"], tubes.inputs["Curve"])
    links.new(profile.outputs["Curve"], tubes.inputs["Profile Curve"])
    links.new(tubes.outputs["Mesh"], assign.inputs["Geometry"])
    links.new(assign.outputs["Geometry"], output_node.inputs["Geometry"])
    mod = obj.modifiers.new("Draw original edges", "NODES")
    mod.node_group = group


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(collection, name, location, target, scale):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.clip_start = 0.005
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def light(collection, name, position, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = position
    aim(obj, (0, 0, 1.1))


def configure_scene(scene, world, studio):
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0
    scene.collection.children.link(studio)
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.resolution_x, scene.render.resolution_y = 820, 880


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SOURCE), use_image_search=False)
    scene = bpy.context.scene
    imported, = list(scene.objects)
    assert imported.type == "MESH" and imported.parent is None and not imported.modifiers
    mesh = imported.data
    assert len(mesh.uv_layers) == 1 and not mesh.shape_keys and not mesh.materials
    bpy.context.view_layer.update()
    source_world = [imported.matrix_world @ vertex.co for vertex in mesh.vertices]
    bounds = extents(source_world)
    source_height = bounds["max"][2] - bounds["min"][2]
    scale = HEIGHT / source_height
    center_x = (bounds["min"][0] + bounds["max"][0]) / 2
    source_matrix = imported.matrix_world.copy()
    # The nose and toe silhouettes point +Y in the imported FBX.
    yaw = Matrix.Diagonal((-1.0, -1.0, 1.0, 1.0))
    normalize = Matrix.Scale(scale, 4) @ yaw @ Matrix.Translation((-center_x, 0, -bounds["min"][2]))
    source_record = {
        "blender": bpy.app.version_string, "build_hash": bpy.app.build_hash.decode(),
        "import_method": "Isolated Blender FBX import",
        "source": str(SOURCE), "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "source_imported_name": imported.name,
        "source_world_matrix": [list(row) for row in source_matrix],
        "source_bounds_after_fbx_import": bounds, "source_height_after_fbx_import": source_height,
        "uniform_scale": scale, "yaw_degrees": 180,
        "source_world_to_normalized": [list(row) for row in normalize],
        **mesh_fingerprints(mesh),
    }
    mesh.transform(normalize @ source_matrix)
    imported.matrix_world = Matrix.Identity(4)
    mesh.update()
    assert all(mesh_fingerprints(mesh)[key] == source_record[key]
               for key in ("topology_sha256", "uv_loop_sha256"))
    source_record["normalized_positions_sha256"] = mesh_fingerprints(mesh)["positions_sha256"]
    normalized_points = [normalize @ point for point in source_world]
    source_record["maximum_vertex_normalization_error_m"] = max(
        (vertex.co - expected).length for vertex, expected in zip(mesh.vertices, normalized_points)
    )
    imported.name = BASE
    mesh.name = "Anime Female | Original FBX topology"
    imported["FBX source"] = SOURCE.name
    imported["FBX SHA-256"] = source_record["source_sha256"]
    imported["Forward"] = "-Y"
    imported["Height (m)"] = HEIGHT
    scene.name = CLAY
    clay, _ = material("B1 | Neutral gray clay", (0.47, 0.47, 0.47))
    checker = checker_material(mesh.uv_layers.active.name)
    ink, _ = material("B1 | Wire ink", (0.013, 0.017, 0.020))
    mesh.materials.append(clay)
    wire_clay, _ = material("B1 | Wire underlay", (0.61, 0.61, 0.61))
    edit_collection = bpy.data.collections.new("Editable FBX Mesh")
    scene.collection.children.link(edit_collection)
    for collection in list(imported.users_collection):
        collection.objects.unlink(imported)
    edit_collection.objects.link(imported)
    studio = bpy.data.collections.new("B1 Cameras and Lighting")
    world = bpy.data.worlds.new("B1 | Neutral studio")
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0.52, 0.52, 0.52, 1)
    background.inputs["Strength"].default_value = 0.48
    front = camera(studio, "Full Body - Front", (0, -4, 0.84), (0, 0, 0.84), 1.93)
    camera(studio, "Full Body - Side", (4, 0, 0.84), (0, 0, 0.84), 1.93)
    face = camera(studio, "Face - Front", (0, -2, 1.536), (0, 0, 1.536), 0.351)
    light(studio, "Key", (-2.7, -3.3, 3.8), 305, 3.2)
    light(studio, "Fill", (2.1, -3.0, 1.7), 142, 2.8)
    light(studio, "Rim", (1.3, 1.7, 3.0), 172, 2.8)
    configure_scene(scene, world, studio)
    scene.camera = front
    for name, surface in ((CHECKER, checker), (WIRE, wire_clay)):
        diagnostic = bpy.data.scenes.new(name)
        configure_scene(diagnostic, world, studio)
        diagnostic.camera = face
        diagnostic.render.resolution_x, diagnostic.render.resolution_y = 624, 704
        obj = bpy.data.objects.new(f"{name} | Linked Base", mesh)
        diagnostic.collection.objects.link(obj)
        obj.material_slots[0].link = "OBJECT"
        obj.material_slots[0].material = surface
        if name == WIRE:
            wire = bpy.data.objects.new("Original Polygon Edges", mesh)
            diagnostic.collection.objects.link(wire)
            add_wire(wire, ink)
    scene.view_layers[0].objects.active = imported
    imported.select_set(True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                view = area.spaces.active.region_3d
                view.view_perspective = "ORTHO"
                view.view_location = (0, 0, 0.84)
                view.view_distance = 2.9
                view.view_rotation = front.rotation_euler.to_quaternion()
    bpy.context.preferences.filepaths.save_version = 0
    save_json("import.json", source_record)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)


def full_body_projection(scene, obj, camera_obj):
    points = [world_to_camera_view(scene, camera_obj, v.co) for v in obj.data.vertices]
    bounds = extents(points)
    assert all(0.025 < bounds["min"][axis] < bounds["max"][axis] < 0.975 for axis in (0, 1))
    return bounds


def verify_and_render():
    bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
    original = json.loads((AUDIT / "import.json").read_text())
    scene = bpy.data.scenes[CLAY]
    body = scene.objects[BASE]
    facts = inspect_mesh(body)
    bounds = extents(body.matrix_world @ v.co for v in body.data.vertices)
    identity = Matrix.Identity(4)
    assert body.matrix_world == identity and body.matrix_basis == identity
    assert body.parent is None and not body.modifiers and not body.data.shape_keys
    assert scene.unit_settings.system == "METRIC" and scene.unit_settings.scale_length == 1
    assert abs(bounds["min"][2]) < 1e-6 and abs(bounds["max"][2] - HEIGHT) < 1e-6
    sole_z = {sign: min(v.co.z for v in body.data.vertices if sign * v.co.x > 0)
              for sign in (-1, 1)}
    assert all(abs(z) < 1e-6 for z in sole_z.values())
    assert facts["finite_vertices"] and all(layer["finite"] for layer in facts["uv"].values())
    for key in ("topology_sha256", "uv_loop_sha256"):
        assert facts[key] == original[key], key
    assert facts["positions_sha256"] == original["normalized_positions_sha256"]
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == original["source_sha256"]
    assert len(bpy.data.libraries) == 0 and not list(bpy.data.images)
    assert scene.objects["Full Body - Front"].location.y < 0
    assert scene.objects["Full Body - Side"].location.x > 0
    for name in (CHECKER, WIRE):
        linked = bpy.data.scenes[name].objects[f"{name} | Linked Base"]
        assert linked.data == body.data
    assert bpy.data.scenes[WIRE].objects["Original Polygon Edges"].modifiers[0].type == "NODES"
    face = [v.co for v in body.data.vertices if abs(v.co.x) < 0.025 and 1.48 < v.co.z < 1.55]
    nose = min(face, key=lambda v: v.y)
    toe_tip = min((v.co for v in body.data.vertices if v.co.z < 0.085), key=lambda v: v.y)
    assert nose.y < 0 and toe_tip.y < 0 and body["Forward"] == "-Y"
    facts.update({
        "blend_reopened": str(OUTPUT.relative_to(ROOT)),
        "blender": bpy.app.version_string,
        "world_matrix": [list(row) for row in body.matrix_world],
        "units": "meters", "world_bounds_m": bounds,
        "height_m": bounds["max"][2] - bounds["min"][2],
        "sole_z_by_x_sign_m": sole_z,
        "forward": "-Y",
        "central_face_forward_extreme_m": list(nose), "toe_forward_extreme_m": list(toe_tip),
        "external_libraries": len(bpy.data.libraries),
        "image_dependencies": len(bpy.data.images),
        "blend_scenes": sorted(bpy.data.scenes.keys()),
        "mesh_fingerprints_match_import": True,
        "full_body_projection": {},
        "render_panels": [],
    })
    for name, scene_name, camera_name, size in (
        ("head_clay", CLAY, "Face - Front", (624, 704)),
        ("head_wire", WIRE, "Face - Front", (624, 704)),
        ("head_uv", CHECKER, "Face - Front", (624, 704)),
        ("body_front", CLAY, "Full Body - Front", (820, 880)),
        ("body_side", CLAY, "Full Body - Side", (820, 880)),
    ):
        render_scene = bpy.data.scenes[scene_name]
        render_scene.camera = render_scene.objects[camera_name]
        render_scene.render.resolution_x, render_scene.render.resolution_y = size
        render_scene.render.filepath = str(AUDIT / "renders" / f"{name}.png")
        if name.startswith("body"):
            facts["full_body_projection"][name] = full_body_projection(render_scene, body, render_scene.camera)
        print(f"Rendering {name} from reopened file", flush=True)
        assert bpy.ops.render.render(write_still=True, scene=scene_name) == {"FINISHED"}
        facts["render_panels"].append({"panel": name, "scene": scene_name, "camera": camera_name,
                                       "size_px": list(size)})
    save_json("reopen.json", facts)


if __name__ == "__main__":
    (AUDIT / "renders").mkdir(parents=True, exist_ok=True)
    {"build": build, "verify": verify_and_render}[sys.argv[-1]]()
