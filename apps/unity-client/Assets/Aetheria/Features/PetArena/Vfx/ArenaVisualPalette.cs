using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    internal static class ArenaVisualPalette
    {
        public const int ElementCount = 6;

        private static readonly Color[] DecalColors = {
            new Color(1f, .42f, .08f, .9f),
            new Color(.2f, .78f, 1f, .9f),
            new Color(1f, .9f, .18f, .9f),
            new Color(.62f, .36f, 1f, .9f),
            new Color(.47f, .83f, .32f, .9f),
            new Color(.66f, .93f, 1f, .9f),
        };

        private static readonly Color[] ParticleColors = {
            new Color(1f, .42f, .08f, 1f),
            new Color(.2f, .78f, 1f, 1f),
            new Color(1f, .9f, .18f, 1f),
            new Color(.62f, .36f, 1f, 1f),
            new Color(.47f, .83f, .32f, 1f),
            new Color(.66f, .93f, 1f, 1f),
        };

        private static readonly float[] DecalSizes = {2f, 1.8f, 1.6f, 1.9f, 1.9f, 1.7f};
        private static readonly int[] BurstCounts = {26, 24, 30, 18, 22, 28};

        public static Color DecalColor(ArenaElement element) => DecalColors[Index(element)];

        public static Color ParticleColor(ArenaElement element) => ParticleColors[Index(element)];

        public static float DecalSize(ArenaElement element) => DecalSizes[Index(element)];

        public static int BurstCount(ArenaElement element) => BurstCounts[Index(element)];

        public static int ReducedBurstCount(ArenaElement element) =>
            Mathf.Max(4, BurstCounts[Index(element)] / 3);

        private static int Index(ArenaElement element)
        {
            var index = (int)element;
            return index < 0 || index >= ElementCount ? 0 : index;
        }
    }
}
