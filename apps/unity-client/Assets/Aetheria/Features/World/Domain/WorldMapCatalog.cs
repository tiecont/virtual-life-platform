using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    public enum WorldMapElement
    {
        Fire = 0,
        Water = 1,
        Electric = 2,
        Ghost = 3,
        Ground = 4,
        Light = 5
    }

    public enum WorldMapStatus
    {
        // A playable developer composition exists in build settings.
        Playable = 0,
        // The reusable kit can compose the map later; no scene or claim exists.
        FoundationOnly = 1
    }

    public enum WorldLayoutKind
    {
        Hub = 0,
        Arena = 1
    }

    public sealed class WorldMapDefinition
    {
        public WorldMapDefinition(
            string id,
            string displayName,
            WorldMapElement element,
            WorldMapStatus status,
            string sceneName,
            WorldTheme theme,
            string contentStage)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Map id is required.", nameof(id));
            if (string.IsNullOrEmpty(displayName)) throw new ArgumentException("Map display name is required.", nameof(displayName));
            Id = id;
            DisplayName = displayName;
            Element = element;
            Status = status;
            SceneName = sceneName;
            Theme = theme;
            ContentStage = contentStage;
        }

        public string Id { get; }
        public string DisplayName { get; }
        public WorldMapElement Element { get; }
        public WorldMapStatus Status { get; }
        public string SceneName { get; }
        public WorldTheme Theme { get; }
        public string ContentStage { get; }
        public bool IsPlayable => Status == WorldMapStatus.Playable;
    }

    // One source of truth for map identity, element, palette and content stage.
    // Only Cinder Terraces and Tideglass Lagoon have scene compositions; the
    // remaining four maps stay explicit foundation bindings.
    public static class WorldMapCatalog
    {
        public const string CentralPlazaId = "central-plaza";
        public const string CentralPlazaSceneName = "CentralPlaza";
        public const string CinderTerracesId = "cinder-terraces";
        public const string TideglassLagoonId = "tideglass-lagoon";

        public static readonly WorldMapDefinition Hub = new WorldMapDefinition(
            CentralPlazaId,
            "Central Plaza",
            WorldMapElement.Light,
            WorldMapStatus.Playable,
            CentralPlazaSceneName,
            WorldThemes.Hub,
            "PLAYABLE DEVELOPER HUB");

        public static readonly WorldMapDefinition CinderTerraces = new WorldMapDefinition(
            CinderTerracesId,
            "Cinder Terraces",
            WorldMapElement.Fire,
            WorldMapStatus.Playable,
            "CinderTerraces",
            WorldThemes.Fire,
            "PLAYABLE FIRE ARENA / DEVELOPER COMPOSITION");

        public static readonly WorldMapDefinition TideglassLagoon = new WorldMapDefinition(
            TideglassLagoonId,
            "Tideglass Lagoon",
            WorldMapElement.Water,
            WorldMapStatus.Playable,
            "TideglassLagoon",
            WorldThemes.Water,
            "PLAYABLE WATER ARENA / DEVELOPER COMPOSITION");

        public static readonly WorldMapDefinition StormcoilFields = new WorldMapDefinition(
            "stormcoil-fields",
            "Stormcoil Fields",
            WorldMapElement.Electric,
            WorldMapStatus.FoundationOnly,
            string.Empty,
            WorldThemes.Stormcoil,
            "FOUNDATION ONLY / NO SCENE");

        public static readonly WorldMapDefinition LanternNecropolis = new WorldMapDefinition(
            "lantern-necropolis",
            "Lantern Necropolis",
            WorldMapElement.Ghost,
            WorldMapStatus.FoundationOnly,
            string.Empty,
            WorldThemes.Lantern,
            "FOUNDATION ONLY / NO SCENE");

        public static readonly WorldMapDefinition OchreLabyrinth = new WorldMapDefinition(
            "ochre-labyrinth",
            "Ochre Labyrinth",
            WorldMapElement.Ground,
            WorldMapStatus.FoundationOnly,
            string.Empty,
            WorldThemes.Ochre,
            "FOUNDATION ONLY / NO SCENE");

        public static readonly WorldMapDefinition DawnPrismSanctum = new WorldMapDefinition(
            "dawn-prism-sanctum",
            "Dawn Prism Sanctum",
            WorldMapElement.Light,
            WorldMapStatus.FoundationOnly,
            string.Empty,
            WorldThemes.DawnPrism,
            "FOUNDATION ONLY / NO SCENE");

        public static IReadOnlyList<WorldMapDefinition> Maps { get; } = Array.AsReadOnly(new[]
        {
            CinderTerraces,
            TideglassLagoon,
            StormcoilFields,
            LanternNecropolis,
            OchreLabyrinth,
            DawnPrismSanctum
        });

        public static IReadOnlyList<WorldMapDefinition> PlayableArenas { get; } = Array.AsReadOnly(new[]
        {
            CinderTerraces,
            TideglassLagoon
        });

        public static IReadOnlyList<WorldMapDefinition> FoundationMaps { get; } = Array.AsReadOnly(new[]
        {
            StormcoilFields,
            LanternNecropolis,
            OchreLabyrinth,
            DawnPrismSanctum
        });

        public static IReadOnlyList<string> WorldSceneNames { get; } = Array.AsReadOnly(new[]
        {
            CentralPlazaSceneName,
            CinderTerraces.SceneName,
            TideglassLagoon.SceneName
        });

        public static IReadOnlyList<WorldMapDefinition> AllWithHub { get; } = Array.AsReadOnly(new[]
        {
            Hub,
            CinderTerraces,
            TideglassLagoon,
            StormcoilFields,
            LanternNecropolis,
            OchreLabyrinth,
            DawnPrismSanctum
        });

        public static bool TryGet(string id, out WorldMapDefinition definition)
        {
            for (var index = 0; index < AllWithHub.Count; index++)
            {
                if (!string.Equals(AllWithHub[index].Id, id, StringComparison.Ordinal)) continue;
                definition = AllWithHub[index];
                return true;
            }
            definition = null;
            return false;
        }

        public static bool TryGetByScene(string sceneName, out WorldMapDefinition definition)
        {
            for (var index = 0; index < AllWithHub.Count; index++)
            {
                var candidate = AllWithHub[index];
                if (string.IsNullOrEmpty(candidate.SceneName) ||
                    !string.Equals(candidate.SceneName, sceneName, StringComparison.Ordinal)) continue;
                definition = candidate;
                return true;
            }
            definition = null;
            return false;
        }
    }

    public static class WorldThemes
    {
        public static readonly WorldTheme Hub = new WorldTheme(
            "hub",
            new WorldPalette(WorldColor.FromHex("#3A3A3F"), WorldColor.FromHex("#C3B49B"),
                WorldColor.FromHex("#EDE3D2"), WorldColor.FromHex("#E9C46A")),
            WorldColor.FromHex("#A9BED0"),
            false,
            WorldColor.FromHex("#A9BED0"), 30f, 90f,
            WorldColor.FromHex("#FFE8C4"), 1.25f, new WorldEuler(52f, -34f, 0f),
            WorldColor.FromHex("#A9BED0"), WorldColor.FromHex("#8C8272"),
            WorldColor.FromHex("#3A352E"), 1f);

        public static readonly WorldTheme Fire = new WorldTheme(
            "fire",
            WorldElementPalette.For(WorldMapElement.Fire),
            WorldColor.FromHex("#23100C"),
            true,
            WorldColor.FromHex("#2B110D"), 16f, 55f,
            WorldColor.FromHex("#FFB27A"), 1.15f, new WorldEuler(46f, -28f, 0f),
            WorldColor.FromHex("#5A2A20"), WorldColor.FromHex("#3A1A14"),
            WorldColor.FromHex("#1A0B09"), .85f);

        public static readonly WorldTheme Water = new WorldTheme(
            "water",
            WorldElementPalette.For(WorldMapElement.Water),
            WorldColor.FromHex("#06202E"),
            true,
            WorldColor.FromHex("#082432"), 18f, 58f,
            WorldColor.FromHex("#9FE6FF"), 1f, new WorldEuler(58f, 148f, 0f),
            WorldColor.FromHex("#1B4A62"), WorldColor.FromHex("#10303F"),
            WorldColor.FromHex("#071820"), .9f);

        public static readonly WorldTheme Stormcoil = new WorldTheme(
            "stormcoil",
            WorldElementPalette.For(WorldMapElement.Electric),
            WorldColor.FromHex("#20172B"),
            true,
            WorldColor.FromHex("#2A2036"), 18f, 60f,
            WorldColor.FromHex("#FFE066"), 1f, new WorldEuler(50f, 34f, 0f),
            WorldColor.FromHex("#3A3048"), WorldColor.FromHex("#241E30"),
            WorldColor.FromHex("#120F1A"), .9f);

        public static readonly WorldTheme Lantern = new WorldTheme(
            "lantern",
            WorldElementPalette.For(WorldMapElement.Ghost),
            WorldColor.FromHex("#140F20"),
            true,
            WorldColor.FromHex("#1C1530"), 14f, 48f,
            WorldColor.FromHex("#B9A6F2"), .9f, new WorldEuler(58f, -62f, 0f),
            WorldColor.FromHex("#2B2340"), WorldColor.FromHex("#191426"),
            WorldColor.FromHex("#0B0812"), .8f);

        public static readonly WorldTheme Ochre = new WorldTheme(
            "ochre",
            WorldElementPalette.For(WorldMapElement.Ground),
            WorldColor.FromHex("#6E5636"),
            true,
            WorldColor.FromHex("#7A5D3A"), 22f, 70f,
            WorldColor.FromHex("#FFE2B0"), 1.15f, new WorldEuler(44f, 18f, 0f),
            WorldColor.FromHex("#8C7248"), WorldColor.FromHex("#5E4A2E"),
            WorldColor.FromHex("#2A1E10"), 1f);

        public static readonly WorldTheme DawnPrism = new WorldTheme(
            "dawn-prism",
            WorldElementPalette.For(WorldMapElement.Light),
            WorldColor.FromHex("#E7DCC4"),
            true,
            WorldColor.FromHex("#D8C9AA"), 26f, 80f,
            WorldColor.FromHex("#FFF0BE"), 1.3f, new WorldEuler(40f, -18f, 0f),
            WorldColor.FromHex("#E7DCC4"), WorldColor.FromHex("#B9A98C"),
            WorldColor.FromHex("#6A5B44"), 1.05f);
    }
}
