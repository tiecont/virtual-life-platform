"""Apply the four original color plates to the approved editable Icarus wing master."""

from argparse import ArgumentParser
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
from typing import Callable
from zlib import compressobj, crc32

import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_probe_icarus_clay_parts import capture, stage_camera
from blender_review_icarus_accessory_clay import array_values, file_hash, meshes, verify_reference


SOURCE_SHA = "f919b17807e6d301d198290a64ac9b3c64a52cca1c31eb6d825058d60ef1fe23"
SIZE = 4096
PAD = 4
UV = "AetheriaPlateUV"
DIRECTIONS = ((0, 1, 0), (1, .66, .08), (-1, .66, .08), (0, -1, 0))
TEXTURE = "icarus-wing-original-plate-basecolor.png"
CANDIDATE = "icarus-wing-color-review.blend"
RECEIPT = "wing-uv-color-review.json"


@dataclass(frozen=True)
class AssetSpec:
    asset: str
    source_sha: str
    part_count: int
    triangles: int
    directions: tuple
    render_views: tuple
    texture: str
    candidate: str
    receipt: str
    projection_for_chart: Callable


def wing_projection(chart):
    axis = chart["axis"]
    sign = chart["normalSign"]
    main = 0 if (axis == 1 and sign > 0) or (axis != 1 and chart["centerDepth"] >= 0) else 3
    side = None
    if axis != 1 and main == 0:
        side = 1 if chart["low"][0] + chart["high"][0] > 0 else 2
    return main, side


WING = AssetSpec(
    "wing", SOURCE_SHA, 104, 4980124, DIRECTIONS,
    (("front", (0, 1, 0)), ("back", (0, -1, 0)), ("left-quarter", (1, .66, .08)), ("right-quarter", (-1, .66, .08))),
    TEXTURE, CANDIDATE, RECEIPT, wing_projection,
)


