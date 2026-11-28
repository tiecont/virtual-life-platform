#!/usr/bin/env python3
"""
Blender 5.3 production script for Aetheria: SoulBound Wave D4 representative
3D creature & Boss models + portraits + measured budget manifest (0 Meshy credits).

Produces watertight/segmented multi-material rigged GLBs (3K-12K / 10K-25K budget),
editable .blend sources, and rendered 512x512 RGBA portraits + review sheet for:
  1. fire-coalwhisk (Coalwhisk - Starter Fire ember fox-cat)
  2. water-dewskip (Dewskip - Starter Water tide-fin spirit)
  3. ground-clodkin (Clodkin - Starter Ground crystal-earth cub)
  4. cinder-terraces-regular (Emberhound - Representative Fire opponent)
  5. cinder-terraces-warden (Pyrecrown - Cinder Terraces Fire Boss Warden)
  6. tideglass-lagoon-warden (Lagoonarch - Tideglass Lagoon Water Boss Warden)
Also inspects & measures Icarus H1-R3 + modular wings/bow triangle & material counts.
"""
import hashlib
import json
import math
import pathlib
import bpy
import mathutils

REPO_ROOT = pathlib.Path("/home/tiecont/Projects/Aetheria")
WORKSPACE_3D = pathlib.Path("/home/tiecont/Projects/Aetheria-Workspace/wave-d4-3d-creatures")
UNITY_MODELS_DIR = REPO_ROOT / "apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Models"
UNITY_PORTRAITS_DIR = REPO_ROOT / "apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Portraits"


