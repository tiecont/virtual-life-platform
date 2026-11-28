using UnityEngine;
using UnityEngine.Audio;

namespace Aetheria.PetArena.Vfx
{
    // Applies persisted per-bus gains to the committed AudioMixer through its
    // exposed Volume parameters. Mute is the conventional -80 dB value because
    // Unity mixers expose gain, not a boolean mute parameter.
    public static class ArenaAudioMixerRouter
    {
        public static bool Apply(AudioMixer mixer, ArenaAudioSettings settings)
        {
            if (mixer == null || settings == null) return false;
            var applied = true;
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                applied &= TryApply(mixer, channel, settings.ChannelLinear(channel));
            }
            return applied;
        }

        public static bool TryApply(AudioMixer mixer, ArenaAudioChannel channel, float linear)
        {
            if (mixer == null || !ArenaAudioChannels.IsDefined(channel)) return false;
            return mixer.SetFloat(ArenaAudioChannels.VolumeParameter(channel),
                ArenaAudioSettings.ToDecibels(linear));
        }

        public static bool TryRead(AudioMixer mixer, ArenaAudioChannel channel, out float decibels)
        {
            decibels = 0f;
            if (mixer == null || !ArenaAudioChannels.IsDefined(channel)) return false;
            return mixer.GetFloat(ArenaAudioChannels.VolumeParameter(channel), out decibels);
        }

        // True only when the mixer asset exposes all six Volume parameters.
        public static bool HasAllChannels(AudioMixer mixer)
        {
            if (mixer == null) return false;
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
                if (!TryRead(mixer, (ArenaAudioChannel)index, out _)) return false;
            return true;
        }
    }
}
