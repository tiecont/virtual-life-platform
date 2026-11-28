using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    public sealed class WorldSpawnAnchor
    {
        public WorldSpawnAnchor(string id, WorldPoint position, float yaw)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Spawn id is required.", nameof(id));
            Id = id;
            Position = position;
            Yaw = yaw;
        }

        public string Id { get; }
        public WorldPoint Position { get; }
        public float Yaw { get; }
    }

    public sealed class WorldPortalDefinition
    {
        public WorldPortalDefinition(
            string id,
            string label,
            WorldPoint position,
            float yaw,
            WorldMapElement element,
            bool interactable,
            string targetScene,
            string targetSpawnId,
            string status,
            string portalMaterialKey)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Portal id is required.", nameof(id));
            if (string.IsNullOrEmpty(label)) throw new ArgumentException("Portal label is required.", nameof(label));
            Id = id;
            Label = label;
            Position = position;
            Yaw = yaw;
            Element = element;
            Interactable = interactable;
            TargetScene = targetScene ?? string.Empty;
            TargetSpawnId = targetSpawnId ?? string.Empty;
            Status = status ?? string.Empty;
            PortalMaterialKey = portalMaterialKey ?? string.Empty;
        }

        public string Id { get; }
        public string Label { get; }
        public WorldPoint Position { get; }
        public float Yaw { get; }
        public WorldMapElement Element { get; }
        public bool Interactable { get; }
        public string TargetScene { get; }
        public string TargetSpawnId { get; }
        public string Status { get; }
        public string PortalMaterialKey { get; }
        public bool IsFoundationMarker => !Interactable && string.IsNullOrEmpty(TargetScene);
    }

    public sealed class WorldActorDefinition
    {
        public WorldActorDefinition(string role, string label, WorldPoint position, float yaw)
        {
            if (string.IsNullOrEmpty(role)) throw new ArgumentException("Actor role is required.", nameof(role));
            if (string.IsNullOrEmpty(label)) throw new ArgumentException("Actor label is required.", nameof(label));
            Role = role;
            Label = label;
            Position = position;
            Yaw = yaw;
        }

        public string Role { get; }
        public string Label { get; }
        public WorldPoint Position { get; }
        public float Yaw { get; }
    }

    public sealed class WorldCameraFrame
    {
        public WorldCameraFrame(WorldPoint position, WorldPoint target, float fieldOfView)
        {
            if (fieldOfView < 20f || fieldOfView > 90f)
                throw new ArgumentOutOfRangeException(nameof(fieldOfView), "Arena camera FOV must stay readable.");
            Position = position;
            Target = target;
            FieldOfView = fieldOfView;
        }

        public WorldPoint Position { get; }
        public WorldPoint Target { get; }
        public float FieldOfView { get; }
    }

    public sealed class WorldPropPlacement
    {
        public WorldPropPlacement(
            string partId,
            string name,
            string group,
            WorldPoint position,
            WorldEuler rotation,
            WorldPoint scale,
            string materialKey,
            float motionPhase)
        {
            if (string.IsNullOrEmpty(partId)) throw new ArgumentException("Placement part id is required.", nameof(partId));
            if (string.IsNullOrEmpty(name)) throw new ArgumentException("Placement name is required.", nameof(name));
            PartId = partId;
            Name = name;
            Group = string.IsNullOrEmpty(group) ? "environment" : group;
            Position = position;
            Rotation = rotation;
            Scale = scale;
            MaterialKey = materialKey ?? string.Empty;
            MotionPhase = motionPhase;
        }

        public string PartId { get; }
        public string Name { get; }
        public string Group { get; }
        public WorldPoint Position { get; }
        public WorldEuler Rotation { get; }
        // Zero means the kit part's default scale.
        public WorldPoint Scale { get; }
        public string MaterialKey { get; }
        public float MotionPhase { get; }
    }

    public sealed class WorldLayout
    {
        public WorldLayout(
            string mapId,
            string displayName,
            WorldLayoutKind kind,
            WorldTheme theme,
            WorldMapElement element,
            string sceneName,
            WorldPoint boundsMin,
            WorldPoint boundsMax,
            IReadOnlyList<WorldSpawnAnchor> spawnAnchors,
            string defaultSpawnId,
            IReadOnlyList<WorldPortalDefinition> portals,
            WorldBoardDefinition board,
            IReadOnlyList<WorldActorDefinition> actors,
            WorldCameraFrame camera,
            IReadOnlyList<WorldPropPlacement> placements,
            string contentStage,
            bool previewOnly)
        {
            MapId = mapId;
            DisplayName = displayName;
            Kind = kind;
            Theme = theme;
            Element = element;
            SceneName = sceneName ?? string.Empty;
            BoundsMin = boundsMin;
            BoundsMax = boundsMax;
            SpawnAnchors = spawnAnchors ?? Array.Empty<WorldSpawnAnchor>();
            DefaultSpawnId = defaultSpawnId ?? string.Empty;
            Portals = portals ?? Array.Empty<WorldPortalDefinition>();
            Board = board;
            Actors = actors ?? Array.Empty<WorldActorDefinition>();
            Camera = camera;
            Placements = placements ?? Array.Empty<WorldPropPlacement>();
            ContentStage = contentStage ?? string.Empty;
            PreviewOnly = previewOnly;
        }

        public string MapId { get; }
        public string DisplayName { get; }
        public WorldLayoutKind Kind { get; }
        public WorldTheme Theme { get; }
        public WorldMapElement Element { get; }
        public string SceneName { get; }
        public WorldPoint BoundsMin { get; }
        public WorldPoint BoundsMax { get; }
        public IReadOnlyList<WorldSpawnAnchor> SpawnAnchors { get; }
        public string DefaultSpawnId { get; }
        public IReadOnlyList<WorldPortalDefinition> Portals { get; }
        public WorldBoardDefinition Board { get; }
        public IReadOnlyList<WorldActorDefinition> Actors { get; }
        public WorldCameraFrame Camera { get; }
        public IReadOnlyList<WorldPropPlacement> Placements { get; }
        public string ContentStage { get; }
        // Foundation previews are composed by the same kit for tests but are
        // never saved as scenes or added to build settings.
        public bool PreviewOnly { get; }

        public bool Contains(WorldPoint point, float margin = 0f) =>
            point.X >= BoundsMin.X - margin && point.X <= BoundsMax.X + margin &&
            point.Z >= BoundsMin.Z - margin && point.Z <= BoundsMax.Z + margin;

        public WorldSpawnAnchor FindSpawn(string id)
        {
            for (var index = 0; index < SpawnAnchors.Count; index++)
                if (string.Equals(SpawnAnchors[index].Id, id, StringComparison.Ordinal))
                    return SpawnAnchors[index];
            return null;
        }

        public IReadOnlyList<WorldPortalDefinition> ActivePortals()
        {
            var active = new List<WorldPortalDefinition>();
            for (var index = 0; index < Portals.Count; index++)
                if (Portals[index].Interactable) active.Add(Portals[index]);
            return active;
        }
    }
}
