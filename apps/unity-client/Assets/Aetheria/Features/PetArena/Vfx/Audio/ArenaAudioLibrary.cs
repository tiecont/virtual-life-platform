using System;
using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    [Serializable]
    public sealed class ArenaAudioCueEntry
    {
        public ArenaAudioCue cue = ArenaAudioCue.None;

        [Tooltip("Optional licensed or owner-approved clip. Leave empty to use the generated placeholder.")]
        public AudioClip clip;

        [Range(0f, 1f)] public float volume = .85f;
        public Vector2 pitch = Vector2.one;
    }

    [Serializable]
    public sealed class ArenaAmbienceEntry
    {
        public ArenaAmbience ambience = ArenaAmbience.None;
        public AudioClip clip;
        [Range(0f, 1f)] public float volume = .35f;
    }

    [Serializable]
    public sealed class ArenaMusicEntry
    {
        public ArenaCombatScore score = ArenaCombatScore.None;
        public AudioClip clip;
        [Range(0f, 1f)] public float volume = .3f;
    }

    // Override table for approved media. Every entry stays empty until licensed
    // or owner-approved audio is delivered, so the generated placeholders run.
    [CreateAssetMenu(menuName = "Aetheria/Arena Audio Library", fileName = "ArenaAudioLibrary")]
    public sealed class ArenaAudioLibrary : ScriptableObject
    {
        [SerializeField] private ArenaAudioCueEntry[] cues = Array.Empty<ArenaAudioCueEntry>();
        [SerializeField] private ArenaAmbienceEntry[] ambiences = Array.Empty<ArenaAmbienceEntry>();
        [SerializeField] private ArenaMusicEntry[] music = Array.Empty<ArenaMusicEntry>();

        public int CueEntryCount => cues?.Length ?? 0;
        public int AmbienceEntryCount => ambiences?.Length ?? 0;
        public int MusicEntryCount => music?.Length ?? 0;

        public bool TryGetCue(ArenaAudioCue cue, out AudioClip clip, out float volume, out Vector2 pitch)
        {
            clip = null;
            volume = .85f;
            pitch = Vector2.one;
            if (cues == null) return false;
            for (var index = 0; index < cues.Length; index++)
            {
                var entry = cues[index];
                if (entry == null || entry.cue != cue) continue;
                clip = entry.clip;
                volume = Mathf.Clamp01(entry.volume);
                pitch = entry.pitch;
                return true;
            }
            return false;
        }

        public bool TryGetAmbience(ArenaAmbience ambience, out AudioClip clip, out float volume)
        {
            clip = null;
            volume = .35f;
            if (ambiences == null) return false;
            for (var index = 0; index < ambiences.Length; index++)
            {
                var entry = ambiences[index];
                if (entry == null || entry.ambience != ambience) continue;
                clip = entry.clip;
                volume = Mathf.Clamp01(entry.volume);
                return true;
            }
            return false;
        }

        public bool TryGetMusic(ArenaCombatScore score, out AudioClip clip, out float volume)
        {
            clip = null;
            volume = .3f;
            if (music == null) return false;
            for (var index = 0; index < music.Length; index++)
            {
                var entry = music[index];
                if (entry == null || entry.score != score) continue;
                clip = entry.clip;
                volume = Mathf.Clamp01(entry.volume);
                return true;
            }
            return false;
        }

        // Every event must have exactly one row so a missing override is visible
        // in review instead of silently dropping a cue at runtime.
        public bool CoversEveryCue(out string missing)
        {
            missing = string.Empty;
            var seen = new int[ArenaAudioCues.Count];
            if (cues != null)
                for (var index = 0; index < cues.Length; index++)
                {
                    var entry = cues[index];
                    if (entry == null || !ArenaAudioCues.IsDefined(entry.cue)) continue;
                    seen[(int)entry.cue]++;
                }
            for (var index = 1; index < ArenaAudioCues.Count; index++)
            {
                if (seen[index] == 1) continue;
                var label = ((ArenaAudioCue)index) + "(" + seen[index] + ")";
                missing = missing.Length == 0 ? label : missing + "," + label;
            }
            return missing.Length == 0;
        }

        public void Configure(ArenaAudioCueEntry[] cueEntries, ArenaAmbienceEntry[] ambienceEntries,
            ArenaMusicEntry[] musicEntries)
        {
            cues = cueEntries ?? Array.Empty<ArenaAudioCueEntry>();
            ambiences = ambienceEntries ?? Array.Empty<ArenaAmbienceEntry>();
            music = musicEntries ?? Array.Empty<ArenaMusicEntry>();
        }
    }
}
