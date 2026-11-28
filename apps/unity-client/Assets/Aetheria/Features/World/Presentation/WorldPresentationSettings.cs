namespace Aetheria.World.Presentation
{
    // Presentation-only accessibility switch. It never changes authoritative
    // state, board legality, rewards or command deadlines.
    public static class WorldPresentationSettings
    {
        public static bool ReducedMotion { get; set; }

        public static float MotionScale => ReducedMotion ? 0f : 1f;
    }
}
