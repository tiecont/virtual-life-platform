using System.Collections.Generic;
using Aetheria.PetArena.Vfx;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using Object = UnityEngine.Object;

namespace Aetheria.Tests.EditMode
{
    public sealed class ArenaAudioTests
    {
        private const string MixerPath =
            "Assets/Aetheria/Features/PetArena/Vfx/Audio/AetheriaArenaMixer.mixer";
        private const string LibraryPath =
            "Assets/Aetheria/Features/PetArena/Vfx/Audio/ArenaAudioLibrary.asset";
        private const string PrefabPath =
            "Assets/Aetheria/Features/PetArena/Vfx/Audio/Resources/ArenaPresentation.prefab";

        private sealed class MemoryStore : IArenaAudioPreferenceStore
        {
            private readonly Dictionary<string, float> floats = new Dictionary<string, float>();
            private readonly Dictionary<string, int> integers = new Dictionary<string, int>();
            public int SaveCount;

            public bool HasKey(string key) => floats.ContainsKey(key) || integers.ContainsKey(key);

            public float GetFloat(string key, float fallback) =>
                floats.TryGetValue(key, out var value) ? value : fallback;

            public int GetInt(string key, int fallback) =>
                integers.TryGetValue(key, out var value) ? value : fallback;

            public void SetFloat(string key, float value) => floats[key] = value;
            public void SetInt(string key, int value) => integers[key] = value;
            public void Save() => SaveCount++;
        }

        private static ArenaAudioDirector CreateDirector(GameObject host)
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            var director = host.AddComponent<ArenaAudioDirector>();
            var serialized = new SerializedObject(director);
            serialized.FindProperty("persistSettings").boolValue = false;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            director.SetMixer(mixer);
            director.SetLibrary(library);
            return director;
        }

