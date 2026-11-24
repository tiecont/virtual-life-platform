using System;

namespace Aetheria.PetArena.Vfx
{
    // The five presentation buses plus Master. Each bus owns an independent
    // persisted volume and mute so a player can silence UI or Music alone.
    public enum ArenaAudioChannel
    {
        Master = 0,
        Music = 1,
        Ambient = 2,
        Sfx = 3,
        Voice = 4,
        Ui = 5
    }

    public static class ArenaAudioChannels
    {
        public const int Count = 6;
        public const float MuteDecibels = -80f;

        public static bool IsDefined(ArenaAudioChannel channel) =>
            (int)channel >= 0 && (int)channel < Count;

        public static string Name(ArenaAudioChannel channel)
        {
            switch (channel)
            {
                case ArenaAudioChannel.Master: return "Master";
                case ArenaAudioChannel.Music: return "Music";
                case ArenaAudioChannel.Ambient: return "Ambient";
                case ArenaAudioChannel.Sfx: return "SFX";
                case ArenaAudioChannel.Voice: return "Voice";
                case ArenaAudioChannel.Ui: return "UI";
                default: throw new ArgumentOutOfRangeException(nameof(channel));
            }
        }

        // Exposed AudioMixer parameter names match the committed mixer asset.
        public static string VolumeParameter(ArenaAudioChannel channel) => Name(channel) + "Volume";

        public static bool TryParse(string name, out ArenaAudioChannel channel)
        {
            for (var index = 0; index < Count; index++)
            {
                var candidate = (ArenaAudioChannel)index;
                if (string.Equals(Name(candidate), name, StringComparison.Ordinal) ||
                    string.Equals(candidate.ToString(), name, StringComparison.Ordinal))
                {
                    channel = candidate;
                    return true;
                }
            }
            channel = ArenaAudioChannel.Master;
            return false;
        }
    }
}
