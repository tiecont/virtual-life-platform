using System;

namespace VirtualLife.Blockout
{
    public static class District
    {
        public const float HalfExtent = 16f;
        public const float WalkSpeed = 4f;
        public const float InteractionRadius = 2.5f;

        public static float Clamp(float coordinate)
        {
            return Math.Max(-HalfExtent + 0.5f, Math.Min(HalfExtent - 0.5f, coordinate));
        }

        public static bool CanInteract(float playerX, float playerZ, float targetX, float targetZ)
        {
            var dx = playerX - targetX;
            var dz = playerZ - targetZ;
            return dx * dx + dz * dz <= InteractionRadius * InteractionRadius;
        }
    }
}