        [Test]
        public void CommittedMixerHasMasterWithFiveIndependentPresentationBuses()
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            Assert.That(mixer, Is.Not.Null, MixerPath);
            Assert.That(ArenaAudioMixerRouter.HasAllChannels(mixer), Is.True,
                "Every bus needs an exposed Volume parameter");
            // FindMatchingGroups treats the sub path as a prefix, so "Master"
            // returns the master group plus every child bus.
            var master = mixer.FindMatchingGroups(ArenaAudioChannels.Name(ArenaAudioChannel.Master));
            Assert.That(master.Length, Is.EqualTo(ArenaAudioChannels.Count),
                "Master must own exactly the five presentation buses");
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                var name = ArenaAudioChannels.Name(channel);
                Assert.That(mixer.GetFloat(ArenaAudioChannels.VolumeParameter(channel), out _), Is.True, name);
                if (channel == ArenaAudioChannel.Master) continue;
                var groups = mixer.FindMatchingGroups("Master/" + name);
                Assert.That(groups.Length, Is.EqualTo(1), name + " under Master");
                Assert.That(groups[0], Is.Not.SameAs(master[0]), name + " must not be the Master group");
            }
        }

        [Test]
        public void IndependentVolumesAndMutesPersistAcrossLoads()
        {
            var store = new MemoryStore();
            var settings = ArenaAudioSettings.Load(store);
            var changes = 0;
            settings.Changed += _ => changes++;
            settings.SetVolume(ArenaAudioChannel.Music, .4f);
            settings.SetVolume(ArenaAudioChannel.Ui, .9f);
            settings.SetMuted(ArenaAudioChannel.Voice, true);
            settings.Save();
            Assert.That(store.SaveCount, Is.EqualTo(1));
            Assert.That(changes, Is.EqualTo(3));

            var reloaded = ArenaAudioSettings.Load(store);
            Assert.That(reloaded.GetVolume(ArenaAudioChannel.Music), Is.EqualTo(.4f).Within(.001f));
            Assert.That(reloaded.GetVolume(ArenaAudioChannel.Ui), Is.EqualTo(.9f).Within(.001f));
            Assert.That(reloaded.GetVolume(ArenaAudioChannel.Ambient), Is.EqualTo(1f));
            Assert.That(reloaded.IsMuted(ArenaAudioChannel.Voice), Is.True);
            Assert.That(reloaded.IsMuted(ArenaAudioChannel.Sfx), Is.False);
            Assert.That(reloaded.ChannelLinear(ArenaAudioChannel.Voice), Is.Zero);
            Assert.That(reloaded.IsMuted(ArenaAudioChannel.Master), Is.False);

            reloaded.SetVolume(ArenaAudioChannel.Master, .5f);
            Assert.That(reloaded.ChannelLinear(ArenaAudioChannel.Music), Is.EqualTo(.4f).Within(.001f));
            Assert.That(reloaded.EffectiveLinear(ArenaAudioChannel.Music), Is.EqualTo(.2f).Within(.001f));
            reloaded.SetMuted(ArenaAudioChannel.Master, true);
            Assert.That(reloaded.EffectiveLinear(ArenaAudioChannel.Music), Is.Zero);
            Assert.That(reloaded.ChannelLinear(ArenaAudioChannel.Music), Is.EqualTo(.4f).Within(.001f));

            reloaded.SetVolume(ArenaAudioChannel.Ambient, 3f);
            reloaded.SetVolume(ArenaAudioChannel.Sfx, -2f);
            Assert.That(reloaded.GetVolume(ArenaAudioChannel.Ambient), Is.EqualTo(1f));
            Assert.That(reloaded.GetVolume(ArenaAudioChannel.Sfx), Is.Zero);
        }

        [Test]
        public void MixerRouterReadsEveryExposedBusGainAndConvertsDecibels()
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            var settings = ArenaAudioSettings.Load(new MemoryStore());
            try
            {
                for (var index = 0; index < ArenaAudioChannels.Count; index++)
                {
                    var channel = (ArenaAudioChannel)index;
                    Assert.That(ArenaAudioMixerRouter.TryRead(mixer, channel, out _), Is.True,
                        ArenaAudioChannels.VolumeParameter(channel));
                }
                // Unity suspends a mixer outside Play mode, so SetFloat reports
                // false there. The routing call must still be safe and must not
                // throw; actual gain changes are proven in the Play mode test.
                Assert.DoesNotThrow(() => ArenaAudioMixerRouter.Apply(mixer, settings));
                Assert.That(ArenaAudioSettings.ToDecibels(.5f), Is.EqualTo(-6.0206f).Within(.001f));
                Assert.That(ArenaAudioSettings.ToDecibels(0f),
                    Is.EqualTo(ArenaAudioChannels.MuteDecibels).Within(.01f));
                Assert.That(ArenaAudioSettings.ToLinear(-6.0206f), Is.EqualTo(.5f).Within(.001f));
                Assert.That(ArenaAudioSettings.ToLinear(ArenaAudioChannels.MuteDecibels), Is.Zero);
            }
            finally
            {
                ArenaAudioMixerRouter.Apply(mixer, ArenaAudioSettings.CreateTransient());
            }
        }

        [Test]
        public void LibraryHasOneOverrideRowForEveryCueAmbienceAndScore()
        {
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            Assert.That(library, Is.Not.Null, LibraryPath);
            Assert.That(library.CoversEveryCue(out var missing), Is.True, missing);
            Assert.That(library.CueEntryCount, Is.EqualTo(ArenaAudioCues.Count - 1));
            for (var index = 1; index < ArenaAudioCues.Count; index++)
            {
                var cue = (ArenaAudioCue)index;
                Assert.That(library.TryGetCue(cue, out _, out var volume, out _), Is.True, cue.ToString());
                Assert.That(volume, Is.InRange(0f, 1f), cue.ToString());
            }
            foreach (var ambience in new[] {ArenaAmbience.Plaza, ArenaAmbience.Fire, ArenaAmbience.Water})
                Assert.That(library.TryGetAmbience(ambience, out _, out var volume), Is.True,
                    ambience + " row, volume " + volume);
            foreach (var score in new[] {ArenaCombatScore.Regular, ArenaCombatScore.Boss})
                Assert.That(library.TryGetMusic(score, out _, out _), Is.True, score.ToString());
        }

        [Test]
        public void ProceduralFallbackProducesAnAudiblePlaceholderForEveryEvent()
        {
            for (var index = 1; index < ArenaAudioCues.Count; index++)
            {
                var cue = (ArenaAudioCue)index;
                var clip = ArenaAudioFallback.CreateCue(cue);
                Assert.That(clip, Is.Not.Null, cue.ToString());
                try
                {
                    Assert.That(clip.samples, Is.GreaterThan(0), cue.ToString());
                    Assert.That(clip.channels, Is.EqualTo(1), cue.ToString());
                    Assert.That(clip.frequency, Is.EqualTo(ArenaAudioFallback.SampleRate), cue.ToString());
                    var data = new float[clip.samples];
                    Assert.That(clip.GetData(data, 0), Is.True, cue.ToString());
                    var peak = 0f;
                    for (var sample = 0; sample < data.Length; sample++)
                        peak = Mathf.Max(peak, Mathf.Abs(data[sample]));
                    Assert.That(peak, Is.GreaterThan(.01f), cue + " placeholder is silent");
                }
                finally
                {
                    Object.DestroyImmediate(clip);
                }
            }
            foreach (var ambience in new[] {ArenaAmbience.Plaza, ArenaAmbience.Fire, ArenaAmbience.Water})
            {
                var clip = ArenaAudioFallback.CreateAmbience(ambience);
                Assert.That(clip, Is.Not.Null, ambience.ToString());
                Assert.That(clip.samples, Is.GreaterThan(ArenaAudioFallback.SampleRate), ambience + " loop");
                Object.DestroyImmediate(clip);
            }
            foreach (var score in new[] {ArenaCombatScore.Regular, ArenaCombatScore.Boss})
            {
                var clip = ArenaAudioFallback.CreateMusic(score);
                Assert.That(clip, Is.Not.Null, score.ToString());
                Object.DestroyImmediate(clip);
            }
        }

        [Test]
        public void DirectorRoutesEveryEventThroughItsBusAndControlsAmbience()
        {
            var host = new GameObject("Arena audio director test");
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            try
            {
                var director = CreateDirector(host);
                Assert.That(director.HasAllMixerGroups(), Is.True);
                for (var index = 1; index < ArenaAudioCues.Count; index++)
                {
                    var cue = (ArenaAudioCue)index;
                    Assert.That(director.ResolveCueClip(cue), Is.Not.Null, cue.ToString());
                    Assert.That(director.Play(cue), Is.True, cue.ToString());
                    Assert.That(director.LastCue, Is.EqualTo(cue), cue.ToString());
                    Assert.That(director.LastChannel, Is.EqualTo(ArenaAudioCues.ChannelFor(cue)),
                        cue.ToString());
                }
                Assert.That(director.PlayedCueCount, Is.EqualTo(ArenaAudioCues.Count - 1));

                Assert.That(director.SetAmbience(ArenaAmbience.Fire), Is.True);
                Assert.That(director.Ambience, Is.EqualTo(ArenaAmbience.Fire));
                Assert.That(director.AmbienceSource.clip, Is.Not.Null);
                Assert.That(director.AmbienceSource.loop, Is.True);
                Assert.That(director.AmbienceSource.outputAudioMixerGroup, Is.Not.Null);
                Assert.That(director.SetCombatScore(ArenaCombatScore.Boss), Is.True);
                Assert.That(director.Score, Is.EqualTo(ArenaCombatScore.Boss));
                Assert.That(director.MusicSource.clip, Is.Not.Null);
                Assert.That(director.MusicSource.outputAudioMixerGroup, Is.Not.Null);
                Assert.That(director.SetCombatScore(ArenaCombatScore.None), Is.True);
                Assert.That(director.MusicSource.clip, Is.Null);
                Assert.That(director.SetAmbience(ArenaAmbience.None), Is.True);
                Assert.That(director.AmbienceSource.clip, Is.Null);

                director.SetChannelVolume(ArenaAudioChannel.Music, .25f);
                Assert.That(director.Settings.GetVolume(ArenaAudioChannel.Music),
                    Is.EqualTo(.25f).Within(.001f));
                director.SetChannelMuted(ArenaAudioChannel.Sfx, true);
                Assert.That(director.Settings.IsMuted(ArenaAudioChannel.Sfx), Is.True);
                Assert.That(director.Settings.GetVolume(ArenaAudioChannel.Music),
                    Is.EqualTo(.25f).Within(.001f), "Muting SFX cannot change Music");
                Assert.That(mixer.GetFloat(ArenaAudioChannels.VolumeParameter(ArenaAudioChannel.Sfx),
                    out _), Is.True);
            }
            finally
            {
                Object.DestroyImmediate(host);
                ArenaAudioMixerRouter.Apply(mixer, ArenaAudioSettings.CreateTransient());
            }
        }

        [Test]
        public void DirectorAppliesVolumeAndMuteToSourcesWithoutAMixer()
        {
            var host = new GameObject("Arena audio fallback gain test");
            try
            {
                var director = host.AddComponent<ArenaAudioDirector>();
                var serialized = new SerializedObject(director);
                serialized.FindProperty("persistSettings").boolValue = false;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                director.Settings.SetVolume(ArenaAudioChannel.Master, .5f);
                Assert.That(director.Play(ArenaAudioCue.Attack), Is.True);
                Assert.That(director.LastVoiceSource, Is.Not.Null);
                Assert.That(director.LastVoiceSource.volume, Is.EqualTo(.85f * .5f).Within(.01f),
                    "Without a mixer the persisted gain scales the source");
                director.Settings.SetMuted(ArenaAudioChannel.Master, true);
                Assert.That(director.Play(ArenaAudioCue.Impact), Is.True);
                Assert.That(director.LastVoiceSource.volume, Is.Zero, "Master mute silences cues");
                Assert.That(director.ApplySettings(), Is.False, "No mixer has no mixer gain");
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void DevelopmentLibraryResolvesImportedCombatCuesAndEnvironmentLoops()
        {
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            foreach (var cue in new[] { ArenaAudioCue.TileMatch, ArenaAudioCue.BossWarning,
                ArenaAudioCue.Impact, ArenaAudioCue.Victory, ArenaAudioCue.Defeat })
            {
                Assert.That(library.TryGetCue(cue, out var clip, out _, out _), Is.True, cue.ToString());
                Assert.That(AssetDatabase.GetAssetPath(clip), Does.EndWith(".ogg"));
                Assert.That(clip.samples, Is.GreaterThan(0));
            }
            foreach (var map in new[] { ArenaAmbience.Fire, ArenaAmbience.Water })
            {
                Assert.That(library.TryGetAmbience(map, out var clip, out _), Is.True, map.ToString());
                Assert.That(clip.length, Is.GreaterThan(3f));
            }
        }

        [Test]
        public void IntegrationPrefabWiresMixerLibraryAndBothDirectors()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            Assert.That(prefab, Is.Not.Null, PrefabPath);
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            var audio = prefab.GetComponent<ArenaAudioDirector>();
            var vfx = prefab.GetComponent<ArenaVfxDirector>();
            var bridge = prefab.GetComponent<ArenaPresentationBridge>();
            Assert.That(audio, Is.Not.Null);
            Assert.That(vfx, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);
            Assert.That(audio.Mixer, Is.SameAs(mixer));
            Assert.That(audio.Library, Is.Not.Null);
            Assert.That(bridge.HasWiredAudio, Is.True);
            Assert.That(bridge.HasWiredVfx, Is.True);
            Assert.That(bridge.ReducedMotion, Is.True);
            Assert.That(prefab.GetComponentsInChildren<Collider>().Length, Is.Zero);
        }
    }
}