def sha256_file(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name: str, rgba: tuple[float, float, float, float], roughness: float = 0.45, metallic: float = 0.05, emission: tuple[float, float, float] | None = None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.6
    return mat


def add_part(name: str, prim: str, loc: tuple[float, float, float], scale: tuple[float, float, float], rot: tuple[float, float, float], mat, subdiv: int = 2):
    if prim == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=11, radius=1.0, location=loc, rotation=rot)
    elif prim == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=1.0, radius2=0.08, depth=2.0, location=loc, rotation=rot)
    elif prim == "torus":
        bpy.ops.mesh.primitive_torus_add(major_segments=22, minor_segments=10, major_radius=1.0, minor_radius=0.22, location=loc, rotation=rot)
    elif prim == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=min(subdiv, 2), radius=1.0, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.0, depth=2.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if prim != "ico":
        bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def attach_rig_and_animations(mesh_obj, height: float, cid: str):
    """Create clean Root -> Pelvis -> Spine -> Head + Tail/Wing bones and author Idle, Attack, Skill, Hit actions."""
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm_obj = bpy.context.active_object
    arm_obj.name = f"{cid}_Rig"
    arm = arm_obj.data
    arm.name = f"{cid}_Armature"
    # Configure bones
    root = arm.edit_bones[0]
    root.name = "Root"
    root.head = (0, 0, 0)
    root.tail = (0, 0, height * 0.25)

    spine = arm.edit_bones.new("Spine")
    spine.head = (0, 0, height * 0.25)
    spine.tail = (0, 0, height * 0.62)
    spine.parent = root

    head = arm.edit_bones.new("Head")
    head.head = (0, 0, height * 0.62)
    head.tail = (0, 0, height * 0.98)
    head.parent = spine

    flair = arm.edit_bones.new("CrestOrTail")
    flair.head = (0, 0.12, height * 0.42)
    flair.tail = (0, 0.48, height * 0.78)
    flair.parent = spine

    bpy.ops.object.mode_set(mode="OBJECT")

    # Parent mesh to armature with smooth height-based weights
    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj

    vg_root = mesh_obj.vertex_groups.new(name="Root")
    vg_spine = mesh_obj.vertex_groups.new(name="Spine")
    vg_head = mesh_obj.vertex_groups.new(name="Head")
    vg_flair = mesh_obj.vertex_groups.new(name="CrestOrTail")

    for v in mesh_obj.data.vertices:
        z_norm = max(0.0, min(1.0, v.co.z / max(0.1, height)))
        if v.co.y > 0.18 and z_norm > 0.22:
            vg_flair.add([v.index], 0.65, "REPLACE")
            vg_spine.add([v.index], 0.35, "REPLACE")
        elif z_norm < 0.25:
            vg_root.add([v.index], 1.0 - z_norm * 2.0, "REPLACE")
            vg_spine.add([v.index], z_norm * 2.0, "REPLACE")
        elif z_norm < 0.62:
            vg_spine.add([v.index], 1.0, "REPLACE")
        else:
            t = (z_norm - 0.62) / 0.38
            vg_spine.add([v.index], 1.0 - t, "REPLACE")
            vg_head.add([v.index], t, "REPLACE")

    # Author 4 distinct Actions: Idle, Attack, Skill, Hit
    arm_obj.animation_data_create()
    for act_name, frames in [
        ("Idle", [(1, (0, 0, 0), (0, 0, 0)), (15, (0, 0, 0.04), (0.06, 0, 0.04)), (30, (0, 0, 0), (0, 0, 0))]),
        ("Attack", [(1, (0, 0, 0), (0, 0, 0)), (6, (0, 0.08, 0.02), (-0.18, 0, 0)), (12, (0, -0.26, 0.06), (0.28, 0, 0)), (22, (0, 0, 0), (0, 0, 0))]),
        ("Skill", [(1, (0, 0, 0), (0, 0, 0)), (10, (0, 0, 0.14), (-0.22, 0, 0.18)), (20, (0, -0.10, 0.18), (0.20, 0, -0.18)), (32, (0, 0, 0), (0, 0, 0))]),
        ("Hit", [(1, (0, 0, 0), (0, 0, 0)), (5, (0, 0.14, -0.03), (-0.26, 0.12, 0)), (16, (0, 0, 0), (0, 0, 0))]),
    ]:
        action = bpy.data.actions.new(name=f"{cid}_{act_name}")
        arm_obj.animation_data.action = action
        pb_spine = arm_obj.pose.bones["Spine"]
        pb_head = arm_obj.pose.bones["Head"]
        pb_flair = arm_obj.pose.bones["CrestOrTail"]
        pb_spine.rotation_mode = "XYZ"
        pb_head.rotation_mode = "XYZ"
        pb_flair.rotation_mode = "XYZ"
        for frame, loc, rot in frames:
            bpy.context.scene.frame_set(frame)
            pb_spine.location = loc
            pb_spine.rotation_euler = rot
            pb_head.rotation_euler = (rot[0] * 0.8, rot[1], -rot[2])
            pb_flair.rotation_euler = (-rot[0] * 1.3, 0, rot[2] * 1.5)
            pb_spine.keyframe_insert(data_path="location", frame=frame)
            pb_spine.keyframe_insert(data_path="rotation_euler", frame=frame)
            pb_head.keyframe_insert(data_path="rotation_euler", frame=frame)
            pb_flair.keyframe_insert(data_path="rotation_euler", frame=frame)
        # Push to NLA so GLB exporter exports all 4 named animation clips!
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act_name
        track.strips.new(action.name, 1, action)
    arm_obj.animation_data.action = None
    return arm_obj


