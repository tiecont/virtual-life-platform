"""Stage rough primary feather regions on the exact owner-selected fused surface."""

from argparse import ArgumentParser
from copy import deepcopy
import heapq
import json
from math import hypot
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_wing_parts import accessor, checksum, parse_glb

SOURCE_SHA = "be86f92ab8aff6e22e9a3f7f9a8e355305aa0f7b7329926f800be2d7605f4524"
# Measured radial outline peaks on the source in its horizontal Z, up Y frame.
# The source pair is nearly symmetric. Each landmark snaps to its own side.
TIPS = [
    (.259, .449), (.349, .490), (.383, .429), (.492, .338), (.449, .243),
    (.470, .202), (.500, .122), (.384, .010), (.287, .024), (.243, .000),
]
STEP = .002
NEIGHBORS = [(dx, dy, hypot(dx, dy)) for dx in (-1, 0, 1)
             for dy in (-1, 0, 1) if dx or dy]


def part_field(positions, triangles, normals):
    # A single projected field represents both thin sides of this shell.
    # Faces keep their exact coordinates. Only their material/part assignment
    # uses the projected centroid and source relief neighborhoods.
    centers = positions[triangles].mean(axis=1)
    normal_x = np.abs(normals[triangles, 0].mean(axis=1))
    cloud = np.vstack((positions, centers))
    lower = np.min(cloud[:, [2, 1]], axis=0) - STEP

    def pixels(points):
        return np.floor((points[:, [2, 1]] - lower) / STEP).astype(np.int32)

    samples = pixels(cloud)
    centroids = samples[len(positions):]
    columns, rows = np.max(samples, axis=0) + 2
    size = int(columns * rows)

    def flat(coords):
        return coords[:, 1] * columns + coords[:, 0]

    bins = flat(samples)
    low, high = np.full(size, np.inf), np.full(size, -np.inf)
    np.minimum.at(low, bins, cloud[:, 0])
    np.maximum.at(high, bins, cloud[:, 0])
    grid = np.flatnonzero(np.isfinite(low))
    thickness = np.zeros(size, dtype=np.float64)
    thickness[grid] = high[grid] - low[grid]
    faces = flat(centroids)
    slope_sum = np.bincount(faces, weights=normal_x, minlength=size)
    slope_count = np.bincount(faces, minlength=size)
    flatness = np.divide(slope_sum, slope_count, out=np.ones(size), where=slope_count > 0)
    thickness_reference = np.percentile(thickness[grid], 85)
    crests = np.clip(thickness / max(thickness_reference, .001), 0, 1)
    # Thin inter-feather valleys and steep relief get higher crossing costs.
    resistance = 1 + 2.0 * (1 - crests) + 1.1 * (1 - flatness)
    occupied = np.zeros(size, dtype=bool)
    occupied[grid] = True
    x, y = np.meshgrid(np.arange(columns), np.arange(rows))
    horiz = lower[0] + (x.ravel() + .5) * STEP
    vertical = lower[1] + (y.ravel() + .5) * STEP
    # Keep the actual central ornament and thin attachment bridge together.
    mount = occupied & (np.abs(horiz) < .056) & (vertical < .185)
    labels = np.full(size, -1, dtype=np.int16)
    labels[mount] = 0
    names = ["central_mount"]
    selected_seeds = []
    orphan_bins = 0
    for sign, side in ((-1, "left"), (1, "right")):
        domain = occupied & ~mount & (horiz >= 0 if sign == 1 else horiz < 0)
        cells = np.flatnonzero(domain)
        side_targets = [(f"{side}_coverts_root", .135, .235)]
        side_targets.extend((f"{side}_primary_{number:02d}", z, height)
                            for number, (z, height) in enumerate(TIPS, 1))
        distances = np.full(size, np.inf)
        pending = []
        seeds = []
        for name, z, height in side_targets:
            spot = int(cells[np.argmin((horiz[cells] - sign * z) ** 2 + (vertical[cells] - height) ** 2)])
            part = len(names)
            names.append(name)
            distances[spot] = 0
            labels[spot] = part
            seeds.append((part, spot))
            heapq.heappush(pending, (0.0, spot))
            selected_seeds.append({
                "group": name,
                "requestedProjectedZY": [sign * z, height],
                "actualSurfaceCellZY": [float(horiz[spot]), float(vertical[spot])],
            })
        while pending:
            cost, cell = heapq.heappop(pending)
            if cost != distances[cell]:
                continue
            row, column = divmod(cell, columns)
            for dx, dy, span in NEIGHBORS:
                nx, ny = column + dx, row + dy
                if not 0 <= nx < columns or not 0 <= ny < rows:
                    continue
                neighbor = ny * columns + nx
                if not domain[neighbor]:
                    continue
                if dx and dy and not (domain[row * columns + nx] or domain[ny * columns + column]):
                    continue
                distance = cost + span * (resistance[cell] + resistance[neighbor]) * .5
                if distance < distances[neighbor]:
                    distances[neighbor] = distance
                    labels[neighbor] = labels[cell]
                    heapq.heappush(pending, (distance, neighbor))
        # A finite voxel projection may leave tiny disconnected tip cells.
        # Assign those only to an actual nearby seed on the same side.
        for cell in cells[labels[cells] < 0]:
            orphan_bins += 1
            labels[cell] = min(seeds, key=lambda pair:
                               (horiz[pair[1]] - horiz[cell]) ** 2 + (vertical[pair[1]] - vertical[cell]) ** 2)[0]

    assigned = labels[faces]
    if np.any(assigned < 0) or len(np.unique(assigned)) != len(names):
        raise ValueError("Every real source triangle and declared part must have an assignment")
    return names, assigned, selected_seeds, orphan_bins


