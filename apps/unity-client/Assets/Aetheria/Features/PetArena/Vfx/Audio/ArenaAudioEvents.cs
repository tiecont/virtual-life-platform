using System;

namespace Aetheria.PetArena.Vfx
{
    // Ambient loops belong to the Ambient bus; combat score belongs to Music.
    public enum ArenaAmbience
    {
        None = 0,
        Plaza = 1,
        Fire = 2,
        Water = 3
    }

    public enum ArenaCombatScore
    {
        None = 0,
        Regular = 1,
        Boss = 2
    }

    public enum ArenaHub
    {
        Plaza = 0,
        CinderTerraces = 1,
        TideglassLagoon = 2
    }

    public enum ArenaImpactStrength
    {
        Weak = 0,
        Neutral = 1,
        Strong = 2
    }

    // One entry per presentation event. No cue carries gameplay authority: the
    // bridge can request a cue and nothing else.
    public enum ArenaAudioCue
    {
        None = 0,
        UiClick = 1,
        UiBack = 2,
        UiConfirm = 3,
        TileSelect = 4,
        TileMatch = 5,
        TileInvalid = 6,
        Cascade = 7,
        Attack = 8,
        Impact = 9,
        Guard = 10,
        ShieldBreak = 11,
        FireZone = 12,
        BossWarning = 13,
        ElementFire = 14,
        ElementWater = 15,
        ElementElectric = 16,
        ElementGhost = 17,
        ElementGround = 18,
        ElementLight = 19,
        ArtifactEquip = 20,
        ArtifactUpgrade = 21,
        Victory = 22,
        Defeat = 23,
        Recruitment = 24,
        Reward = 25,
        AnnouncerPrompt = 26
    }

    public static class ArenaAudioCues
    {
        public const int Count = (int)ArenaAudioCue.AnnouncerPrompt + 1;
        public const int FirstElementCue = (int)ArenaAudioCue.ElementFire;
        public const int LastElementCue = (int)ArenaAudioCue.ElementLight;

        public static bool IsDefined(ArenaAudioCue cue) => (int)cue > 0 && (int)cue < Count;

        public static ArenaAudioChannel ChannelFor(ArenaAudioCue cue)
        {
            switch (cue)
            {
                case ArenaAudioCue.UiClick:
                case ArenaAudioCue.UiBack:
                case ArenaAudioCue.UiConfirm:
                    return ArenaAudioChannel.Ui;
                case ArenaAudioCue.AnnouncerPrompt:
                    return ArenaAudioChannel.Voice;
                case ArenaAudioCue.Victory:
                case ArenaAudioCue.Defeat:
                case ArenaAudioCue.Recruitment:
                case ArenaAudioCue.Reward:
                    return ArenaAudioChannel.Ui;
                default:
                    return ArenaAudioChannel.Sfx;
            }
        }

        public static float CooldownSeconds(ArenaAudioCue cue)
        {
            switch (cue)
            {
                case ArenaAudioCue.TileSelect: return .03f;
                case ArenaAudioCue.TileMatch:
                case ArenaAudioCue.TileInvalid: return .05f;
                case ArenaAudioCue.Impact: return .04f;
                case ArenaAudioCue.UiClick: return .02f;
                default: return 0f;
            }
        }

        public static ArenaAudioCue ForElement(ArenaElement element)
        {
            switch (element)
            {
                case ArenaElement.Fire: return ArenaAudioCue.ElementFire;
                case ArenaElement.Water: return ArenaAudioCue.ElementWater;
                case ArenaElement.Electric: return ArenaAudioCue.ElementElectric;
                case ArenaElement.Ghost: return ArenaAudioCue.ElementGhost;
                case ArenaElement.Ground: return ArenaAudioCue.ElementGround;
                case ArenaElement.Light: return ArenaAudioCue.ElementLight;
                default: return ArenaAudioCue.None;
            }
        }

        public static bool IsElementCue(ArenaAudioCue cue) =>
            (int)cue >= FirstElementCue && (int)cue <= LastElementCue;

        public static ArenaAmbience AmbienceFor(ArenaHub hub)
        {
            switch (hub)
            {
                case ArenaHub.CinderTerraces: return ArenaAmbience.Fire;
                case ArenaHub.TideglassLagoon: return ArenaAmbience.Water;
                default: return ArenaAmbience.Plaza;
            }
        }

        public static string Id(ArenaAudioCue cue) => "arena_" + cue.ToString().ToLowerInvariant();

        public static string AmbienceId(ArenaAmbience ambience) =>
            "arena_ambience_" + ambience.ToString().ToLowerInvariant();

        public static string MusicId(ArenaCombatScore score) =>
            "arena_score_" + score.ToString().ToLowerInvariant();
    }
}