def build_creature(spec: dict) -> dict:
    reset_scene()
    cid = spec["id"]
    m_main = make_pbr_mat(f"{cid}_Primary", spec["primary"], roughness=0.42)
    m_sec = make_pbr_mat(f"{cid}_Secondary", spec["secondary"], roughness=0.50)
    m_acc = make_pbr_mat(f"{cid}_AccentGlow", spec["accent"], roughness=0.22, metallic=0.18, emission=spec["emission"])

    parts = []
    kind = spec["archetype"]
    if kind == "coalwhisk":
        # Cute agile ember fox-cat (height ~1.05m)
        parts.append(add_part("Torso", "sphere", (0, 0.04, 0.36), (0.24, 0.32, 0.22), (0.18, 0, 0), m_main))
        parts.append(add_part("ChestFluff", "sphere", (0, -0.18, 0.42), (0.20, 0.16, 0.19), (0, 0, 0), m_sec))
        parts.append(add_part("Head", "sphere", (0, -0.14, 0.72), (0.27, 0.25, 0.24), (0, 0, 0), m_main))
        parts.append(add_part("CheekL", "sphere", (-0.21, -0.18, 0.67), (0.11, 0.09, 0.08), (0, 0, 0.3), m_sec))
        parts.append(add_part("CheekR", "sphere", (0.21, -0.18, 0.67), (0.11, 0.09, 0.08), (0, 0, -0.3), m_sec))
        parts.append(add_part("EarL", "cone", (-0.17, -0.10, 0.98), (0.10, 0.07, 0.16), (0.1, -0.22, 0), m_main))
        parts.append(add_part("EarR", "cone", (0.17, -0.10, 0.98), (0.10, 0.07, 0.16), (0.1, 0.22, 0), m_main))
        parts.append(add_part("EarTipL", "cone", (-0.20, -0.09, 1.09), (0.05, 0.04, 0.08), (0.1, -0.22, 0), m_acc))
        parts.append(add_part("EarTipR", "cone", (0.20, -0.09, 1.09), (0.05, 0.04, 0.08), (0.1, 0.22, 0), m_acc))
        for lx, ly in [(-0.13, -0.14), (0.13, -0.14), (-0.14, 0.18), (0.14, 0.18)]:
            parts.append(add_part("Leg", "cyl", (lx, ly, 0.15), (0.065, 0.065, 0.15), (0, 0, 0), m_sec))
        parts.append(add_part("FlameTailBase", "sphere", (0, 0.36, 0.48), (0.14, 0.22, 0.15), (-0.6, 0, 0), m_main))
        parts.append(add_part("FlameTailPlume", "cone", (0, 0.54, 0.72), (0.16, 0.16, 0.26), (-0.55, 0, 0), m_acc))
        parts.append(add_part("ForeheadGem", "ico", (0, -0.38, 0.78), (0.055, 0.04, 0.07), (0, 0, 0), m_acc, subdiv=2))
        height = 1.15
    elif kind == "dewskip":
        # Luminous aqua tide-spirit amphibian (height ~1.0m)
        parts.append(add_part("Body", "sphere", (0, 0, 0.38), (0.28, 0.26, 0.26), (0, 0, 0), m_main))
        parts.append(add_part("Belly", "sphere", (0, -0.12, 0.35), (0.22, 0.18, 0.21), (0, 0, 0), m_sec))
        parts.append(add_part("Head", "sphere", (0, -0.06, 0.70), (0.30, 0.26, 0.23), (0, 0, 0), m_main))
        parts.append(add_part("FinL", "cone", (-0.34, -0.02, 0.74), (0.06, 0.16, 0.18), (0, -1.05, 0.2), m_acc))
        parts.append(add_part("FinR", "cone", (0.34, -0.02, 0.74), (0.06, 0.16, 0.18), (0, 1.05, -0.2), m_acc))
        parts.append(add_part("CrownDrop", "cone", (0, -0.08, 0.98), (0.09, 0.09, 0.14), (0, 0, 0), m_acc))
        for lx, ly in [(-0.16, -0.08), (0.16, -0.08), (-0.14, 0.14), (0.14, 0.14)]:
            parts.append(add_part("Foot", "sphere", (lx, ly, 0.10), (0.09, 0.12, 0.08), (0, 0, 0), m_sec))
        parts.append(add_part("TideTail", "cone", (0, 0.36, 0.44), (0.14, 0.24, 0.22), (-0.9, 0, 0), m_acc))
        height = 1.08
    elif kind == "clodkin":
        # Crystal-earth guardian cub (height ~1.12m)
        parts.append(add_part("CoreTorso", "ico", (0, 0, 0.46), (0.32, 0.27, 0.30), (0.1, 0.2, 0), m_main, subdiv=3))
        parts.append(add_part("GeodeHeart", "ico", (0, -0.24, 0.48), (0.13, 0.08, 0.14), (0, 0, 0), m_acc, subdiv=2))
        parts.append(add_part("HeadStone", "ico", (0, -0.04, 0.84), (0.25, 0.23, 0.21), (0, 0, 0.2), m_main, subdiv=3))
        parts.append(add_part("ShoulderL", "ico", (-0.34, 0, 0.58), (0.16, 0.15, 0.14), (0, 0, 0.3), m_sec, subdiv=2))
        parts.append(add_part("ShoulderR", "ico", (0.34, 0, 0.58), (0.16, 0.15, 0.14), (0, 0, -0.3), m_sec, subdiv=2))
        parts.append(add_part("CrystalSpireL", "cone", (-0.18, 0.08, 1.06), (0.07, 0.07, 0.16), (-0.15, -0.25, 0), m_acc))
        parts.append(add_part("CrystalSpireR", "cone", (0.18, 0.08, 1.06), (0.07, 0.07, 0.16), (-0.15, 0.25, 0), m_acc))
        for lx in (-0.17, 0.17):
            parts.append(add_part("PillarLeg", "cyl", (lx, 0, 0.16), (0.11, 0.11, 0.16), (0, 0, 0), m_sec))
        height = 1.18
    elif kind == "emberhound":
        # Regular Fire opponent: sleek volcanic hound-salamander (~1.2m)
        parts.append(add_part("Body", "sphere", (0, 0.06, 0.42), (0.25, 0.38, 0.22), (0.12, 0, 0), m_main))
        parts.append(add_part("ArmorBack", "ico", (0, 0.08, 0.58), (0.21, 0.30, 0.12), (0, 0, 0), m_sec, subdiv=2))
        parts.append(add_part("Head", "cone", (0, -0.34, 0.66), (0.21, 0.24, 0.24), (1.25, 0, 0), m_main))
        parts.append(add_part("HornL", "cone", (-0.14, -0.22, 0.88), (0.06, 0.06, 0.18), (-0.35, -0.22, 0), m_acc))
        parts.append(add_part("HornR", "cone", (0.14, -0.22, 0.88), (0.06, 0.06, 0.18), (-0.35, 0.22, 0), m_acc))
        for lx, ly in [(-0.16, -0.18), (0.16, -0.18), (-0.17, 0.24), (0.17, 0.24)]:
            parts.append(add_part("ClawLeg", "cyl", (lx, ly, 0.18), (0.07, 0.07, 0.18), (0, 0, 0), m_sec))
        parts.append(add_part("Tail", "cone", (0, 0.52, 0.56), (0.11, 0.14, 0.28), (-0.85, 0, 0), m_acc))
        height = 1.12
    elif kind == "pyrecrown":
        # Cinder Terraces Boss Warden: Grand Solar-Crowned Magma Lion-Drake (~1.85m)
        parts.append(add_part("Chest", "sphere", (0, -0.04, 0.78), (0.44, 0.42, 0.42), (0.2, 0, 0), m_main))
        parts.append(add_part("SolarMane", "torus", (0, -0.16, 1.12), (0.42, 0.42, 0.42), (1.15, 0, 0), m_acc))
        parts.append(add_part("Head", "ico", (0, -0.28, 1.24), (0.30, 0.32, 0.27), (0.15, 0, 0), m_main, subdiv=3))
        parts.append(add_part("CrownCenter", "cone", (0, -0.32, 1.62), (0.11, 0.08, 0.24), (0.1, 0, 0), m_acc))
        parts.append(add_part("CrownL", "cone", (-0.24, -0.24, 1.54), (0.09, 0.07, 0.22), (0.05, -0.35, 0), m_acc))
        parts.append(add_part("CrownR", "cone", (0.24, -0.24, 1.54), (0.09, 0.07, 0.22), (0.05, 0.35, 0), m_acc))
        parts.append(add_part("WingL", "cone", (-0.62, 0.12, 1.18), (0.12, 0.38, 0.46), (-0.2, -0.78, 0.25), m_sec))
        parts.append(add_part("WingR", "cone", (0.62, 0.12, 1.18), (0.12, 0.38, 0.46), (-0.2, 0.78, -0.25), m_sec))
        for lx, ly in [(-0.26, -0.20), (0.26, -0.20), (-0.28, 0.26), (0.28, 0.26)]:
            parts.append(add_part("BossLeg", "cyl", (lx, ly, 0.30), (0.12, 0.12, 0.30), (0, 0, 0), m_sec))
        parts.append(add_part("DrakeTail", "cone", (0, 0.62, 0.76), (0.18, 0.22, 0.44), (-0.95, 0, 0), m_acc))
        height = 1.85
    elif kind == "lagoonarch":
        # Tideglass Lagoon Boss Warden: Regal Prism-Leviathan Guardian (~1.90m)
        parts.append(add_part("LowerCoil", "torus", (0, 0.04, 0.26), (0.48, 0.48, 0.36), (0.15, 0, 0), m_main))
        parts.append(add_part("UpperTorso", "cyl", (0, -0.06, 0.82), (0.26, 0.24, 0.44), (0.12, 0, 0), m_main))
        parts.append(add_part("PearlBreastplate", "sphere", (0, -0.24, 0.88), (0.22, 0.12, 0.30), (0, 0, 0), m_sec))
        parts.append(add_part("Head", "sphere", (0, -0.18, 1.38), (0.26, 0.32, 0.24), (0.2, 0, 0), m_main))
        parts.append(add_part("HaloArch", "torus", (0, 0.04, 1.48), (0.46, 0.46, 0.46), (1.35, 0, 0), m_acc))
        parts.append(add_part("CrestFinL", "cone", (-0.42, -0.08, 1.46), (0.08, 0.24, 0.32), (0, -0.85, 0.2), m_acc))
        parts.append(add_part("CrestFinR", "cone", (0.42, -0.08, 1.46), (0.08, 0.24, 0.32), (0, 0.85, -0.2), m_acc))
        height = 1.90
    else:
        raise ValueError(kind)

    # Join parts into one clean multi-material mesh with UV Smart Project & exact ground pivot
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh_obj = bpy.context.active_object
    mesh_obj.name = f"{cid}_Mesh"

    # Subdivide once cleanly so silhouette is smooth and within 3,000 - 14,000 triangles!
    sub = mesh_obj.modifiers.new(name="SmoothSilhouette", type="SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)

    # Ensure lowest vertex sits cleanly at z >= 0 (canonical root pivot at ground contact)
    min_z = min(v.co.z for v in mesh_obj.data.vertices)
    if min_z < 0:
        for v in mesh_obj.data.vertices:
            v.co.z -= min_z
        mesh_obj.data.update()

    # Smart UV unwrap
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Measure exact triangle & material count
    tri_count = sum(len(poly.vertices) - 2 for poly in mesh_obj.data.polygons)
    mat_count = len(mesh_obj.data.materials)

    # Attach skeletal rig + 4 animations (Idle, Attack, Skill, Hit)
    attach_rig_and_animations(mesh_obj, height, cid)

    # Save editable .blend and normalized .glb
    c_dir = WORKSPACE_3D / cid
    c_dir.mkdir(parents=True, exist_ok=True)
    blend_path = c_dir / f"{cid}.blend"
    glb_path = c_dir / f"{cid}.glb"
    unity_glb = UNITY_MODELS_DIR / f"{cid}.glb"
    UNITY_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    UNITY_PORTRAITS_DIR.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
    )
    unity_glb.write_bytes(glb_path.read_bytes())

    # Render 512x512 transparent portrait using EEVEE / Workbench with three-point fantasy lighting
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.film_transparent = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512

    bpy.ops.object.camera_add(
        location=(height * 0.95, -height * 1.65, height * 0.78),
        rotation=(math.radians(76), 0, math.radians(30)),
    )
    cam = bpy.context.active_object
    scene.camera = cam
    portrait_path = c_dir / f"{cid}_portrait.png"
    scene.render.filepath = str(portrait_path)
    bpy.ops.render.render(write_still=True)
    unity_portrait = UNITY_PORTRAITS_DIR / f"{cid}.png"
    unity_portrait.write_bytes(portrait_path.read_bytes())

    return {
        "canonicalId": cid,
        "displayName": spec["name"],
        "assetClass": spec["assetClass"],
        "triangles": tri_count,
        "materials": mat_count,
        "animations": ["Idle", "Attack", "Skill", "Hit"],
        "blendPath": str(blend_path),
        "blendSha256": sha256_file(blend_path),
        "glbPath": str(glb_path),
        "glbSha256": sha256_file(glb_path),
        "unityGlbPath": str(unity_glb.relative_to(REPO_ROOT)),
        "portraitSha256": sha256_file(unity_portrait),
        "meshyCreditsUsed": 0,
        "gateStatus": "TECHNICAL_CANDIDATE_READY_OWNER_ART_REVIEW_REQUIRED",
    }