def write_parts(path, source, source_binary, attributes, triangles, material, names, assigned):
    document = deepcopy(source)
    data = bytearray(source_binary)

    def append(values, kind, target):
        offset = len(data)
        payload = values.tobytes()
        data.extend(payload)
        view = len(document["bufferViews"])
        document["bufferViews"].append({
            "buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target,
        })
        row = {"bufferView": view, "componentType": 5125 if target == 34963 else 5126,
               "type": kind, "count": len(values)}
        if kind == "VEC3" and target == 34962:
            row["min"] = values.min(axis=0).tolist()
            row["max"] = values.max(axis=0).tolist()
        document["accessors"].append(row)
        return len(document["accessors"]) - 1

    document["meshes"], document["nodes"] = [], []
    groups = []
    for label, name in enumerate(names):
        faces = triangles[assigned == label]
        used, remapped = np.unique(faces, return_inverse=True)
        local = remapped.reshape(-1, 3).astype("<u4")
        packed = {}
        for field, values in attributes.items():
            part = values[used].astype("<f4", copy=False)
            if not np.array_equal(part[local], values[faces]):
                raise ValueError(f"{name} changed exact source {field} corners")
            packed[field] = append(part, "VEC" + str(part.shape[1]), 34962)
        primitive = {"mode": 4, "attributes": packed, "indices": append(local.ravel(), "SCALAR", 34963), "material": material}
        document["meshes"].append({"name": name, "primitives": [primitive]})
        document["nodes"].append({"name": name, "mesh": label})
        groups.append({"id": label, "name": name, "triangles": int(len(faces))})
    document["scene"] = 0
    document["scenes"] = [{"nodes": list(range(len(names)))}]
    document["buffers"][0]["byteLength"] = len(data)
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(data)
    with path.open("xb") as handle:
        handle.write(struct.pack("<4sIIII", b"glTF", 2, total, len(text), 0x4E4F534A))
        handle.write(text)
        handle.write(struct.pack("<II", len(data), 0x004E4942))
        handle.write(data)
    return groups