def mesh_arrays(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    return (
        array_values(mesh.vertices, "co", 3, np.float32),
        array_values(mesh.loop_triangles, "vertices", 3, np.int32),
        array_values(mesh.loop_triangles, "loops", 3, np.int32),
    )


def geometry_hash(vertices, triangles):
    hashed = sha256(vertices)
    hashed.update(triangles)
    return hashed.hexdigest()


def shape_hashes(obj):
    keys = obj.data.shape_keys
    if keys is None:
        return {}
    return {layer.name: {"positionSha256": sha256(array_values(layer.data, "co", 3, np.float32)).hexdigest(),
                         "value": layer.value}
            for layer in keys.key_blocks}


def directions(direction):
    facing = Vector(direction).normalized()
    right = (-facing).cross(Vector((0, 0, 1))).normalized()
    up = right.cross(-facing).normalized()
    return np.asarray([list(right), list(up)], dtype=np.float32)


def read_plate(path, direction, low, high):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    rgba = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(rgba)
    rgb = np.rint(rgba.reshape(height, width, 4)[..., :3] * 255).astype(np.uint8)
    bpy.data.images.remove(image)
    border = np.concatenate((rgb[:, :4], rgb[:, -4:]), axis=1)
    background = np.median(border, axis=1).astype(np.int16)[:, None, :]
    foreground = np.max(np.abs(rgb.astype(np.int16) - background), axis=2) > 20
    ys, xs = np.nonzero(foreground)
    if not len(xs) or xs.min() == 0 or xs.max() == width - 1:
        raise ValueError(f"The exact original plate {path.name} needs a plain border.")
    edge = foreground.copy()
    edge[1:-1, 1:-1] &= (~foreground[:-2, 1:-1] | ~foreground[2:, 1:-1]
                         | ~foreground[1:-1, :-2] | ~foreground[1:-1, 2:])
    rim_y, rim_x = np.nonzero(edge)
    tree = KDTree(len(rim_x))
    for index, (x, y) in enumerate(zip(rim_x, rim_y, strict=True)):
        tree.insert((float(x), float(y), 0), index)
    tree.balance()
    px_center = np.asarray([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2])
    center = (low + high) / 2
    pixel_scale = (ys.max() - ys.min()) / (high[1] - low[1])
    return {
        "rgb": rgb, "foreground": foreground, "rim": (rim_x, rim_y), "tree": tree,
        "axis": directions(direction), "pxCenter": px_center, "worldCenter": center,
        "scale": pixel_scale, "dims": [width, height], "samples": 0, "filled": 0,
    }


def project(world, plate):
    coordinates = world @ plate["axis"].T
    points = np.rint((coordinates - plate["worldCenter"]) * plate["scale"] + plate["pxCenter"]).astype(np.int32)
    width, height = plate["dims"]
    xs, ys = np.clip(points[:, 0], 0, width - 1), np.clip(points[:, 1], 0, height - 1)
    valid = plate["foreground"][ys, xs]
    rgb = plate["rgb"][ys, xs].copy()
    return points, rgb, valid


def fill_plate(points, rgb, valid, plate):
    missing = np.flatnonzero(~valid)
    plate["samples"] += len(points)
    plate["filled"] += len(missing)
    if not len(missing):
        return
    # Query each unmatched projected pixel once and reuse its true plate rim color.
    unmatched, mapping = np.unique(points[missing], axis=0, return_inverse=True)
    nearest = np.empty((len(unmatched), 3), dtype=np.uint8)
    rim_x, rim_y = plate["rim"]
    for index, (x, y) in enumerate(unmatched):
        _, rim, _ = plate["tree"].find((float(x), float(y), 0))
        nearest[index] = plate["rgb"][rim_y[rim], rim_x[rim]]
    rgb[missing] = nearest[mapping]


def groups(vertices, triangles):
    points = vertices[triangles]
    normals = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    magnitude = np.linalg.norm(normals, axis=1)
    axes = np.abs(normals).argmax(axis=1)
    face_axis = axes * 2 + (normals[np.arange(len(points)), axes] >= 0)
    return points, face_axis, magnitude


def read_charts(objects, spec):
    planar_bounds = [[np.full(2, np.inf), np.full(2, -np.inf)] for _ in spec.directions]
    all_charts = {}
    original = {}
    for obj in objects:
        vertices, triangles, _ = mesh_arrays(obj)
        original[obj.name] = geometry_hash(vertices, triangles)
        for bounds, direction in zip(planar_bounds, spec.directions, strict=True):
            projected = vertices @ directions(direction).T
            bounds[0] = np.minimum(bounds[0], projected.min(axis=0))
            bounds[1] = np.maximum(bounds[1], projected.max(axis=0))
        points, labels, _ = groups(vertices, triangles)
        for mode in np.unique(labels):
            axis = int(mode) // 2
            planar = [index for index in range(3) if index != axis]
            patch = points[labels == mode]
            lo, hi = patch.min(axis=(0, 1)), patch.max(axis=(0, 1))
            signed = -1 if mode % 2 == 0 else 1
            all_charts[obj.name, int(mode)] = {
                "axis": axis, "planes": planar, "normalSign": signed, "low": lo, "high": hi,
                "centerDepth": float(np.mean(patch[..., axis])),
            }
    return all_charts, planar_bounds, original


def pack(charts):
    for density in range(3350, 250, -150):
        order = []
        for key, chart in charts.items():
            planes = chart["planes"]
            span = chart["high"][planes] - chart["low"][planes]
            width, height = np.maximum(4, np.ceil(span * density).astype(int))
            order.append((key, int(width) + 2 * PAD, int(height) + 2 * PAD))
        order.sort(key=lambda row: (-row[2], -row[1], row[0]))
        x = y = shelf = 0
        placed = {}
        for key, width, height in order:
            if x + width > SIZE:
                x, y, shelf = 0, y + shelf, 0
            if y + height > SIZE or width > SIZE:
                break
            placed[key] = (x, y, width, height)
            x += width
            shelf = max(shelf, height)
        if len(placed) == len(charts):
            for key, rect in placed.items():
                charts[key]["rect"] = rect
            return density
    raise ValueError("Per-part UV charts did not fit in the 4K atlas.")


def chart_color(chart, plates, spec):
    axis = chart["axis"]
    planes = chart["planes"]
    _, _, width, height = chart["rect"]
    h, v = np.meshgrid(np.arange(width), np.arange(height))
    uv = np.stack((h, v), axis=-1).reshape(-1, 2)
    uv = np.clip((uv - PAD) / np.asarray([width - 2 * PAD - 1, height - 2 * PAD - 1]), 0, 1)
    world = np.empty((len(uv), 3), dtype=np.float32)
    world[:, axis] = chart["centerDepth"]
    low, high = chart["low"][planes], chart["high"][planes]
    world[:, planes] = low + uv * (high - low)
    main, quarter = spec.projection_for_chart(chart)
    p, rgb, valid = project(world, plates[main])
    fill_plate(p, rgb, valid, plates[main])
    if quarter is not None:
        _, side, visible = project(world, plates[quarter])
        plates[quarter]["samples"] += int(np.count_nonzero(visible))
        rgb[visible] = np.rint(.8 * rgb[visible] + .2 * side[visible]).astype(np.uint8)
    return rgb.reshape(height, width, 3)


def assign_uv(objects, charts, original):
    receipt = []
    for obj in objects:
        mesh = obj.data
        vertices, triangles, loops = mesh_arrays(obj)
        if len(mesh.uv_layers):
            raise ValueError(f"Unexpected preexisting UV layer on the fresh clay part {obj.name}.")
        points, labels, magnitude = groups(vertices, triangles)
        corners = np.zeros((len(mesh.loops), 2), dtype=np.float32)
        zero_projected = 0
        for mode in np.unique(labels):
            chart = charts[obj.name, int(mode)]
            x, y, width, height = chart["rect"]
            chosen = labels == mode
            planes = chart["planes"]
            low = chart["low"][planes]
            area = chart["high"][planes] - low
            flat = points[chosen][..., planes]
            normalized = (flat - low) / np.maximum(area, 1e-12)
            mapped = (normalized * np.asarray([width - 2 * PAD - 1, height - 2 * PAD - 1])
                      + np.asarray([x + PAD + .5, y + PAD + .5])) / SIZE
            first, second = mapped[:, 1] - mapped[:, 0], mapped[:, 2] - mapped[:, 0]
            zero_projected += int(np.count_nonzero(np.abs(first[:, 0] * second[:, 1] - first[:, 1] * second[:, 0]) <= 1e-20))
            corners[loops[chosen]] = mapped.astype(np.float32)
        layer = mesh.uv_layers.new(name=UV)
        layer.uv.foreach_set("vector", corners.ravel())
        stored = array_values(layer.uv, "vector", 2, np.float32)
        if not np.array_equal(stored, corners) or stored.min() <= 0 or stored.max() >= 1:
            raise ValueError("The imported UV layer changed or has out-of-atlas coordinates.")
        if geometry_hash(*mesh_arrays(obj)[:2]) != original[obj.name]:
            raise ValueError(f"UV assignment altered source geometry on {obj.name}.")
        original_zero = int(np.count_nonzero(magnitude == 0))
        if zero_projected > original_zero:
            raise ValueError(f"UV assignment introduced {zero_projected - original_zero} zero-area triangles on {obj.name}.")
        receipt.append({"part": obj.name, "triangles": len(triangles), "uvCorners": len(corners),
                        "sourceZeroAreaTriangles": original_zero, "uvZeroAreaTriangles": zero_projected,
                        "meshSha256": original[obj.name]})
    return receipt


def write_rgb_png(path, rgb):
    def chunk(file, tag, data):
        file.write(struct.pack(">I", len(data)))
        file.write(tag)
        file.write(data)
        file.write(struct.pack(">I", crc32(tag + data)))

    with path.open("xb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        chunk(file, b"IHDR", struct.pack(">2I5B", SIZE, SIZE, 8, 2, 0, 0, 0))
        chunk(file, b"sRGB", b"\x00")
        encoder = compressobj(level=5)
        for row in rgb[::-1]:
            data = encoder.compress(b"\0" + row.tobytes())
            if data:
                chunk(file, b"IDAT", data)
        chunk(file, b"IDAT", encoder.flush())
        chunk(file, b"IEND", b"")


def attach_material(objects, texture, spec):
    image = bpy.data.images.load(str(texture), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    image.pack()
    material = bpy.data.materials.new(f"Icarus {spec.asset} original plate colors")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    color = nodes.new("ShaderNodeTexImage")
    color.image = image
    color.name = "Exact original plate atlas"
    color.interpolation = "Linear"
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = UV
    links.new(uv.outputs["UV"], color.inputs["Vector"])
    pbr = nodes.get("Principled BSDF")
    pbr.inputs["Roughness"].default_value = .63
    links.new(color.outputs["Color"], pbr.inputs["Base Color"])
    nodes.active = color
    for obj in objects:
        if len(obj.data.materials) != 1:
            raise ValueError("The approved clay needs its original single surface material slot.")
        obj.data.materials[0] = material


def create(source, references, output, spec):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.view_layer.update()
    objects = meshes()
    identity = Matrix.Identity(4)
    if len(objects) != spec.part_count or any(obj.matrix_world != identity or obj.data.users != 1 for obj in objects):
        raise ValueError("The approved clay must retain all separate identity-space parts.")
    charts, bounds, original = read_charts(objects, spec)
    rest_keys = {obj.name: shape_hashes(obj) for obj in objects if obj.data.shape_keys is not None}
    density = pack(charts)
    plates = [read_plate(references / row["file"], direction, low, high)
              for row, direction, (low, high) in zip(verify_reference(references, spec.asset), spec.directions, bounds, strict=True)]
    rgb = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    for chart in charts.values():
        x, y, width, height = chart["rect"]
        rgb[y:y + height, x:x + width] = chart_color(chart, plates, spec)
    parts = assign_uv(objects, charts, original)
    if sum(row["triangles"] for row in parts) != spec.triangles:
        raise ValueError("The exact approved clay triangle count changed.")
    occupied = np.zeros((SIZE, SIZE), dtype=np.bool_)
    rows = []
    for (part, mode), chart in sorted(charts.items()):
        x, y, width, height = chart["rect"]
        tile = occupied[y:y + height, x:x + width]
        if tile.any():
            raise ValueError("Packed per-part chart rectangles overlap.")
        tile[:] = True
        rows.append({"part": part, "normalAxis": chart["axis"], "normalSign": chart["normalSign"],
                     "rectanglePixels": [x, y, width, height]})
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    texture = output / spec.texture
    write_rgb_png(texture, rgb)
    attach_material(objects, texture, spec)
    candidate = output / spec.candidate
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate), compress=True)
    if (file_hash(source) != spec.source_sha
            or rest_keys != {obj.name: shape_hashes(obj) for obj in objects if obj.data.shape_keys is not None}):
        raise ValueError("The source clay file or original shape keys changed.")
    return {
        "classification": f"PRIVATE_{spec.asset.upper()}_FOUR_PLATE_UV_COLOR_REVIEW",
        "sourceSha256": spec.source_sha,
        "sourceShapeKeys": rest_keys,
        "candidateSha256": file_hash(candidate),
        "atlasSha256": file_hash(texture),
        "atlasWidth": SIZE, "atlasHeight": SIZE, "atlasColorSpace": "sRGB",
        "atlasGutterPixels": PAD, "atlasPixelsPerWorldUnit": density,
        "occupiedAtlasFraction": float(occupied.mean()),
        "parts": parts,
        "chartRectangles": rows,
        "partChartsOverlap": False,
        "plateSampling": [{"direction": d, "sampled": p["samples"], "rimFilled": p["filled"]}
                          for d, p in zip(spec.directions, plates, strict=True)],
        "references": verify_reference(references, spec.asset),
        "scope": "Reference-only base color with independent face plates. Dominant-surface projection may overlap within one chart; no normal or metallic map, runtime LOD, rig or art admission.",
    }


def render(source, output, mode, evidence, spec):
    texture = output / spec.texture
    if file_hash(output / spec.candidate) != evidence["candidateSha256"] or file_hash(texture) != evidence["atlasSha256"]:
        raise ValueError("The rendered source or atlas changed.")
    bpy.ops.wm.open_mainfile(filepath=str(output / spec.candidate))
    objects = meshes()
    originals = {row["part"]: row for row in evidence["parts"]}
    for obj in objects:
        if (geometry_hash(*mesh_arrays(obj)[:2]) != originals[obj.name]["meshSha256"]
                or obj.data.uv_layers.active.name != UV or obj.matrix_world != Matrix.Identity(4)
                or shape_hashes(obj) != evidence["sourceShapeKeys"].get(obj.name, {})):
            raise ValueError("The saved color study changed original geometry, UV or rest placement.")
    if set(originals) != {obj.name for obj in objects} or file_hash(source) != spec.source_sha:
        raise ValueError("The rendered accessory changed approved component identity.")
    camera, center, scale, _ = stage_camera(spec.asset, objects)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = (1024, 768) if spec.asset == "wing" else (768, 1024)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    world = bpy.data.worlds.new("Neutral studio background")
    scene.world = world
    world.color = (.18, .18, .18)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.display.shading.background_type = "WORLD"
    if mode == "base-color":
        # Emission uses the exact material texture and calibrated standard view
        # transform, avoiding the Workbench texture preview's light assumptions.
        material = objects[0].data.materials[0]
        nodes = material.node_tree.nodes
        emit = nodes.new("ShaderNodeEmission")
        material.node_tree.links.new(nodes["Exact original plate atlas"].outputs["Color"], emit.inputs["Color"])
        material.node_tree.links.new(emit.outputs["Emission"], nodes.get("Material Output").inputs["Surface"])
    else:
        for name, direction in spec.render_views[:2]:
            vector = Vector(direction) + Vector((0, 0, .44))
            strength = 1.35
            light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
            scene.collection.objects.link(light)
            light.data.energy = strength
            light.data.angle = .15
            light.rotation_euler = (-Vector(vector)).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.17, .17, .17, 1)
    background.inputs["Strength"].default_value = 1 if mode == "base-color" else .45
    frames = []
    folder = output / mode
    folder.mkdir(exist_ok=False, mode=0o700)
    for name, vector in spec.render_views:
        outcome = capture(camera, center, scale * 1.10, Vector(vector), folder / f"{name}.png")
        frames.append({"view": name, "direction": vector, **outcome})
    if len({row["sha256"] for row in frames}) != len(frames):
        raise RuntimeError("The four rendered color views must be distinct.")
    (folder / "capture.json").write_text(json.dumps({
        "mode": mode, "candidateSha256": evidence["candidateSha256"], "atlasSha256": evidence["atlasSha256"],
        "renderer": "Cycles CPU Standard sRGB, fixed neutral world, 8 samples", "frames": frames,
    }, indent=2) + "\n")


def run(spec, argv):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("references", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--render", choices=("base-color", "pbr"))
    args = parser.parse_args(argv)
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the private wing color geometry.")
    source = args.source.resolve(strict=True)
    if file_hash(source) != spec.source_sha:
        raise ValueError("Use the exact owner-approved clay trial.")
    references = args.references.resolve(strict=True)
    reference = verify_reference(references, spec.asset)
    output = args.output.resolve()
    if args.render:
        evidence = json.loads((output / spec.receipt).read_text())
        if reference != evidence["references"] or evidence["sourceSha256"] != spec.source_sha:
            raise ValueError("The source or original view pins changed between phases.")
        render(source, output, args.render, evidence, spec)
    else:
        evidence = create(source, references, output, spec)
        (output / spec.receipt).write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    run(WING, sys.argv[sys.argv.index("--") + 1:])
