using System;
using UnityEngine;
using UnityEngine.Audio;

namespace Aetheria.PetArena.Vfx
{
    // Event-driven audio presentation. It plays cues, ambient loops and combat
    // score; it owns no gameplay state and never mutates a board or match.
    [DisallowMultipleComponent]
    public sealed class ArenaAudioDirector : MonoBehaviour
    {
        [SerializeField] private AudioMixer mixer;
        [SerializeField] private ArenaAudioLibrary library;
        [SerializeField] private bool persistSettings = true;
        [SerializeField, Range(1, 16)] private int voiceCapacity = 8;

        private ArenaAudioSettings settings;
        private AudioSource[] voices;
        private AudioSource musicSource;
        private AudioSource ambienceSource;
        private Transform audioRoot;
        private AudioClip[] cueFallbacks;
        private AudioClip[] ambienceFallbacks;
        private AudioClip[] musicFallbacks;
        private AudioMixerGroup[] channelGroups;
        private bool[] groupResolved;
        private float[] nextCueTime;
        private int nextVoice;
        private int playedCueCount;
        private ArenaAudioCue lastCue = ArenaAudioCue.None;
        private ArenaAudioChannel lastChannel = ArenaAudioChannel.Sfx;
        private ArenaAmbience ambience = ArenaAmbience.None;
        private ArenaCombatScore score = ArenaCombatScore.None;
        private bool initialized;

        public AudioMixer Mixer => mixer;
        public ArenaAudioLibrary Library => library;
        public ArenaAudioCue LastCue => lastCue;
        public ArenaAudioChannel LastChannel => lastChannel;
        public int PlayedCueCount => playedCueCount;
        public ArenaAmbience Ambience => ambience;
        public ArenaCombatScore Score => score;
        public int VoiceCapacity => Mathf.Clamp(voiceCapacity, 1, 16);
        public bool IsInitialized => initialized;
        public AudioSource MusicSource => musicSource;
        public AudioSource AmbienceSource => ambienceSource;
        public AudioSource LastVoiceSource { get; private set; }
        public int ActiveVoiceCount
        {
            get
            {
                if (voices == null) return 0;
                var count = 0;
                for (var index = 0; index < voices.Length; index++)
                    if (voices[index] != null && voices[index].isPlaying) count++;
                return count;
            }
        }

        public ArenaAudioSettings Settings
        {
            get
            {
                EnsureInitialized();
                return settings;
            }
        }

        public void Configure(AudioMixer audioMixer, ArenaAudioLibrary audioLibrary)
        {
            mixer = audioMixer;
            library = audioLibrary;
            groupResolved = null;
            channelGroups = null;
            if (TryGetChannelGroups(out var groups)) EnsureAllGroups(groups);
            if (initialized) ApplySettings();
        }

        private void Awake()
        {
            EnsureInitialized();
        }

        private void OnDestroy()
        {
            StopAll();
            DestroyOwnedAssets();
        }

        public void SetMixer(AudioMixer audioMixer)
        {
            mixer = audioMixer;
            groupResolved = null;
        }

        public void SetLibrary(ArenaAudioLibrary audioLibrary)
        {
            library = audioLibrary;
        }

        public bool ApplySettings()
        {
            EnsureInitialized();
            return ArenaAudioMixerRouter.Apply(mixer, settings);
        }

        public void SaveSettings()
        {
            if (persistSettings) settings?.Save();
        }

        public bool Play(ArenaAudioCue cue, float intensity = 1f)
        {
            if (!ArenaAudioCues.IsDefined(cue)) return false;
            EnsureInitialized();
            var index = (int)cue;
            var clip = ResolveCueClip(cue);
            if (clip == null) return false;
            var now = Time.unscaledTime;
            if (now < nextCueTime[index]) return false;
            nextCueTime[index] = now + ArenaAudioCues.CooldownSeconds(cue);
            var source = voices[nextVoice];
            nextVoice = (nextVoice + 1) % voices.Length;
            var channel = ArenaAudioCues.ChannelFor(cue);
            source.outputAudioMixerGroup = GroupFor(channel);
            source.clip = clip;
            source.pitch = ResolvePitch(cue);
            var gain = mixer != null ? 1f : settings.EffectiveLinear(channel);
            source.volume = Mathf.Clamp01(ResolveVolume(cue) * Mathf.Clamp01(intensity) * gain);
            lastCue = cue;
            lastChannel = channel;
            LastVoiceSource = source;
            playedCueCount++;
            if (Application.isPlaying) source.Play();
            return true;
        }

        public bool PlayElement(ArenaElement element, float intensity = 1f) =>
            Play(ArenaAudioCues.ForElement(element), intensity);

