using System;
using System.Collections.Generic;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    public sealed class WorldSceneComposition
    {
        public WorldMapIdentity Identity;
        public WorldPlayerMotor Player;
        public WorldCameraRig CameraRig;
        public WorldPortalGate[] Portals;
        public Transform[] SpawnAnchors;
        public string[] SpawnAnchorIds;
        public Transform BoardRoot;
        public Renderer[] BoardTiles;
        public Transform PetActor;
        public Transform EnemyActor;
        public WorldHud Hud;
        public Light Sun;
    }

    // Instantiates a WorldLayout into the open scene using the reusable modular
    // kit and the shared URP material palette. The composed objects are saved
    // into the scene, so a scene is never an empty scene file.
    public static class WorldSceneComposer
    {
        public static WorldSceneComposition Compose(
            Transform root,
            WorldLayout layout,
            IReadOnlyDictionary<string, Material> materials)
        {
            var problems = WorldLayoutValidator.Validate(layout);
            if (problems.Count > 0)
                throw new InvalidOperationException("Invalid world layout '" + layout.MapId + "': " +
                                                    string.Join("; ", problems));

            var composition = new WorldSceneComposition();
            var groups = new Dictionary<string, Transform>(StringComparer.Ordinal);
            var tiles = new List<Renderer>();

            foreach (var placement in layout.Placements)
            {
                var part = EnvironmentKit.Get(placement.PartId);
                var anchor = GroupAnchor(layout, placement.Group);
                var group = EnsureGroup(root, groups, placement.Group, anchor);
                var primitive = GameObject.CreatePrimitive(ToPrimitive(part.Shape));
                primitive.name = placement.Name;
                primitive.transform.SetParent(group, false);
                primitive.transform.localPosition = ToVector3(placement.Position) - anchor;
                primitive.transform.localRotation =
                    Quaternion.Euler(placement.Rotation.X, placement.Rotation.Y, placement.Rotation.Z);
                primitive.transform.localScale = IsDefaultScale(placement.Scale)
                    ? ToVector3(part.Scale)
                    : ToVector3(placement.Scale);

                var collider = primitive.GetComponent<Collider>();
                if (collider != null && !part.Collider) Object.DestroyImmediate(collider);

                var renderer = primitive.GetComponent<Renderer>();
                if (renderer != null)
                {
                    renderer.sharedMaterial = ResolveMaterial(layout.Theme, placement.MaterialKey, part.MaterialKey, materials);
                    renderer.shadowCastingMode = part.Category == WorldKitCategory.Ambient
                        ? ShadowCastingMode.Off
                        : ShadowCastingMode.On;
                    renderer.receiveShadows = part.Category != WorldKitCategory.Ambient;
                    if (string.Equals(placement.Group, "board", StringComparison.Ordinal) &&
                        string.Equals(part.Id, "board-tile", StringComparison.Ordinal))
                        tiles.Add(renderer);
                }

                if (part.Motion != WorldAmbientMotion.None)
                {
                    var mover = primitive.AddComponent<WorldAmbientMover>();
                    mover.Configure(part.Motion, part.MotionAmplitude, part.MotionSpeed, placement.MotionPhase);
                }
            }

            var portals = new List<WorldPortalGate>();
            foreach (var definition in layout.Portals)
            {
                var groupName = "portal:" + definition.Id;
                var group = EnsureGroup(root, groups, groupName, ToVector3(definition.Position));
                var gate = group.GetComponent<WorldPortalGate>();
                if (gate == null) gate = group.gameObject.AddComponent<WorldPortalGate>();
                gate.Configure(definition);
                portals.Add(gate);
            }

            var anchors = new List<Transform>();
            var anchorIds = new List<string>();
            foreach (var spawn in layout.SpawnAnchors)
            {
                var anchorObject = new GameObject("Spawn: " + spawn.Id);
                anchorObject.transform.SetParent(root, false);
                anchorObject.transform.position = ToVector3(spawn.Position);
                anchorObject.transform.rotation = Quaternion.Euler(0f, spawn.Yaw, 0f);
                anchors.Add(anchorObject.transform);
                anchorIds.Add(spawn.Id);
            }

            var defaultSpawn = layout.FindSpawn(layout.DefaultSpawnId);
            var playerObject = new GameObject("World Player");
            playerObject.transform.SetParent(root, false);
            var controller = playerObject.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = .35f;
            controller.center = new Vector3(0f, .9f, 0f);
            controller.slopeLimit = 45f;
            controller.stepOffset = .3f;
            controller.skinWidth = .05f;
            controller.minMoveDistance = 0f;
            var player = playerObject.AddComponent<WorldPlayerMotor>();
            CreateFigure(playerObject.transform, layout.Theme, materials);
            if (defaultSpawn != null)
            {
                playerObject.transform.position = ToVector3(defaultSpawn.Position);
                playerObject.transform.rotation = Quaternion.Euler(0f, defaultSpawn.Yaw, 0f);
            }

            var cameraObject = new GameObject("World Camera");
            cameraObject.transform.SetParent(root, false);
            cameraObject.tag = "MainCamera";
            cameraObject.AddComponent<AudioListener>();
            cameraObject.AddComponent<Camera>();
            var rig = cameraObject.AddComponent<WorldCameraRig>();
            rig.Configure(ToVector3(layout.Camera.Position), ToVector3(layout.Camera.Target),
                layout.Camera.FieldOfView, ToColor(layout.Theme.Background));

            var sunObject = new GameObject("Sun");
            sunObject.transform.SetParent(root, false);
            sunObject.transform.rotation = Quaternion.Euler(
                layout.Theme.SunRotation.X, layout.Theme.SunRotation.Y, layout.Theme.SunRotation.Z);
            var sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = ToColor(layout.Theme.SunColor);
            sun.intensity = layout.Theme.SunIntensity;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = .78f;
            ApplyAtmosphere(layout.Theme, sun);

            var identity = root.gameObject.AddComponent<WorldMapIdentity>();
            identity.Configure(layout);
            var hud = root.gameObject.AddComponent<WorldHud>();

            composition.Identity = identity;
            composition.Player = player;
            composition.CameraRig = rig;
            composition.Portals = portals.ToArray();
            composition.SpawnAnchors = anchors.ToArray();
            composition.SpawnAnchorIds = anchorIds.ToArray();
            composition.BoardRoot = groups.TryGetValue("board", out var board) ? board : null;
            composition.BoardTiles = tiles.ToArray();
            composition.PetActor = groups.TryGetValue("actor-pet", out var pet) ? pet : null;
            composition.EnemyActor = groups.TryGetValue("actor-enemy", out var enemy) ? enemy : null;
            composition.Hud = hud;
            composition.Sun = sun;
            return composition;
        }

        private static void ApplyAtmosphere(WorldTheme theme, Light sun)
        {
            RenderSettings.sun = sun;
            RenderSettings.fog = theme.FogEnabled;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = ToColor(theme.Fog);
            RenderSettings.fogStartDistance = theme.FogStart;
            RenderSettings.fogEndDistance = theme.FogEnd;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ToColor(theme.AmbientSky);
            RenderSettings.ambientEquatorColor = ToColor(theme.AmbientEquator);
            RenderSettings.ambientGroundColor = ToColor(theme.AmbientGround);
            RenderSettings.ambientIntensity = theme.AmbientIntensity;
        }

        private static void CreateFigure(
            Transform parent,
            WorldTheme theme,
            IReadOnlyDictionary<string, Material> materials)
        {
            CreatePart(parent, "Icarus figure body", PrimitiveType.Capsule,
                new Vector3(0f, .95f, 0f), new Vector3(.72f, .62f, .72f),
                ResolveMaterial(theme, string.Empty, WorldMaterialKeys.PetPrimary, materials));
            CreatePart(parent, "Icarus figure head", PrimitiveType.Sphere,
                new Vector3(0f, 1.78f, 0f), new Vector3(.5f, .5f, .5f),
                ResolveMaterial(theme, string.Empty, WorldMaterialKeys.PetSecondary, materials));
            CreatePart(parent, "Icarus figure crest", PrimitiveType.Cube,
                new Vector3(0f, 2.06f, 0f), new Vector3(.09f, .3f, .09f),
                ResolveMaterial(theme, string.Empty, WorldMaterialKeys.Emissive, materials));
        }

        private static GameObject CreatePart(
            Transform parent,
            string name,
            PrimitiveType type,
            Vector3 localPosition,
            Vector3 localScale,
            Material material)
        {
            var part = GameObject.CreatePrimitive(type);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            var collider = part.GetComponent<Collider>();
            if (collider != null) Object.DestroyImmediate(collider);
            var renderer = part.GetComponent<Renderer>();
            if (renderer != null) renderer.sharedMaterial = material;
            return part;
        }

        private static Material ResolveMaterial(
            WorldTheme theme,
            string placementKey,
            string partKey,
            IReadOnlyDictionary<string, Material> materials)
        {
            var key = string.IsNullOrEmpty(placementKey) ? partKey : placementKey;
            if (materials.TryGetValue(key, out var shared)) return shared;
            if (materials.TryGetValue(theme.Id + ":" + key, out var themed)) return themed;
            throw new InvalidOperationException("No material is bound for key '" + key + "' in theme " + theme.Id + ".");
        }

        private static Transform EnsureGroup(
            Transform root,
            Dictionary<string, Transform> groups,
            string name,
            Vector3 anchor)
        {
            if (groups.TryGetValue(name, out var existing)) return existing;
            var groupObject = new GameObject("Group: " + name);
            groupObject.transform.SetParent(root, false);
            groupObject.transform.position = anchor;
            groups.Add(name, groupObject.transform);
            return groupObject.transform;
        }

        private static Vector3 GroupAnchor(WorldLayout layout, string group)
        {
            const string portalPrefix = "portal:";
            if (group.StartsWith(portalPrefix, StringComparison.Ordinal))
            {
                var id = group.Substring(portalPrefix.Length);
                foreach (var portal in layout.Portals)
                    if (string.Equals(portal.Id, id, StringComparison.Ordinal))
                        return ToVector3(portal.Position);
            }
            if (string.Equals(group, "actor-pet", StringComparison.Ordinal) ||
                string.Equals(group, "actor-enemy", StringComparison.Ordinal))
            {
                var role = string.Equals(group, "actor-pet", StringComparison.Ordinal) ? "pet" : "enemy";
                foreach (var actor in layout.Actors)
                    if (string.Equals(actor.Role, role, StringComparison.Ordinal))
                        return ToVector3(actor.Position);
            }
            return Vector3.zero;
        }

        private static PrimitiveType ToPrimitive(WorldKitShape shape)
        {
            switch (shape)
            {
                case WorldKitShape.Cube: return PrimitiveType.Cube;
                case WorldKitShape.Cylinder: return PrimitiveType.Cylinder;
                case WorldKitShape.Sphere: return PrimitiveType.Sphere;
                case WorldKitShape.Quad: return PrimitiveType.Quad;
                case WorldKitShape.Capsule: return PrimitiveType.Capsule;
                default: throw new ArgumentOutOfRangeException(nameof(shape), shape, "Unsupported kit shape.");
            }
        }

        private static bool IsDefaultScale(WorldPoint scale) =>
            scale.X <= 0f && scale.Y <= 0f && scale.Z <= 0f;

        private static Vector3 ToVector3(WorldPoint point) => new Vector3(point.X, point.Y, point.Z);

        private static Color ToColor(WorldColor color) => new Color(color.R, color.G, color.B, color.A);
    }
}
