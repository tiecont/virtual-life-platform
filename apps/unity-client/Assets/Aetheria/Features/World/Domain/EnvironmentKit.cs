using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    public enum WorldKitShape
    {
        Cube = 0,
        Cylinder = 1,
        Sphere = 2,
        Quad = 3,
        Capsule = 4
    }

    public enum WorldKitCategory
    {
        Ground = 0,
        Structure = 1,
        Board = 2,
        Prop = 3,
        Lighting = 4,
        Portal = 5,
        Actor = 6,
        Ambient = 7
    }

    public enum WorldAmbientMotion
    {
        None = 0,
        Rotate = 1,
        Bob = 2,
        Sway = 3,
        Pulse = 4
    }

    public sealed class WorldKitPart
    {
        public WorldKitPart(
            string id,
            string displayName,
            WorldKitCategory category,
            WorldKitShape shape,
            WorldPoint scale,
            string materialKey,
            bool collider,
            WorldAmbientMotion motion = WorldAmbientMotion.None,
            float motionAmplitude = 0f,
            float motionSpeed = 0f)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Kit part id is required.", nameof(id));
            if (scale.X <= 0f || scale.Y <= 0f || scale.Z <= 0f)
                throw new ArgumentOutOfRangeException(nameof(scale), "Kit part scale must be positive.");
            if (!WorldMaterialKeys.IsThemeKey(materialKey))
                throw new ArgumentException("Unknown kit material key: " + materialKey, nameof(materialKey));
            Id = id;
            DisplayName = displayName;
            Category = category;
            Shape = shape;
            Scale = scale;
            MaterialKey = materialKey;
            Collider = collider;
            Motion = motion;
            MotionAmplitude = motionAmplitude;
            MotionSpeed = motionSpeed;
        }

        public string Id { get; }
        public string DisplayName { get; }
        public WorldKitCategory Category { get; }
        public WorldKitShape Shape { get; }
        public WorldPoint Scale { get; }
        public string MaterialKey { get; }
        public bool Collider { get; }
        public WorldAmbientMotion Motion { get; }
        public float MotionAmplitude { get; }
        public float MotionSpeed { get; }
    }

    // The reusable modular environment kit. Every scene composition is data
    // (WorldPropPlacement) referencing these parts, so a later map can be
    // composed without new geometry code. Shapes are development primitives and
    // are explicitly intermediate, not production art.
    public static class EnvironmentKit
    {
        public static IReadOnlyList<WorldKitPart> Parts { get; } = Array.AsReadOnly(new[]
        {
            new WorldKitPart("floor-slab", "Ground slab", WorldKitCategory.Ground,
                WorldKitShape.Cube, new WorldPoint(30f, .4f, 30f), WorldMaterialKeys.Stone, true),
            new WorldKitPart("plaza-disc", "Plaza disc", WorldKitCategory.Ground,
                WorldKitShape.Cylinder, new WorldPoint(26f, .06f, 26f), WorldMaterialKeys.Stone, false),
            new WorldKitPart("plaza-ring", "Plaza ring", WorldKitCategory.Ground,
                WorldKitShape.Cylinder, new WorldPoint(14f, .02f, 14f), WorldMaterialKeys.StoneDeep, false),
            new WorldKitPart("plaza-medallion", "Plaza medallion", WorldKitCategory.Ground,
                WorldKitShape.Cylinder, new WorldPoint(7f, .015f, 7f), WorldMaterialKeys.Trim, false),
            new WorldKitPart("path-slab", "Path slab", WorldKitCategory.Ground,
                WorldKitShape.Cube, new WorldPoint(5f, .06f, 8f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("platform", "Platform block", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(1f, .3f, 1f), WorldMaterialKeys.Stone, true),
            new WorldKitPart("terrace-step", "Terrace step", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(1f, .4f, 1f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("plinth", "Plinth", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(3f, .3f, 1.2f), WorldMaterialKeys.Trim, true),
            new WorldKitPart("foundation-plinth", "Foundation plinth", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(3.6f, .4f, 1.2f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("rail", "Boundary rail", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(4f, 1.2f, .35f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("pillar", "Pillar shaft", WorldKitCategory.Structure,
                WorldKitShape.Cylinder, new WorldPoint(.8f, 2.4f, .8f), WorldMaterialKeys.StoneDeep, false),
            new WorldKitPart("pillar-base", "Pillar base", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(1.2f, .3f, 1.2f), WorldMaterialKeys.Trim, true),
            new WorldKitPart("arch-segment", "Arch segment", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(.35f, .7f, .5f), WorldMaterialKeys.Trim, false),
            new WorldKitPart("gate-leg", "Gate leg", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(.4f, 2.2f, .5f), WorldMaterialKeys.Metal, false),
            new WorldKitPart("board-base", "Board plinth", WorldKitCategory.Board,
                WorldKitShape.Cube, new WorldPoint(10f, .88f, 10f), WorldMaterialKeys.Metal, true),
            new WorldKitPart("board-tile", "Board tile", WorldKitCategory.Board,
                WorldKitShape.Cube, new WorldPoint(.96f, .14f, .96f), WorldMaterialKeys.BoardLight, false),
            new WorldKitPart("board-grid", "Board grid line", WorldKitCategory.Board,
                WorldKitShape.Cube, new WorldPoint(8.4f, .006f, .035f), WorldMaterialKeys.Grid, false),
            new WorldKitPart("board-rim", "Board rim", WorldKitCategory.Board,
                WorldKitShape.Cube, new WorldPoint(9.2f, .24f, .3f), WorldMaterialKeys.Metal, true),
            new WorldKitPart("board-emblem", "Board emblem", WorldKitCategory.Board,
                WorldKitShape.Cylinder, new WorldPoint(2.2f, .01f, 2.2f), WorldMaterialKeys.Accent, false,
                WorldAmbientMotion.Pulse, .06f, .8f),
            new WorldKitPart("spawn-pad", "Spawn pad", WorldKitCategory.Ground,
                WorldKitShape.Cylinder, new WorldPoint(3f, .02f, 3f), WorldMaterialKeys.Trim, false),
            new WorldKitPart("spawn-glyph", "Spawn glyph", WorldKitCategory.Ground,
                WorldKitShape.Cube, new WorldPoint(1.6f, .02f, .12f), WorldMaterialKeys.Accent, false,
                WorldAmbientMotion.Pulse, .18f, 1.2f),
            new WorldKitPart("post", "Lamp post", WorldKitCategory.Prop,
                WorldKitShape.Cylinder, new WorldPoint(.18f, 1.7f, .18f), WorldMaterialKeys.Metal, false),
            new WorldKitPart("lamp-base", "Lamp base", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(.5f, .25f, .5f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("lamp-globe", "Lamp globe", WorldKitCategory.Lighting,
                WorldKitShape.Sphere, new WorldPoint(.45f, .45f, .45f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .1f, 1.1f),
            new WorldKitPart("banner-pole", "Banner pole", WorldKitCategory.Prop,
                WorldKitShape.Cylinder, new WorldPoint(.12f, 2.4f, .12f), WorldMaterialKeys.Metal, false),
            new WorldKitPart("banner", "Banner cloth", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(1.4f, 1.8f, .06f), WorldMaterialKeys.Cloth, false,
                WorldAmbientMotion.Sway, 7f, .8f),
            new WorldKitPart("bench", "Bench seat", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(2.6f, .45f, .9f), WorldMaterialKeys.Wood, true),
            new WorldKitPart("bench-back", "Bench back", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(2.6f, .9f, .18f), WorldMaterialKeys.Wood, true),
            new WorldKitPart("planter", "Planter", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(1.6f, .6f, 1.6f), WorldMaterialKeys.StoneDeep, true),
            new WorldKitPart("shrub", "Shrub", WorldKitCategory.Prop,
                WorldKitShape.Sphere, new WorldPoint(1.1f, .9f, 1.1f), WorldMaterialKeys.Flora, false,
                WorldAmbientMotion.Sway, 2f, .6f),
            new WorldKitPart("crate", "Crate", WorldKitCategory.Prop,
                WorldKitShape.Cube, new WorldPoint(.9f, .9f, .9f), WorldMaterialKeys.Wood, true),
            new WorldKitPart("sigil-core", "Plaza sigil core", WorldKitCategory.Prop,
                WorldKitShape.Sphere, new WorldPoint(.7f, .7f, .7f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .12f, 1.4f),
            new WorldKitPart("sigil-ring", "Plaza sigil ring", WorldKitCategory.Prop,
                WorldKitShape.Cylinder, new WorldPoint(4.2f, .02f, 4.2f), WorldMaterialKeys.Accent, false,
                WorldAmbientMotion.Rotate, 0f, 14f),
            new WorldKitPart("portal-surface", "Portal surface", WorldKitCategory.Portal,
                WorldKitShape.Cube, new WorldPoint(1.8f, 2.4f, .08f), WorldMaterialKeys.Accent, false,
                WorldAmbientMotion.Pulse, .05f, .9f),
            new WorldKitPart("portal-glyph", "Portal glyph", WorldKitCategory.Portal,
                WorldKitShape.Cube, new WorldPoint(.18f, .18f, .18f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .12f, 1.6f),
            new WorldKitPart("dormant-glyph", "Dormant map glyph", WorldKitCategory.Portal,
                WorldKitShape.Cube, new WorldPoint(.4f, 1.8f, .4f), WorldMaterialKeys.Grid, false,
                WorldAmbientMotion.Pulse, .04f, .5f),
            new WorldKitPart("mote", "Drifting mote", WorldKitCategory.Ambient,
                WorldKitShape.Sphere, new WorldPoint(.12f, .12f, .12f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Bob, .5f, .7f),
            new WorldKitPart("ember", "Ember mote", WorldKitCategory.Ambient,
                WorldKitShape.Sphere, new WorldPoint(.16f, .16f, .16f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Bob, .8f, 1.4f),
            new WorldKitPart("bubble", "Bubble mote", WorldKitCategory.Ambient,
                WorldKitShape.Sphere, new WorldPoint(.14f, .14f, .14f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Bob, .9f, 1f),
            new WorldKitPart("water-plane", "Lagoon water", WorldKitCategory.Ground,
                WorldKitShape.Quad, new WorldPoint(26f, 1f, 26f), WorldMaterialKeys.Water, false,
                WorldAmbientMotion.Pulse, .02f, .4f),
            new WorldKitPart("tide-ring", "Tide ring", WorldKitCategory.Ambient,
                WorldKitShape.Cylinder, new WorldPoint(3.4f, .01f, 3.4f), WorldMaterialKeys.Accent, false,
                WorldAmbientMotion.Pulse, .06f, .5f),
            new WorldKitPart("coral-segment", "Reef segment", WorldKitCategory.Structure,
                WorldKitShape.Cube, new WorldPoint(.5f, 1.2f, .4f), WorldMaterialKeys.Trim, false),
            new WorldKitPart("brazier", "Brazier bowl", WorldKitCategory.Prop,
                WorldKitShape.Cylinder, new WorldPoint(.8f, .5f, .8f), WorldMaterialKeys.Metal, false),
            new WorldKitPart("brazier-fire", "Brazier flame", WorldKitCategory.Lighting,
                WorldKitShape.Sphere, new WorldPoint(.7f, .5f, .7f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .18f, 1.6f),
            new WorldKitPart("actor-pedestal", "Actor pedestal", WorldKitCategory.Structure,
                WorldKitShape.Cylinder, new WorldPoint(2.6f, .08f, 2.6f), WorldMaterialKeys.Trim, false),
            new WorldKitPart("pet-body", "Icarus body", WorldKitCategory.Actor,
                WorldKitShape.Capsule, new WorldPoint(.9f, .75f, .75f), WorldMaterialKeys.PetPrimary, false,
                WorldAmbientMotion.Bob, .04f, 1.1f),
            new WorldKitPart("pet-head", "Icarus head", WorldKitCategory.Actor,
                WorldKitShape.Sphere, new WorldPoint(.55f, .55f, .55f), WorldMaterialKeys.PetSecondary, false),
            new WorldKitPart("pet-crest", "Icarus crest", WorldKitCategory.Actor,
                WorldKitShape.Cube, new WorldPoint(.12f, .5f, .12f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .06f, 1f),
            new WorldKitPart("enemy-body", "Arena enemy body", WorldKitCategory.Actor,
                WorldKitShape.Capsule, new WorldPoint(1f, .85f, .85f), WorldMaterialKeys.EnemyPrimary, false,
                WorldAmbientMotion.Bob, .04f, .9f),
            new WorldKitPart("enemy-head", "Arena enemy head", WorldKitCategory.Actor,
                WorldKitShape.Sphere, new WorldPoint(.6f, .6f, .6f), WorldMaterialKeys.EnemySecondary, false),
            new WorldKitPart("enemy-crest", "Arena enemy crest", WorldKitCategory.Actor,
                WorldKitShape.Cube, new WorldPoint(.16f, .7f, .16f), WorldMaterialKeys.Emissive, false,
                WorldAmbientMotion.Pulse, .05f, 1.2f)
        });

        private static readonly Dictionary<string, WorldKitPart> Lookup = BuildLookup();

        public static IReadOnlyDictionary<string, WorldKitPart> ById => Lookup;

        public static WorldKitPart Get(string id)
        {
            if (!Lookup.TryGetValue(id, out var part))
                throw new KeyNotFoundException("Unknown environment kit part: " + id);
            return part;
        }

        public static bool TryGet(string id, out WorldKitPart part) => Lookup.TryGetValue(id, out part);

        private static Dictionary<string, WorldKitPart> BuildLookup()
        {
            var lookup = new Dictionary<string, WorldKitPart>(StringComparer.Ordinal);
            foreach (var part in Parts)
            {
                if (lookup.ContainsKey(part.Id))
                    throw new InvalidOperationException("Duplicate environment kit part id: " + part.Id);
                lookup.Add(part.Id, part);
            }
            return lookup;
        }
    }
}