        public bool SetAmbience(ArenaAmbience value)
        {
            EnsureInitialized();
            ambience = value;
            if (ambienceSource == null) return false;
            var clip = value == ArenaAmbience.None ? null : ResolveAmbienceClip(value);
            if (clip == null)
            {
                ambienceSource.Stop();
                ambienceSource.clip = null;
                return value == ArenaAmbience.None;
            }
            ambienceSource.outputAudioMixerGroup = GroupFor(ArenaAudioChannel.Ambient);
            ambienceSource.volume = ResolveAmbienceVolume(value) *
                                    (mixer != null ? 1f : settings.EffectiveLinear(ArenaAudioChannel.Ambient));
            if (ambienceSource.clip != clip)
            {
                ambienceSource.clip = clip;
                if (Application.isPlaying) ambienceSource.Play();
            }
            else if (Application.isPlaying && !ambienceSource.isPlaying)
            {
                ambienceSource.Play();
            }
            return true;
        }

        public bool SetCombatScore(ArenaCombatScore value)
        {
            EnsureInitialized();
            score = value;
            if (musicSource == null) return false;
            var clip = value == ArenaCombatScore.None ? null : ResolveMusicClip(value);
            if (clip == null)
            {
                musicSource.Stop();
                musicSource.clip = null;
                return value == ArenaCombatScore.None;
            }
            musicSource.outputAudioMixerGroup = GroupFor(ArenaAudioChannel.Music);
            musicSource.volume = ResolveMusicVolume(value) *
                                 (mixer != null ? 1f : settings.EffectiveLinear(ArenaAudioChannel.Music));
            if (musicSource.clip != clip)
            {
                musicSource.clip = clip;
                if (Application.isPlaying) musicSource.Play();
            }
            else if (Application.isPlaying && !musicSource.isPlaying)
            {
                musicSource.Play();
            }
            return true;
        }

        public void SetChannelVolume(ArenaAudioChannel channel, float linear)
        {
            settings = Settings;
            settings.SetVolume(channel, linear);
            ApplySettings();
            SaveSettings();
        }

        public void SetChannelMuted(ArenaAudioChannel channel, bool muted)
        {
            settings = Settings;
            settings.SetMuted(channel, muted);
            ApplySettings();
            SaveSettings();
        }

        public bool ToggleChannelMuted(ArenaAudioChannel channel)
        {
            settings = Settings;
            var muted = settings.ToggleMute(channel);
            ApplySettings();
            SaveSettings();
            return muted;
        }

        public bool HasAllMixerGroups()
        {
            EnsureInitialized();
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
                if (GroupFor((ArenaAudioChannel)index) == null) return false;
            return true;
        }

        public AudioClip ResolveCueClip(ArenaAudioCue cue)
        {
            if (!ArenaAudioCues.IsDefined(cue)) return null;
            EnsureInitialized();
            if (library != null && library.TryGetCue(cue, out var overrideClip, out _, out _) &&
                overrideClip != null)
                return overrideClip;
            var index = (int)cue;
            if (cueFallbacks[index] == null)
                cueFallbacks[index] = ArenaAudioFallback.CreateCue(cue);
            return cueFallbacks[index];
        }

        public AudioClip ResolveAmbienceClip(ArenaAmbience value)
        {
            if (value == ArenaAmbience.None) return null;
            EnsureInitialized();
            if (library != null && library.TryGetAmbience(value, out var overrideClip, out _) &&
                overrideClip != null)
                return overrideClip;
            var index = (int)value;
            if (index < 0 || index >= ambienceFallbacks.Length) return null;
            if (ambienceFallbacks[index] == null)
                ambienceFallbacks[index] = ArenaAudioFallback.CreateAmbience(value);
            return ambienceFallbacks[index];
        }

        public AudioClip ResolveMusicClip(ArenaCombatScore value)
        {
            if (value == ArenaCombatScore.None) return null;
            EnsureInitialized();
            if (library != null && library.TryGetMusic(value, out var overrideClip, out _) &&
                overrideClip != null)
                return overrideClip;
            var index = (int)value;
            if (index < 0 || index >= musicFallbacks.Length) return null;
            if (musicFallbacks[index] == null)
                musicFallbacks[index] = ArenaAudioFallback.CreateMusic(value);
            return musicFallbacks[index];
        }

        public void StopAll()
        {
            if (!initialized) return;
            if (voices != null)
                for (var index = 0; index < voices.Length; index++)
                {
                    if (voices[index] == null) continue;
                    voices[index].Stop();
                    voices[index].clip = null;
                }
            if (musicSource != null)
            {
                musicSource.Stop();
                musicSource.clip = null;
            }
            if (ambienceSource != null)
            {
                ambienceSource.Stop();
                ambienceSource.clip = null;
            }
            ambience = ArenaAmbience.None;
            score = ArenaCombatScore.None;
        }

        private float ResolveVolume(ArenaAudioCue cue)
        {
            if (library != null && library.TryGetCue(cue, out _, out var volume, out _)) return volume;
            return .85f;
        }