def render_groups(candidate, directory, groups):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(candidate))
    names = {group["name"]: group for group in groups}
    colors = [
        (.78, .50, .20), (.78, .79, .95), (.95, .40, .42), (.97, .67, .26),
        (.88, .83, .28), (.52, .84, .36), (.30, .78, .69), (.33, .65, .93),
        (.40, .45, .91), (.61, .39, .91), (.85, .40, .78), (.87, .65, .72),
    ]
    all_corners = []
    seen = set()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        group = names[obj.name]
        obj.data.calc_loop_triangles()
        if len(obj.data.loop_triangles) != group["triangles"]:
            raise RuntimeError(f"Blender did not reimport the exact {obj.name} membership")
        seen.add(obj.name)
        slot = group["id"]
        color = colors[slot if slot < len(colors) else slot - 11]
        diagnostic = bpy.data.materials.new("Review color " + obj.name)
        diagnostic.diffuse_color = (*color, 1)
        obj.data.materials.clear()
        obj.data.materials.append(diagnostic)
        all_corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if seen != set(names):
        raise RuntimeError("Blender did not reimport every declared part")
    minimum = Vector(tuple(min(point[axis] for point in all_corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in all_corners) for axis in range(3)))
    center = (minimum + maximum) / 2
    extent = (maximum - minimum).length
    scene = bpy.context.scene
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = extent * 1.06
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    views = []
    for sign, side in ((1, "plus-x"), (-1, "minus-x")):
        camera.location = center + Vector((sign * extent * 3, 0, 0))
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        filename = directory / f"{side}-part-colors.png"
        scene.render.filepath = str(filename)
        bpy.ops.render.render(write_still=True)
        views.append({"file": filename.name, "sha256": checksum(filename.read_bytes())})
    return views


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Private source regrouping requires Blender 5.3")
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    payload = source.read_bytes()
    if checksum(payload) != SOURCE_SHA:
        raise ValueError("The exact owner-selected wing export is required")
    document, binary = parse_glb(payload)
    (mesh,) = document["meshes"]
    (primitive,) = mesh["primitives"]
    attributes = {
        name: accessor(document, binary, index, 2 if name == "TEXCOORD_0" else 3, {5126})
        for name, index in primitive["attributes"].items()
    }
    triangles = accessor(document, binary, primitive["indices"], 1, {5123, 5125}).reshape(-1, 3)
    names, assigned, seeds, orphans = part_field(attributes["POSITION"], triangles, attributes["NORMAL"])
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    candidate = output / "icarus-wing-primary-regions.glb"
    groups = write_parts(candidate, document, binary, attributes, triangles, primitive["material"], names, assigned)
    staged, staged_binary = parse_glb(candidate.read_bytes())
    if bytes(staged_binary[:len(binary)]) != bytes(binary) or staged["materials"] != document["materials"]:
        raise ValueError("The grouped candidate modified source material or texture bytes")
    map_file = output / "source-triangle-part-ids.u16"
    map_file.write_bytes(assigned.astype("<u2").tobytes())
    preflight = {
        "classification": "PRIVATE_ROUGH_PRIMARY_FEATHER_REGIONS",
        "sourceSha256": SOURCE_SHA,
        "candidateSha256": checksum(candidate.read_bytes()),
        "facePartMapSha256": checksum(map_file.read_bytes()),
        "facePartMap": map_file.name,
        "triangles": len(triangles),
        "parts": groups,
        "landmarks": seeds,
        "unreachedProjectedCellsAssignedToNearestSideSeed": orphans,
        "exactPositionsNormalsUvsAndEmbeddedTextures": True,
        "partitionScope": "Root/mount and primary feather regions on the fused surface. Fine feather separation remains an art review question.",
    }
    report = output / "wing-primary-region-review.json"
    report.write_text(json.dumps(preflight, indent=2) + "\n")
    preflight["frames"] = render_groups(candidate, output, groups)
    if checksum(source.read_bytes()) != SOURCE_SHA:
        raise RuntimeError("Original wing source changed during the private review")
    report.write_text(json.dumps(preflight, indent=2) + "\n")


if __name__ == "__main__":
    main()