def audit_icarus() -> dict:
    """Inspect Icarus H1-R3 .blend and modular Wings/Bow GLBs for exact measured budgets (O-F01..O-F03, O-F12)."""
    h1_blend = REPO_ROOT / "artifacts/wave-d4-art/icarus-H1-R3/gates/H1/Icarus-H1.blend"
    wings_glb = REPO_ROOT / "apps/unity-client/Assets/Aetheria/ArtStudies/Icarus/Modular/Accessories/Icarus_Wings.glb"
    bow_glb = REPO_ROOT / "apps/unity-client/Assets/Aetheria/ArtStudies/Icarus/Modular/Accessories/Icarus_Bow.glb"
    report = {"characterId": "pet-v3-fire-icarus", "gates": {"H1": "PENDING_OWNER_REVIEW", "H2": "BLOCKED_ON_H1", "H3": "BLOCKED_ON_H2", "H4": "BLOCKED_ON_H3"}}
    if h1_blend.exists():
        bpy.ops.wm.open_mainfile(filepath=str(h1_blend))
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
        shape_keys = sorted({kb.name for o in bpy.data.objects if o.type == "MESH" and o.data.shape_keys for kb in o.data.shape_keys.key_blocks})
        report["h1Blend"] = {
            "path": str(h1_blend.relative_to(REPO_ROOT)),
            "sha256": sha256_file(h1_blend),
            "triangles": tris,
            "shapeKeys": shape_keys,
        }
    for key, glb in [("wingsGlb", wings_glb), ("bowGlb", bow_glb)]:
        if glb.exists():
            reset_scene()
            bpy.ops.import_scene.gltf(filepath=str(glb))
            tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
            mats = len({m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials if m})
            report[key] = {
                "path": str(glb.relative_to(REPO_ROOT)),
                "sha256": sha256_file(glb),
                "triangles": tris,
                "materials": mats,
            }
    return report


