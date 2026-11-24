using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    public static class WorldMaterialKeys
    {
        public const string Stone = "stone";
        public const string StoneDeep = "stone-deep";
        public const string Trim = "trim";
        public const string Accent = "accent";
        public const string Emissive = "emissive";
        public const string Cloth = "cloth";
        public const string Flora = "flora";
        public const string Wood = "wood";
        public const string Metal = "metal";
        public const string Water = "water";
        public const string Grid = "grid";
        public const string BoardLight = "board-light";
        public const string BoardDark = "board-dark";
        public const string PetPrimary = "pet-primary";
        public const string PetSecondary = "pet-secondary";
        public const string EnemyPrimary = "enemy-primary";
        public const string EnemySecondary = "enemy-secondary";

        // Shared element portal materials are not derived from a scene theme so
        // the hub can show each destination's canonical element colour.
        public const string PortalFire = "portal-fire";
        public const string PortalWater = "portal-water";
        public const string PortalElectric = "portal-electric";
        public const string PortalGhost = "portal-ghost";
        public const string PortalGround = "portal-ground";
        public const string PortalLight = "portal-light";

        public static IReadOnlyList<string> ThemeKeys { get; } = Array.AsReadOnly(new[]
        {
            Stone, StoneDeep, Trim, Accent, Emissive, Cloth, Flora, Wood, Metal, Water,
            Grid, BoardLight, BoardDark, PetPrimary, PetSecondary, EnemyPrimary, EnemySecondary
        });

        public static IReadOnlyList<string> SharedKeys { get; } = Array.AsReadOnly(new[]
        {
            PortalFire, PortalWater, PortalElectric, PortalGhost, PortalGround, PortalLight
        });

        public static bool IsThemeKey(string key) => IndexOf(ThemeKeys, key) >= 0;

        public static bool IsSharedKey(string key) => IndexOf(SharedKeys, key) >= 0;

        private static int IndexOf(IReadOnlyList<string> values, string key)
        {
            for (var index = 0; index < values.Count; index++)
                if (string.Equals(values[index], key, StringComparison.Ordinal)) return index;
            return -1;
        }
    }

    public readonly struct WorldPalette
    {
        public readonly WorldColor Ink;
        public readonly WorldColor Body;
        public readonly WorldColor Surface;
        public readonly WorldColor Accent;

        public WorldPalette(WorldColor ink, WorldColor body, WorldColor surface, WorldColor accent)
        {
            Ink = ink;
            Body = body;
            Surface = surface;
            Accent = accent;
        }
    }

    // Element palettes are taken from specs/pet-arena/art-bible-mvp-wave1.md.
    // They are presentation data only and change no gameplay value.
    public static class WorldElementPalette
    {
        public static WorldPalette For(WorldMapElement element)
        {
            switch (element)
            {
                case WorldMapElement.Fire:
                    return new WorldPalette(WorldColor.FromHex("#4A1410"), WorldColor.FromHex("#D8332A"),
                        WorldColor.FromHex("#FF7A3D"), WorldColor.FromHex("#FFD25E"));
                case WorldMapElement.Water:
                    return new WorldPalette(WorldColor.FromHex("#0C2C4A"), WorldColor.FromHex("#1B72C9"),
                        WorldColor.FromHex("#40C9E8"), WorldColor.FromHex("#A8F2DE"));
                case WorldMapElement.Electric:
                    return new WorldPalette(WorldColor.FromHex("#2B1B33"), WorldColor.FromHex("#F2A93B"),
                        WorldColor.FromHex("#FFE066"), WorldColor.FromHex("#7A5CFF"));
                case WorldMapElement.Ghost:
                    return new WorldPalette(WorldColor.FromHex("#241A3B"), WorldColor.FromHex("#6C4BD6"),
                        WorldColor.FromHex("#B9A6F2"), WorldColor.FromHex("#7FEBD3"));
                case WorldMapElement.Ground:
                    return new WorldPalette(WorldColor.FromHex("#3E2A18"), WorldColor.FromHex("#C97A3C"),
                        WorldColor.FromHex("#EBC48A"), WorldColor.FromHex("#4FC79A"));
                case WorldMapElement.Light:
                    return new WorldPalette(WorldColor.FromHex("#5A4726"), WorldColor.FromHex("#E9CFA0"),
                        WorldColor.FromHex("#FFF0BE"), WorldColor.FromHex("#6FD3FF"));
                default:
                    throw new ArgumentOutOfRangeException(nameof(element), element, "Unknown element palette.");
            }
        }

        public static string SharedPortalKey(WorldMapElement element)
        {
            switch (element)
            {
                case WorldMapElement.Fire: return WorldMaterialKeys.PortalFire;
                case WorldMapElement.Water: return WorldMaterialKeys.PortalWater;
                case WorldMapElement.Electric: return WorldMaterialKeys.PortalElectric;
                case WorldMapElement.Ghost: return WorldMaterialKeys.PortalGhost;
                case WorldMapElement.Ground: return WorldMaterialKeys.PortalGround;
                case WorldMapElement.Light: return WorldMaterialKeys.PortalLight;
                default: throw new ArgumentOutOfRangeException(nameof(element), element, "Unknown element portal.");
            }
        }
    }

    public sealed class WorldTheme
    {
        public WorldTheme(
            string id,
            WorldPalette palette,
            WorldColor background,
            bool fogEnabled,
            WorldColor fog,
            float fogStart,
            float fogEnd,
            WorldColor sunColor,
            float sunIntensity,
            WorldEuler sunRotation,
            WorldColor ambientSky,
            WorldColor ambientEquator,
            WorldColor ambientGround,
            float ambientIntensity)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Theme id is required.", nameof(id));
            Id = id;
            Palette = palette;
            Background = background;
            FogEnabled = fogEnabled;
            Fog = fog;
            FogStart = fogStart;
            FogEnd = fogEnd;
            SunColor = sunColor;
            SunIntensity = sunIntensity;
            SunRotation = sunRotation;
            AmbientSky = ambientSky;
            AmbientEquator = ambientEquator;
            AmbientGround = ambientGround;
            AmbientIntensity = ambientIntensity;
        }

        public string Id { get; }
        public WorldPalette Palette { get; }
        public WorldColor Background { get; }
        public bool FogEnabled { get; }
        public WorldColor Fog { get; }
        public float FogStart { get; }
        public float FogEnd { get; }
        public WorldColor SunColor { get; }
        public float SunIntensity { get; }
        public WorldEuler SunRotation { get; }
        public WorldColor AmbientSky { get; }
        public WorldColor AmbientEquator { get; }
        public WorldColor AmbientGround { get; }
        public float AmbientIntensity { get; }

        public WorldColor Body => Palette.Body;
        public WorldColor Surface => Palette.Surface;
        public WorldColor Accent => Palette.Accent;
        public WorldColor Ink => Palette.Ink;

        public WorldColor MaterialColor(string key)
        {
            switch (key)
            {
                case WorldMaterialKeys.Stone: return WorldColor.Mix(Body, Ink, .25f);
                case WorldMaterialKeys.StoneDeep: return Ink;
                case WorldMaterialKeys.Trim: return Surface;
                case WorldMaterialKeys.Accent: return Accent;
                case WorldMaterialKeys.Emissive:
                    return WorldColor.Mix(Accent, WorldColor.White, .3f);
                case WorldMaterialKeys.Cloth: return Body;
                case WorldMaterialKeys.Flora: return WorldColor.Mix(Accent, Body, .45f);
                case WorldMaterialKeys.Wood: return WorldColor.Mix(Ink, Body, .35f);
                case WorldMaterialKeys.Metal: return WorldColor.Mix(Ink, Surface, .22f);
                case WorldMaterialKeys.Water:
                    return WorldColor.Mix(Surface, Body, .35f).WithAlpha(.55f);
                case WorldMaterialKeys.Grid: return WorldColor.Mix(Surface, Ink, .55f);
                case WorldMaterialKeys.BoardLight: return WorldColor.Mix(Surface, Accent, .18f);
                case WorldMaterialKeys.BoardDark: return WorldColor.Mix(Ink, Body, .3f);
                // Icarus keeps the same fire presentation on both maps.
                case WorldMaterialKeys.PetPrimary: return new WorldColor(1f, .52f, .06f);
                case WorldMaterialKeys.PetSecondary: return new WorldColor(1f, .86f, .45f);
                case WorldMaterialKeys.EnemyPrimary: return Body;
                case WorldMaterialKeys.EnemySecondary: return Accent;
                default:
                    throw new ArgumentException("Unknown theme material key: " + key, nameof(key));
            }
        }
    }
}
