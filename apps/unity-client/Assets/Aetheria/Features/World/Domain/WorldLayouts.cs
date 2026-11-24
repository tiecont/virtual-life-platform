using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    // Data-driven hub and arena compositions built from EnvironmentKit parts.
    // These are developer-quality compositions: modular primitives, element
    // palettes and authored framing, explicitly intermediate rather than
    // production art. Only Central Plaza, Cinder Terraces and Tideglass Lagoon
    // are saved as scenes; the other four maps stay preview bindings.
    public static class WorldLayouts
    {
        public const string HubSpawnId = "hub-spawn";
        public const string HubFireReturnId = "hub-fire-return";
        public const string HubWaterReturnId = "hub-water-return";
        public const string CinderEntryId = "cinder-terraces-entry";
        public const string TideglassEntryId = "tideglass-lagoon-entry";

        private static readonly WorldLayout HubLayout = BuildHub();
        private static readonly WorldLayout CinderLayout = BuildArena(WorldMapCatalog.CinderTerraces, false);
        private static readonly WorldLayout TideglassLayout = BuildArena(WorldMapCatalog.TideglassLagoon, false);
        private static readonly Dictionary<string, WorldLayout> Previews = new Dictionary<string, WorldLayout>(StringComparer.Ordinal);

        public static WorldLayout Hub => HubLayout;

        public static WorldLayout CinderTerraces => CinderLayout;

        public static WorldLayout TideglassLagoon => TideglassLayout;

        public static IReadOnlyList<WorldLayout> PlayableArenas { get; } =
            Array.AsReadOnly(new[] { CinderLayout, TideglassLayout });

        public static IReadOnlyList<WorldLayout> PlayableScenes { get; } =
            Array.AsReadOnly(new[] { HubLayout, CinderLayout, TideglassLayout });

        public static WorldLayout ForMap(string mapId)
        {
            if (string.Equals(mapId, WorldMapCatalog.CentralPlazaId, StringComparison.Ordinal)) return HubLayout;
            if (string.Equals(mapId, WorldMapCatalog.CinderTerracesId, StringComparison.Ordinal)) return CinderLayout;
            if (string.Equals(mapId, WorldMapCatalog.TideglassLagoonId, StringComparison.Ordinal)) return TideglassLayout;
            if (string.Equals(mapId, WorldMapCatalog.StormcoilFields.Id, StringComparison.Ordinal))
                return Preview(WorldMapCatalog.StormcoilFields);
            if (string.Equals(mapId, WorldMapCatalog.LanternNecropolis.Id, StringComparison.Ordinal))
                return Preview(WorldMapCatalog.LanternNecropolis);
            if (string.Equals(mapId, WorldMapCatalog.OchreLabyrinth.Id, StringComparison.Ordinal))
                return Preview(WorldMapCatalog.OchreLabyrinth);
            if (string.Equals(mapId, WorldMapCatalog.DawnPrismSanctum.Id, StringComparison.Ordinal))
                return Preview(WorldMapCatalog.DawnPrismSanctum);
            return null;
        }

        // Composes a themed arena from the same kit and board bindings without
        // creating a scene, adding a build entry or claiming the map finished.
        public static WorldLayout Preview(WorldMapDefinition map)
        {
            if (map == null) throw new ArgumentNullException(nameof(map));
            if (map.Status != WorldMapStatus.FoundationOnly)
                throw new InvalidOperationException("Only foundation maps are composed as previews: " + map.Id);
            if (!Previews.TryGetValue(map.Id, out var layout))
            {
                layout = BuildArena(map, true);
                Previews.Add(map.Id, layout);
            }
            return layout;
        }

        private static WorldLayout BuildHub()
        {
            var placements = new List<WorldPropPlacement>();
            Add(placements, "floor-slab", "environment", new WorldPoint(0f, -.2f, 0f));
            Add(placements, "plaza-disc", "environment", new WorldPoint(0f, .03f, 0f));
            Add(placements, "plaza-ring", "environment", new WorldPoint(0f, .07f, 0f));
            Add(placements, "plaza-medallion", "environment", new WorldPoint(0f, .1f, 0f));
            Add(placements, "path-slab", "environment", new WorldPoint(0f, .03f, 11.5f), 0f, 0f, 0f, 5f, .06f, 7f);
            Add(placements, "path-slab", "environment", new WorldPoint(0f, .03f, -11.5f), 0f, 0f, 0f, 5f, .06f, 7f);
            Add(placements, "path-slab", "environment", new WorldPoint(11.5f, .03f, 0f), 0f, 0f, 0f, 7f, .06f, 5f);
            Add(placements, "path-slab", "environment", new WorldPoint(-11.5f, .03f, 0f), 0f, 0f, 0f, 7f, .06f, 5f);

            Add(placements, "spawn-pad", "spawn", new WorldPoint(0f, .115f, -8.5f));
            Add(placements, "spawn-glyph", "spawn", new WorldPoint(0f, .13f, -8.5f));

            Add(placements, "post", "sigil", new WorldPoint(0f, 1.2f, 0f), 0f, 0f, 0f, .5f, 1.2f, .5f);
            Add(placements, "sigil-ring", "sigil", new WorldPoint(0f, 2.1f, 0f));
            Add(placements, "sigil-core", "sigil", new WorldPoint(0f, 2.9f, 0f));

            for (var index = 0; index < 8; index++)
            {
                var angle = index * 45f;
                var point = Polar(11f, angle);
                Add(placements, "lamp-base", "environment", new WorldPoint(point.X, .14f, point.Z));
                Add(placements, "post", "environment", new WorldPoint(point.X, 1.7f, point.Z));
                Add(placements, "lamp-globe", "environment", new WorldPoint(point.X, 3.6f, point.Z), 0f, 0f, 0f, 0f, 0f, 0f, null,
                    index * .7f);
            }

            for (var index = 0; index < 4; index++)
            {
                var angle = 45f + index * 90f;
                var point = Polar(12.3f, angle);
                Add(placements, "banner-pole", "environment", new WorldPoint(point.X, 2.4f, point.Z));
                Add(placements, "banner", "environment", new WorldPoint(point.X, 2.9f, point.Z), angle, 0f, 0f, 0f, 0f, 0f, null,
                    index * .4f);
            }

            for (var index = 0; index < 4; index++)
            {
                var angle = 45f + index * 90f;
                var point = Polar(8.8f, angle);
                var benchYaw = angle + 90f;
                Add(placements, "bench", "environment", new WorldPoint(point.X, .35f, point.Z), benchYaw);
                var back = Polar(8.8f - .42f, angle);
                Add(placements, "bench-back", "environment", new WorldPoint(back.X, .85f, back.Z), benchYaw);
            }

            for (var index = 0; index < 4; index++)
            {
                var angle = index * 90f;
                var point = Polar(6.4f, angle);
                Add(placements, "planter", "environment", new WorldPoint(point.X, .3f, point.Z), angle);
                Add(placements, "shrub", "environment", new WorldPoint(point.X, .95f, point.Z), angle, 0f, 0f, 0f, 0f, 0f, null,
                    index * .6f);
            }

            Add(placements, "crate", "environment", new WorldPoint(-5.2f, .45f, -6.4f), 24f);
            Add(placements, "crate", "environment", new WorldPoint(5.2f, .45f, -6.4f), -24f);

            var portals = new List<WorldPortalDefinition>
            {
                new WorldPortalDefinition("fire-portal", "Cinder Terraces / Fire Arena",
                    new WorldPoint(-8f, 0f, 7.4f), 0f, WorldMapElement.Fire, true,
                    WorldMapCatalog.CinderTerraces.SceneName, CinderEntryId,
                    "PLAYABLE ARENA", WorldElementPalette.SharedPortalKey(WorldMapElement.Fire)),
                new WorldPortalDefinition("water-portal", "Tideglass Lagoon / Water Arena",
                    new WorldPoint(8f, 0f, 7.4f), 0f, WorldMapElement.Water, true,
                    WorldMapCatalog.TideglassLagoon.SceneName, TideglassEntryId,
                    "PLAYABLE ARENA", WorldElementPalette.SharedPortalKey(WorldMapElement.Water)),
                FoundationMarker(WorldMapCatalog.StormcoilFields, new WorldPoint(-9.6f, 0f, 12.2f)),
                FoundationMarker(WorldMapCatalog.LanternNecropolis, new WorldPoint(-3.2f, 0f, 12.9f)),
                FoundationMarker(WorldMapCatalog.OchreLabyrinth, new WorldPoint(3.2f, 0f, 12.9f)),
                FoundationMarker(WorldMapCatalog.DawnPrismSanctum, new WorldPoint(9.6f, 0f, 12.2f))
            };
            foreach (var portal in portals)
            {
                if (portal.Interactable) AddPortalArch(placements, portal);
                else AddFoundationPlinth(placements, portal);
            }

            AddBoundary(placements, 13.9f);

            var layout = new WorldLayout(
                WorldMapCatalog.CentralPlazaId,
                WorldMapCatalog.Hub.DisplayName,
                WorldLayoutKind.Hub,
                WorldThemes.Hub,
                WorldMapElement.Light,
                WorldMapCatalog.CentralPlazaSceneName,
                new WorldPoint(-13.2f, 0f, -13.2f),
                new WorldPoint(13.2f, 6f, 13.2f),
                new[]
                {
                    new WorldSpawnAnchor(HubSpawnId, new WorldPoint(0f, .02f, -8.5f), 0f),
                    new WorldSpawnAnchor(HubFireReturnId, new WorldPoint(-8f, .02f, 4.2f), 0f),
                    new WorldSpawnAnchor(HubWaterReturnId, new WorldPoint(8f, .02f, 4.2f), 0f)
                },
                HubSpawnId,
                portals,
                null,
                Array.Empty<WorldActorDefinition>(),
                new WorldCameraFrame(new WorldPoint(0f, 15.5f, -22.5f), new WorldPoint(0f, 1.2f, 2f), 45f),
                placements,
                "PLAYABLE DEVELOPER HUB / INTERMEDIATE PRIMITIVE COMPOSITION",
                false);
            return layout;
        }

        private static WorldLayout BuildArena(WorldMapDefinition map, bool preview)
        {
            var placements = new List<WorldPropPlacement>();
            var board = new WorldBoardDefinition(
                map.Id + "-board",
                new WorldPoint(0f, .744f, 0f),
                WorldBoardDefinition.MvpColumns,
                WorldBoardDefinition.MvpRows,
                .96f,
                .04f,
                .744f,
                .14f);

            Add(placements, "floor-slab", "environment", new WorldPoint(0f, -.2f, 0f));
            AddBoard(placements, board);

            AddBoundary(placements, 13.9f);

            Add(placements, "spawn-pad", "spawn", new WorldPoint(0f, .115f, -8.5f));
            Add(placements, "spawn-glyph", "spawn", new WorldPoint(0f, .13f, -8.5f));

            var pet = new WorldActorDefinition("pet", "Icarus", new WorldPoint(-5.4f, 0f, .2f), 90f);
            var enemyLabel = map.Element == WorldMapElement.Water ? "Tide Warden" : "Cinder Guard";
            var enemy = new WorldActorDefinition("enemy", enemyLabel, new WorldPoint(5.4f, 0f, .2f), -90f);
            AddActor(placements, pet, "actor-pet");
            AddActor(placements, enemy, "actor-enemy");

            string portalMaterial = WorldElementPalette.SharedPortalKey(map.Element);
            var portals = new List<WorldPortalDefinition>();
            if (!preview)
            {
                var returnAnchor = map.Element == WorldMapElement.Water ? HubWaterReturnId : HubFireReturnId;
                portals.Add(new WorldPortalDefinition(
                    "return-gate",
                    "Return to Central Plaza",
                    new WorldPoint(0f, 0f, 11.4f),
                    0f,
                    map.Element,
                    true,
                    WorldMapCatalog.CentralPlazaSceneName,
                    returnAnchor,
                    "PLAYABLE HUB LINK",
                    portalMaterial));
                foreach (var portal in portals) AddPortalArch(placements, portal);
            }

            var spawnId = map.Element == WorldMapElement.Water ? TideglassEntryId : CinderEntryId;
            var spawns = new[]
            {
                new WorldSpawnAnchor(spawnId, new WorldPoint(0f, .02f, -8.5f), 0f)
            };

            switch (map.Element)
            {
                case WorldMapElement.Fire:
                    AddFireDressing(placements);
                    break;
                case WorldMapElement.Water:
                    AddWaterDressing(placements);
                    break;
                case WorldMapElement.Electric:
                    AddElectricDressing(placements);
                    break;
                case WorldMapElement.Ghost:
                    AddGhostDressing(placements);
                    break;
                case WorldMapElement.Ground:
                    AddGroundDressing(placements);
                    break;
                default:
                    AddLightDressing(placements);
                    break;
            }

            AddAmbientMotes(placements, map.Element);

            var layout = new WorldLayout(
                map.Id,
                map.DisplayName,
                WorldLayoutKind.Arena,
                map.Theme,
                map.Element,
                preview ? string.Empty : map.SceneName,
                new WorldPoint(-13.2f, 0f, -13.2f),
                new WorldPoint(13.2f, 8f, 13.2f),
                spawns,
                spawnId,
                portals,
                board,
                new[] { pet, enemy },
                new WorldCameraFrame(new WorldPoint(0f, 13f, -17.5f), new WorldPoint(0f, 1f, .5f), 48f),
                placements,
                preview
                    ? "FOUNDATION ONLY / PREVIEW COMPOSITION / NO SCENE"
                    : "PLAYABLE DEVELOPER ARENA / INTERMEDIATE PRIMITIVE COMPOSITION",
                preview);
            return layout;
        }

        private static void AddBoard(List<WorldPropPlacement> placements, WorldBoardDefinition board)
        {
            Add(placements, "board-base", "board", new WorldPoint(0f, .3f, 0f));
            for (var row = 0; row < board.Rows; row++)
            for (var column = 0; column < board.Columns; column++)
            {
                var key = (row + column) % 2 == 0 ? WorldMaterialKeys.BoardLight : WorldMaterialKeys.BoardDark;
                Add(placements, "board-tile", "board", board.CellCenter(column, row), 0f, 0f, 0f,
                    0f, 0f, 0f, key);
            }

            var half = board.Footprint * .5f;
            var gridY = board.SurfaceY + .004f;
            for (var index = 1; index < board.Columns; index++)
            {
                var offset = -half + index * board.Pitch - board.Gap * .5f;
                Add(placements, "board-grid", "board", new WorldPoint(offset, gridY, 0f), 0f, 0f, 0f,
                    .035f, .006f, board.Footprint);
            }
            for (var index = 1; index < board.Rows; index++)
            {
                var offset = -half + index * board.Pitch - board.Gap * .5f;
                Add(placements, "board-grid", "board", new WorldPoint(0f, gridY, offset), 0f, 0f, 0f,
                    board.Footprint, .006f, .035f);
            }

            var rimOffset = half + .16f;
            Add(placements, "board-rim", "board", new WorldPoint(0f, .7f, rimOffset), 0f, 0f, 0f, 9.1f, .24f, .3f);
            Add(placements, "board-rim", "board", new WorldPoint(0f, .7f, -rimOffset), 0f, 0f, 0f, 9.1f, .24f, .3f);
            Add(placements, "board-rim", "board", new WorldPoint(rimOffset, .7f, 0f), 90f, 0f, 0f, 9.1f, .24f, .3f);
            Add(placements, "board-rim", "board", new WorldPoint(-rimOffset, .7f, 0f), 90f, 0f, 0f, 9.1f, .24f, .3f);
            Add(placements, "board-emblem", "board", new WorldPoint(0f, .75f, 0f));
        }

        private static void AddActor(List<WorldPropPlacement> placements, WorldActorDefinition actor, string group)
        {
            Add(placements, "actor-pedestal", group, new WorldPoint(actor.Position.X, .06f, actor.Position.Z));
            if (string.Equals(actor.Role, "pet", StringComparison.Ordinal))
            {
                Add(placements, "pet-body", group, new WorldPoint(actor.Position.X, 1.1f, actor.Position.Z), actor.Yaw);
                Add(placements, "pet-head", group, new WorldPoint(actor.Position.X, 2.05f, actor.Position.Z), actor.Yaw);
                Add(placements, "pet-crest", group, new WorldPoint(actor.Position.X, 2.5f, actor.Position.Z), actor.Yaw);
            }
            else
            {
                Add(placements, "enemy-body", group, new WorldPoint(actor.Position.X, 1.15f, actor.Position.Z), actor.Yaw);
                Add(placements, "enemy-head", group, new WorldPoint(actor.Position.X, 2.2f, actor.Position.Z), actor.Yaw);
                Add(placements, "enemy-crest", group, new WorldPoint(actor.Position.X, 2.75f, actor.Position.Z), actor.Yaw);
            }
        }

        private static void AddFireDressing(List<WorldPropPlacement> placements)
        {
            Add(placements, "terrace-step", "environment", new WorldPoint(0f, .2f, 6.6f), 0f, 0f, 0f, 14f, .4f, 2.4f);
            Add(placements, "terrace-step", "environment", new WorldPoint(0f, .6f, 8.1f), 0f, 0f, 0f, 12f, .8f, 2f);
            Add(placements, "terrace-step", "environment", new WorldPoint(0f, 1f, 9.5f), 0f, 0f, 0f, 10f, 1.2f, 1.8f);
            for (var index = 0; index < 4; index++)
            {
                var x = index < 2 ? -4.4f : 4.4f;
                var z = index % 2 == 0 ? 8.1f : 9.5f;
                var y = index % 2 == 0 ? 1.1f : 1.7f;
                Add(placements, "brazier", "environment", new WorldPoint(x, y, z));
                Add(placements, "brazier-fire", "environment", new WorldPoint(x, y + .45f, z), 0f, 0f, 0f, 0f, 0f, 0f, null,
                    index * .5f);
            }

            Add(placements, "portal-surface", "environment", new WorldPoint(0f, .82f, 5.28f), 0f, 0f, 0f,
                .22f, .02f, 7.7f, WorldMaterialKeys.PortalFire);
            Add(placements, "portal-surface", "environment", new WorldPoint(0f, .82f, -5.28f), 0f, 0f, 0f,
                .22f, .02f, 7.7f, WorldMaterialKeys.PortalFire);

            for (var index = 0; index < 2; index++)
            {
                var side = index == 0 ? -1f : 1f;
                Add(placements, "pillar-base", "environment", new WorldPoint(side * 7.2f, .15f, -.6f));
                Add(placements, "pillar", "environment", new WorldPoint(side * 7.2f, 2.4f, -.6f));
                Add(placements, "banner-pole", "environment", new WorldPoint(side * 6.6f, 2.4f, 3.4f));
                Add(placements, "banner", "environment", new WorldPoint(side * 6.6f, 2.9f, 3.4f), -side * 90f, 0f, 0f,
                    0f, 0f, 0f, null, index * .8f);
            }
        }

        private static void AddWaterDressing(List<WorldPropPlacement> placements)
        {
            Add(placements, "water-plane", "environment", new WorldPoint(0f, .06f, 0f), 90f, 0f, 0f, 26f, 26f, 1f);
            Add(placements, "tide-ring", "environment", new WorldPoint(0f, .1f, 0f), 0f, 0f, 0f, 5.6f, .01f, 5.6f);
            Add(placements, "tide-ring", "environment", new WorldPoint(0f, .1f, 0f), 0f, 0f, 0f, 7.6f, .01f, 7.6f);
            Add(placements, "tide-ring", "environment", new WorldPoint(0f, .1f, 0f), 0f, 0f, 0f, 9.6f, .01f, 9.6f);

            for (var index = 0; index < 8; index++)
            {
                var side = index < 4 ? -1f : 1f;
                var z = -3.6f + (index % 4) * 2.2f;
                var x = side * (7.4f + (index % 2) * .8f);
                Add(placements, "coral-segment", "environment", new WorldPoint(x, .9f, z),
                    0f, 0f, side * (12f + index * 4f), .5f, 1.8f + (index % 3) * .5f, .4f);
            }
            for (var index = 0; index < 4; index++)
            {
                var angle = 45f + index * 90f;
                var point = Polar(10.6f, angle);
                Add(placements, "pillar-base", "environment", new WorldPoint(point.X, .15f, point.Z));
                Add(placements, "pillar", "environment", new WorldPoint(point.X, 2.6f, point.Z), 0f, 0f, 0f,
                    .55f, 2.6f, .55f);
            }
            for (var index = 0; index < 4; index++)
            {
                var angle = 20f + index * 90f;
                var point = Polar(5.2f, angle);
                Add(placements, "tide-ring", "environment", new WorldPoint(point.X, .12f, point.Z), 0f, 0f, 0f,
                    1.4f, .01f, 1.4f);
            }
        }

        private static void AddElectricDressing(List<WorldPropPlacement> placements)
        {
            for (var index = 0; index < 6; index++)
            {
                var point = Polar(8.4f, index * 60f);
                Add(placements, "pillar-base", "environment", new WorldPoint(point.X, .15f, point.Z));
                Add(placements, "pillar", "environment", new WorldPoint(point.X, 2.8f, point.Z), 0f, 0f, 0f,
                    .45f, 2.8f, .45f);
                Add(placements, "sigil-core", "environment", new WorldPoint(point.X, 3.4f, point.Z), 0f, 0f, 0f,
                    .55f, .55f, .55f, WorldMaterialKeys.PortalElectric, index * .3f);
            }
            Add(placements, "portal-surface", "environment", new WorldPoint(0f, .82f, 5.28f), 0f, 0f, 0f,
                .18f, .02f, 7.7f, WorldMaterialKeys.PortalElectric);
        }

        private static void AddGhostDressing(List<WorldPropPlacement> placements)
        {
            for (var index = 0; index < 6; index++)
            {
                var point = Polar(9.2f, 30f + index * 60f);
                Add(placements, "post", "environment", new WorldPoint(point.X, 1.7f, point.Z));
                Add(placements, "lamp-globe", "environment", new WorldPoint(point.X, 3.6f, point.Z), 0f, 0f, 0f,
                    .5f, .5f, .5f, WorldMaterialKeys.PortalGhost, index * .5f);
            }
            for (var index = 0; index < 4; index++)
            {
                var point = Polar(6.8f, 60f + index * 90f);
                Add(placements, "dormant-glyph", "environment", new WorldPoint(point.X, 1.1f, point.Z), 0f, 0f, 0f,
                    .3f, 2.2f, .3f, WorldMaterialKeys.PortalGhost, index * .4f);
            }
        }

        private static void AddGroundDressing(List<WorldPropPlacement> placements)
        {
            Add(placements, "terrace-step", "environment", new WorldPoint(0f, .2f, 6.6f), 0f, 0f, 0f, 14f, .4f, 2.4f);
            Add(placements, "terrace-step", "environment", new WorldPoint(0f, .6f, 8.1f), 0f, 0f, 0f, 12f, .8f, 2f);
            Add(placements, "terrace-step", "environment", new WorldPoint(-9.6f, .2f, 0f), 90f, 0f, 0f, 10f, .4f, 2.4f);
            Add(placements, "terrace-step", "environment", new WorldPoint(9.6f, .2f, 0f), 90f, 0f, 0f, 10f, .4f, 2.4f);
            for (var index = 0; index < 4; index++)
            {
                var point = Polar(7.4f, 45f + index * 90f);
                Add(placements, "planter", "environment", new WorldPoint(point.X, .3f, point.Z));
                Add(placements, "shrub", "environment", new WorldPoint(point.X, .95f, point.Z), 0f, 0f, 0f,
                    1.3f, 1.1f, 1.3f, WorldMaterialKeys.PortalGround, index * .5f);
            }
        }

        private static void AddLightDressing(List<WorldPropPlacement> placements)
        {
            for (var index = 0; index < 4; index++)
            {
                var point = Polar(9.6f, 45f + index * 90f);
                Add(placements, "pillar-base", "environment", new WorldPoint(point.X, .15f, point.Z));
                Add(placements, "pillar", "environment", new WorldPoint(point.X, 2.2f, point.Z), 0f, 0f, 0f,
                    .6f, 2.2f, .6f);
                Add(placements, "sigil-ring", "environment", new WorldPoint(point.X, 4.6f, point.Z), 0f, 0f, 0f,
                    2.2f, .02f, 2.2f, WorldMaterialKeys.PortalLight, index * .8f);
            }
            Add(placements, "sigil-ring", "environment", new WorldPoint(0f, 5.4f, 0f), 0f, 0f, 0f,
                6.2f, .02f, 6.2f, WorldMaterialKeys.PortalLight);
        }

        private static void AddAmbientMotes(List<WorldPropPlacement> placements, WorldMapElement element)
        {
            var partId = element == WorldMapElement.Fire ? "ember"
                : element == WorldMapElement.Water ? "bubble"
                : "mote";
            var count = element == WorldMapElement.Water ? 14 : 12;
            for (var index = 0; index < count; index++)
            {
                var angle = index * (360f / count) + 12f;
                var radius = 4.6f + (index % 4) * 1.6f;
                var point = Polar(radius, angle);
                var height = 1.4f + (index % 5) * .7f;
                Add(placements, partId, "ambient", new WorldPoint(point.X, height, point.Z), 0f, 0f, 0f,
                    0f, 0f, 0f, null, index * .45f);
            }
        }

        private static void AddBoundary(List<WorldPropPlacement> placements, float half)
        {
            for (var index = -1; index <= 1; index++)
            {
                var offset = index * 8f;
                Add(placements, "rail", "boundary", new WorldPoint(offset, .6f, half), 0f, 0f, 0f, 8f, 1.2f, .4f);
                Add(placements, "rail", "boundary", new WorldPoint(offset, .6f, -half), 0f, 0f, 0f, 8f, 1.2f, .4f);
                Add(placements, "rail", "boundary", new WorldPoint(half, .6f, offset), 90f, 0f, 0f, 8f, 1.2f, .4f);
                Add(placements, "rail", "boundary", new WorldPoint(-half, .6f, offset), 90f, 0f, 0f, 8f, 1.2f, .4f);
            }
            for (var index = 0; index < 4; index++)
            {
                var x = (index % 2 == 0 ? -1f : 1f) * (half - .5f);
                var z = (index < 2 ? -1f : 1f) * (half - .5f);
                Add(placements, "pillar-base", "boundary", new WorldPoint(x, .15f, z));
                Add(placements, "pillar", "boundary", new WorldPoint(x, 2.4f, z), 0f, 0f, 0f, .7f, 2.4f, .7f);
            }
        }

        private static void AddPortalArch(List<WorldPropPlacement> placements, WorldPortalDefinition portal)
        {
            var group = "portal:" + portal.Id;
            var material = string.IsNullOrEmpty(portal.PortalMaterialKey)
                ? WorldMaterialKeys.Accent
                : portal.PortalMaterialKey;
            Add(placements, "plinth", group, new WorldPoint(portal.Position.X, .15f, portal.Position.Z), portal.Yaw, 0f, 0f,
                5.4f, .3f, 1.2f);
            var legLeft = Offset(portal.Position, portal.Yaw, -2f, 0f, 0f);
            var legRight = Offset(portal.Position, portal.Yaw, 2f, 0f, 0f);
            Add(placements, "gate-leg", group, new WorldPoint(legLeft.X, 1.1f, legLeft.Z), portal.Yaw);
            Add(placements, "gate-leg", group, new WorldPoint(legRight.X, 1.1f, legRight.Z), portal.Yaw);
            for (var index = 0; index <= 6; index++)
            {
                var angle = Math.PI * index / 6.0;
                var local = new WorldPoint(2f * (float)Math.Cos(angle), 2.2f + 2f * (float)Math.Sin(angle), 0f);
                var point = Offset(portal.Position, portal.Yaw, local.X, local.Y, local.Z);
                Add(placements, "arch-segment", group, point, portal.Yaw, 0f, (float)(angle * 180.0 / Math.PI));
            }
            var surface = Offset(portal.Position, portal.Yaw, 0f, 1.4f, .02f);
            Add(placements, "portal-surface", group, surface, portal.Yaw, 0f, 0f, 0f, 0f, 0f, material);
            var glyph = Offset(portal.Position, portal.Yaw, 0f, 4.5f, 0f);
            Add(placements, "portal-glyph", group, glyph, portal.Yaw, 0f, 0f, 0f, 0f, 0f, material);
        }

        private static void AddFoundationPlinth(List<WorldPropPlacement> placements, WorldPortalDefinition portal)
        {
            var group = "portal:" + portal.Id;
            Add(placements, "foundation-plinth", group, new WorldPoint(portal.Position.X, .2f, portal.Position.Z),
                portal.Yaw, 0f, 0f, 3.6f, .4f, 1.2f);
            var glyph = Offset(portal.Position, portal.Yaw, 0f, 1.3f, 0f);
            Add(placements, "dormant-glyph", group, glyph, portal.Yaw);
            var left = Offset(portal.Position, portal.Yaw, -.8f, .9f, 0f);
            var right = Offset(portal.Position, portal.Yaw, .8f, .9f, 0f);
            Add(placements, "arch-segment", group, left, portal.Yaw, 0f, 0f, .18f, 1.4f, .18f);
            Add(placements, "arch-segment", group, right, portal.Yaw, 0f, 0f, .18f, 1.4f, .18f);
        }

        private static WorldPortalDefinition FoundationMarker(WorldMapDefinition map, WorldPoint position) =>
            new WorldPortalDefinition(
                "foundation-" + map.Id,
                map.DisplayName + " / foundation only",
                position,
                0f,
                map.Element,
                false,
                string.Empty,
                string.Empty,
                "FOUNDATION ONLY",
                string.Empty);

        private static void Add(
            List<WorldPropPlacement> placements,
            string partId,
            string group,
            WorldPoint position,
            float yaw = 0f,
            float pitch = 0f,
            float roll = 0f,
            float scaleX = 0f,
            float scaleY = 0f,
            float scaleZ = 0f,
            string materialKey = null,
            float motionPhase = 0f)
        {
            var part = EnvironmentKit.Get(partId);
            var name = part.DisplayName + " " + (placements.Count + 1);
            var scale = scaleX > 0f || scaleY > 0f || scaleZ > 0f
                ? new WorldPoint(scaleX, scaleY, scaleZ)
                : WorldPoint.Zero;
            placements.Add(new WorldPropPlacement(
                partId,
                name,
                group,
                position,
                new WorldEuler(pitch, yaw, roll),
                scale,
                materialKey ?? string.Empty,
                motionPhase));
        }

        private static WorldPoint Offset(WorldPoint origin, float yaw, float localX, float localY, float localZ)
        {
            var radians = yaw * Math.PI / 180.0;
            var cos = (float)Math.Cos(radians);
            var sin = (float)Math.Sin(radians);
            return new WorldPoint(
                origin.X + localX * cos + localZ * sin,
                origin.Y + localY,
                origin.Z - localX * sin + localZ * cos);
        }

        private static WorldPoint Polar(float radius, float degrees)
        {
            var radians = degrees * Math.PI / 180.0;
            return new WorldPoint(radius * (float)Math.Cos(radians), 0f, radius * (float)Math.Sin(radians));
        }
    }
}