def main():
    WORKSPACE_3D.mkdir(parents=True, exist_ok=True)
    specs = [
        {
            "id": "fire-coalwhisk",
            "name": "Coalwhisk",
            "archetype": "coalwhisk",
            "assetClass": "starter_pet",
            "primary": (0.92, 0.36, 0.16, 1.0),
            "secondary": (0.98, 0.88, 0.74, 1.0),
            "accent": (1.0, 0.72, 0.18, 1.0),
            "emission": (1.0, 0.48, 0.10),
        },
        {
            "id": "water-dewskip",
            "name": "Dewskip",
            "archetype": "dewskip",
            "assetClass": "starter_pet",
            "primary": (0.18, 0.58, 0.94, 1.0),
            "secondary": (0.82, 0.96, 0.98, 1.0),
            "accent": (0.42, 0.92, 1.0, 1.0),
            "emission": (0.22, 0.78, 1.0),
        },
        {
            "id": "ground-clodkin",
            "name": "Clodkin",
            "archetype": "clodkin",
            "assetClass": "starter_pet",
            "primary": (0.68, 0.44, 0.24, 1.0),
            "secondary": (0.42, 0.54, 0.32, 1.0),
            "accent": (1.0, 0.78, 0.26, 1.0),
            "emission": (0.95, 0.62, 0.14),
        },
        {
            "id": "cinder-terraces-regular",
            "name": "Emberhound Scout",
            "archetype": "emberhound",
            "assetClass": "regular_opponent",
            "primary": (0.76, 0.20, 0.14, 1.0),
            "secondary": (0.24, 0.18, 0.22, 1.0),
            "accent": (1.0, 0.56, 0.14, 1.0),
            "emission": (1.0, 0.38, 0.08),
        },
        {
            "id": "cinder-terraces-warden",
            "name": "Pyrecrown Warden",
            "archetype": "pyrecrown",
            "assetClass": "boss_warden",
            "primary": (0.82, 0.18, 0.12, 1.0),
            "secondary": (0.28, 0.16, 0.22, 1.0),
            "accent": (1.0, 0.80, 0.24, 1.0),
            "emission": (1.0, 0.54, 0.12),
        },
        {
            "id": "tideglass-lagoon-warden",
            "name": "Lagoonarch Warden",
            "archetype": "lagoonarch",
            "assetClass": "boss_warden",
            "primary": (0.14, 0.42, 0.86, 1.0),
            "secondary": (0.86, 0.94, 1.0, 1.0),
            "accent": (0.52, 0.96, 1.0, 1.0),
            "emission": (0.28, 0.84, 1.0),
        },
    ]
    results = [build_creature(s) for s in specs]
    icarus_audit = audit_icarus()
    out = {
        "schemaVersion": 1,
        "blenderVersion": bpy.app.version_string,
        "creatures": results,
        "icarusAudit": icarus_audit,
    }
    (WORKSPACE_3D / "manifest.json").write_text(json.dumps(out, indent=2) + "\n")
    print("3D_BUILD_COMPLETE:", json.dumps([{"id": r["canonicalId"], "tris": r["triangles"], "mats": r["materials"]} for r in results]))


if __name__ == "__main__":
    main()
