using System;
using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    // Storage seam so settings can be persisted through PlayerPrefs in a player
    // and through an in-memory store in tests without touching host preferences.
    public interface IArenaAudioPreferenceStore
    {
        bool HasKey(string key);
        float GetFloat(string key, float fallback);
        int GetInt(string key, int fallback);
        void SetFloat(string key, float value);
        void SetInt(string key, int value);
        void Save();
    }

    public sealed class ArenaPlayerPrefsAudioStore : IArenaAudioPreferenceStore
    {
        public bool HasKey(string key) => PlayerPrefs.HasKey(key);
        public float GetFloat(string key, float fallback) => PlayerPrefs.GetFloat(key, fallback);
        public int GetInt(string key, int fallback) => PlayerPrefs.GetInt(key, fallback);
        public void SetFloat(string key, float value) => PlayerPrefs.SetFloat(key, value);
        public void SetInt(string key, int value) => PlayerPrefs.SetInt(key, value);
        public void Save() => PlayerPrefs.Save();
    }

    // Linear (not dB) independent gains and mutes for the six mixer buses.
    // Master mute silences the whole mix; every other mute is independent.
    public sealed class ArenaAudioSettings
    {
        public const int SchemaVersion = 1;
        public const string VolumeKeyFormat = "aetheria.arena.audio.v1.{0}.volume";
        public const string MuteKeyFormat = "aetheria.arena.audio.v1.{0}.mute";
        private const float MinimumLinear = .0001f;

        private readonly IArenaAudioPreferenceStore store;
        private readonly float[] volumes = new float[ArenaAudioChannels.Count];
        private readonly bool[] muted = new bool[ArenaAudioChannels.Count];

        public event Action<ArenaAudioChannel> Changed;

        private ArenaAudioSettings(IArenaAudioPreferenceStore store)
        {
            this.store = store;
            for (var index = 0; index < volumes.Length; index++)
            {
                volumes[index] = 1f;
                muted[index] = false;
            }
        }

        public bool Persistent => store != null;

        public static ArenaAudioSettings CreateTransient()
        {
            return new ArenaAudioSettings(null);
        }

        public static ArenaAudioSettings Load(IArenaAudioPreferenceStore store)
        {
            var settings = new ArenaAudioSettings(store);
            if (store == null) return settings;
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                settings.volumes[index] = Mathf.Clamp01(store.GetFloat(VolumeKey(channel), 1f));
                settings.muted[index] = store.GetInt(MuteKey(channel), 0) != 0;
            }
            return settings;
        }

        public float GetVolume(ArenaAudioChannel channel)
        {
            EnsureDefined(channel);
            return volumes[(int)channel];
        }

        public void SetVolume(ArenaAudioChannel channel, float linear)
        {
            EnsureDefined(channel);
            var value = Mathf.Clamp01(linear);
            if (Mathf.Approximately(value, volumes[(int)channel])) return;
            volumes[(int)channel] = value;
            Persist(channel);
            Changed?.Invoke(channel);
        }

        public bool IsMuted(ArenaAudioChannel channel)
        {
            EnsureDefined(channel);
            return muted[(int)channel];
        }

        public void SetMuted(ArenaAudioChannel channel, bool value)
        {
            EnsureDefined(channel);
            if (muted[(int)channel] == value) return;
            muted[(int)channel] = value;
            Persist(channel);
            Changed?.Invoke(channel);
        }

        public bool ToggleMute(ArenaAudioChannel channel)
        {
            SetMuted(channel, !IsMuted(channel));
            return IsMuted(channel);
        }

        // Own bus gain only; used for the AudioMixer parameter of that channel.
        public float ChannelLinear(ArenaAudioChannel channel)
        {
            EnsureDefined(channel);
            return muted[(int)channel] ? 0f : volumes[(int)channel];
        }

        // Own bus gain composed with the Master bus, for a source that is not
        // routed through the mixer.
        public float EffectiveLinear(ArenaAudioChannel channel)
        {
            EnsureDefined(channel);
            var own = ChannelLinear(channel);
            return channel == ArenaAudioChannel.Master ? own : own * ChannelLinear(ArenaAudioChannel.Master);
        }

        public void Save()
        {
            store?.Save();
        }

        public void ResetToDefaults()
        {
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                volumes[index] = 1f;
                muted[index] = false;
                Persist(channel);
                Changed?.Invoke(channel);
            }
        }

        public static float ToDecibels(float linear)
        {
            if (linear <= 0f) return ArenaAudioChannels.MuteDecibels;
            return Mathf.Log10(Mathf.Max(linear, MinimumLinear)) * 20f;
        }

        public static float ToLinear(float decibels)
        {
            if (decibels <= ArenaAudioChannels.MuteDecibels) return 0f;
            return Mathf.Clamp01(Mathf.Pow(10f, decibels / 20f));
        }

        private void Persist(ArenaAudioChannel channel)
        {
            if (store == null) return;
            store.SetFloat(VolumeKey(channel), volumes[(int)channel]);
            store.SetInt(MuteKey(channel), muted[(int)channel] ? 1 : 0);
        }

        private static string VolumeKey(ArenaAudioChannel channel) =>
            string.Format(VolumeKeyFormat, ArenaAudioChannels.Name(channel).ToLowerInvariant());

        private static string MuteKey(ArenaAudioChannel channel) =>
            string.Format(MuteKeyFormat, ArenaAudioChannels.Name(channel).ToLowerInvariant());

        private static void EnsureDefined(ArenaAudioChannel channel)
        {
            if (!ArenaAudioChannels.IsDefined(channel))
                throw new ArgumentOutOfRangeException(nameof(channel));
        }
    }
}