        private float ResolvePitch(ArenaAudioCue cue)
        {
            if (library == null || !library.TryGetCue(cue, out _, out _, out var pitch)) return 1f;
            if (pitch.y <= 0f) return Mathf.Max(.01f, pitch.x);
            return Mathf.Approximately(pitch.x, pitch.y)
                ? Mathf.Max(.01f, pitch.x)
                : UnityEngine.Random.Range(Mathf.Max(.01f, pitch.x), pitch.y);
        }

        private float ResolveAmbienceVolume(ArenaAmbience value) =>
            library != null && library.TryGetAmbience(value, out _, out var volume) ? volume : .35f;

        private float ResolveMusicVolume(ArenaCombatScore value) =>
            library != null && library.TryGetMusic(value, out _, out var volume) ? volume : .3f;

        private AudioMixerGroup GroupFor(ArenaAudioChannel channel)
        {
            var index = (int)channel;
            if (groupResolved != null && groupResolved[index]) return channelGroups[index];
            groupResolved = groupResolved ?? new bool[ArenaAudioChannels.Count];
            channelGroups = channelGroups ?? new AudioMixerGroup[ArenaAudioChannels.Count];
            groupResolved[index] = true;
            channelGroups[index] = null;
            if (mixer != null)
            {
                var matches = mixer.FindMatchingGroups(ArenaAudioChannels.Name(channel));
                if (matches.Length > 0) channelGroups[index] = matches[0];
            }
            return channelGroups[index];
        }

        private bool TryGetChannelGroups(out AudioMixerGroup[] groups)
        {
            groups = null;
            if (mixer == null) return false;
            groups = new AudioMixerGroup[ArenaAudioChannels.Count];
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var matches = mixer.FindMatchingGroups(ArenaAudioChannels.Name((ArenaAudioChannel)index));
                if (matches.Length == 0) return false;
                groups[index] = matches[0];
            }
            return true;
        }

        private void EnsureAllGroups(AudioMixerGroup[] groups)
        {
            groupResolved = new bool[ArenaAudioChannels.Count];
            channelGroups = new AudioMixerGroup[ArenaAudioChannels.Count];
            for (var index = 0; index < groups.Length; index++)
            {
                groupResolved[index] = true;
                channelGroups[index] = groups[index];
            }
        }

        private void EnsureInitialized()
        {
            if (initialized) return;
            initialized = true;
            settings = persistSettings
                ? ArenaAudioSettings.Load(new ArenaPlayerPrefsAudioStore())
                : ArenaAudioSettings.CreateTransient();
            cueFallbacks = new AudioClip[ArenaAudioCues.Count];
            ambienceFallbacks = new AudioClip[4];
            musicFallbacks = new AudioClip[3];
            nextCueTime = new float[ArenaAudioCues.Count];
            groupResolved = new bool[ArenaAudioChannels.Count];
            channelGroups = new AudioMixerGroup[ArenaAudioChannels.Count];
            audioRoot = new GameObject("Arena Audio").transform;
            audioRoot.SetParent(transform, false);
            audioRoot.gameObject.hideFlags = HideFlags.DontSave;
            voices = new AudioSource[VoiceCapacity];
            for (var index = 0; index < voices.Length; index++)
                voices[index] = CreateSource("Voice " + index, false);
            musicSource = CreateSource("Music", true);
            ambienceSource = CreateSource("Ambience", true);
            ApplySettings();
            if (Application.isPlaying && FindFirstObjectByType<AudioListener>() == null)
                gameObject.AddComponent<AudioListener>();
        }

        private AudioSource CreateSource(string sourceName, bool loop)
        {
            var sourceObject = new GameObject(sourceName);
            sourceObject.transform.SetParent(audioRoot, false);
            sourceObject.hideFlags = HideFlags.DontSave;
            var source = sourceObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;
            source.dopplerLevel = 0f;
            source.volume = 1f;
            return source;
        }

        private void DestroyOwnedAssets()
        {
            initialized = false;
            if (audioRoot != null)
            {
                ArenaRuntimeAssets.Destroy(audioRoot.gameObject);
                audioRoot = null;
            }
            if (cueFallbacks != null)
            {
                for (var index = 0; index < cueFallbacks.Length; index++)
                    ArenaRuntimeAssets.Destroy(cueFallbacks[index]);
                cueFallbacks = null;
            }
            if (ambienceFallbacks != null)
            {
                for (var index = 0; index < ambienceFallbacks.Length; index++)
                    ArenaRuntimeAssets.Destroy(ambienceFallbacks[index]);
                ambienceFallbacks = null;
            }
            if (musicFallbacks != null)
            {
                for (var index = 0; index < musicFallbacks.Length; index++)
                    ArenaRuntimeAssets.Destroy(musicFallbacks[index]);
                musicFallbacks = null;
            }
            voices = null;
            musicSource = null;
            ambienceSource = null;
        }
    }
}
