using System.Collections;
using Aetheria.PetArena.Vfx;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Aetheria.Tests.PlayMode
{
    // Runs against an actual audio device in a player or Play mode Editor. It
    // proves routing, playback and persistence, not production mix quality.
    public sealed class ArenaAudioPlayModeTests
    {
        private static void ClearPreferences()
        {
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var id = ArenaAudioChannels.Name((ArenaAudioChannel)index).ToLowerInvariant();
                PlayerPrefs.DeleteKey(string.Format(ArenaAudioSettings.VolumeKeyFormat, id));
                PlayerPrefs.DeleteKey(string.Format(ArenaAudioSettings.MuteKeyFormat, id));
            }
            PlayerPrefs.Save();
        }

        [UnityTest]
        public IEnumerator PrefabPlaysEventsThroughIndependentBusesAndPersistsMute()
        {
            ClearPreferences();
            var prefab = Resources.Load<GameObject>("ArenaPresentation");
            Assert.That(prefab, Is.Not.Null, "ArenaPresentation prefab must be under Resources");
            var instance = Object.Instantiate(prefab);
            var audio = instance.GetComponent<ArenaAudioDirector>();
            var bridge = instance.GetComponent<ArenaPresentationBridge>();
            var vfx = instance.GetComponent<ArenaVfxDirector>();
            Assert.That(audio, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);
            Assert.That(vfx, Is.Not.Null);
            var mixer = audio.Mixer;
            Assert.That(mixer, Is.Not.Null);
            Assert.That(ArenaAudioMixerRouter.HasAllChannels(mixer), Is.True);
            try
            {
                bridge.EnterHub(ArenaHub.CinderTerraces);
                yield return null;
                Assert.That(audio.Ambience, Is.EqualTo(ArenaAmbience.Fire));
                Assert.That(audio.AmbienceSource.isPlaying, Is.True);
                Assert.That(audio.AmbienceSource.loop, Is.True);
                Assert.That(audio.AmbienceSource.outputAudioMixerGroup, Is.Not.Null);

                bridge.EnterHub(ArenaHub.TideglassLagoon);
                yield return null;
                Assert.That(audio.Ambience, Is.EqualTo(ArenaAmbience.Water));
                Assert.That(audio.AmbienceSource.isPlaying, Is.True);

                bridge.BeginCombat(ArenaCombatScore.Boss);
                yield return null;
                Assert.That(audio.Score, Is.EqualTo(ArenaCombatScore.Boss));
                Assert.That(audio.MusicSource.isPlaying, Is.True);
                Assert.That(audio.MusicSource.outputAudioMixerGroup, Is.Not.Null);

                bridge.NotifyTileSelected(Vector3.zero);
                yield return null;
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.TileSelect));
                Assert.That(audio.ActiveVoiceCount, Is.GreaterThan(0), "A cue must reach an AudioSource");

                bridge.SetChannelMuted(ArenaAudioChannel.Ui, true);
                yield return null;
                Assert.That(mixer.GetFloat(ArenaAudioChannels.VolumeParameter(ArenaAudioChannel.Ui),
                    out var uiDecibels), Is.True);
                Assert.That(uiDecibels, Is.EqualTo(ArenaAudioChannels.MuteDecibels).Within(.1f));
                Assert.That(mixer.GetFloat(ArenaAudioChannels.VolumeParameter(ArenaAudioChannel.Sfx),
                    out var sfxDecibels), Is.True);
                Assert.That(sfxDecibels, Is.EqualTo(0f).Within(.1f), "UI mute leaves SFX independent");
                var reloaded = ArenaAudioSettings.Load(new ArenaPlayerPrefsAudioStore());
                Assert.That(reloaded.IsMuted(ArenaAudioChannel.Ui), Is.True, "Mute persists");
                Assert.That(reloaded.IsMuted(ArenaAudioChannel.Sfx), Is.False);

                bridge.SetChannelMuted(ArenaAudioChannel.Ui, false);
                yield return null;
                Assert.That(mixer.GetFloat(ArenaAudioChannels.VolumeParameter(ArenaAudioChannel.Ui),
                    out var restored), Is.True);
                Assert.That(restored, Is.EqualTo(0f).Within(.1f));

                bridge.NotifyFireZone(Vector3.zero, 1f);
                yield return null;
                Assert.That(vfx.IsFireZoneActive, Is.True);
                Assert.That(vfx.FireZoneCellCount, Is.EqualTo(16));
                bridge.NotifyGuard(Vector3.zero);
                yield return null;
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Guard));
                bridge.NotifyVictory(Vector3.zero);
                yield return null;
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Victory));
                Assert.That(audio.Score, Is.EqualTo(ArenaCombatScore.None));
                yield return new WaitForSecondsRealtime(.3f);
            }
            finally
            {
                Object.Destroy(instance);
                ClearPreferences();
            }
        }

        [UnityTest]
        public IEnumerator FlashAndShakeRespectControlsAndRestoreTheCamera()
        {
            var cameraObject = new GameObject("Arena audio test camera") {tag = "MainCamera"};
            var camera = cameraObject.AddComponent<Camera>();
            var start = cameraObject.transform.localPosition;
            var host = new GameObject("Arena audio feedback test");
            var director = ArenaVfxDirector.Ensure(host);
            director.BindCamera(camera);
            try
            {
                director.SetReducedMotion(true);
                director.SetFlashEnabled(true);
                director.AttackImpact(ArenaElement.Fire, Vector3.zero, ArenaImpactStrength.Strong);
                // Flash and shake start synchronously; a cold first player frame
                // can already be longer than a short effect, so assert before it.
                Assert.That(director.IsScreenFlashActive, Is.True);
                Assert.That(director.IsCameraShaking, Is.False, "Reduced motion suppresses shake");
                yield return new WaitForSecondsRealtime(.4f);
                Assert.That(director.IsScreenFlashActive, Is.False);

                director.SetReducedMotion(false);
                director.SetFlashEnabled(false);
                director.SetShakeScale(1f);
                director.AttackImpact(ArenaElement.Fire, Vector3.zero, ArenaImpactStrength.Strong);
                Assert.That(director.IsScreenFlashActive, Is.False, "Disabled flash must not activate");
                Assert.That(director.IsCameraShaking, Is.True);
                yield return new WaitForSecondsRealtime(.35f);
                Assert.That(director.IsCameraShaking, Is.False);
                Assert.That(cameraObject.transform.localPosition, Is.EqualTo(start),
                    "Shake restores the exact camera transform");

                director.SetShakeScale(1f);
                director.SetReducedMotion(true);
                director.AttackImpact(ArenaElement.Water, Vector3.zero, ArenaImpactStrength.Strong);
                yield return null;
                Assert.That(director.IsCameraShaking, Is.False, "Reduced motion cannot shake again");
                Assert.That(cameraObject.transform.localPosition, Is.EqualTo(start));
            }
            finally
            {
                Object.Destroy(host);
                Object.Destroy(cameraObject);
            }
        }

        [UnityTest]
        public IEnumerator AudioSettingsPersistAcrossPlayerPrefsReload()
        {
            ClearPreferences();
            try
            {
                var first = ArenaAudioSettings.Load(new ArenaPlayerPrefsAudioStore());
                first.SetVolume(ArenaAudioChannel.Music, .33f);
                first.SetVolume(ArenaAudioChannel.Ambient, .42f);
                first.SetMuted(ArenaAudioChannel.Voice, true);
                first.Save();
                yield return null;
                var second = ArenaAudioSettings.Load(new ArenaPlayerPrefsAudioStore());
                Assert.That(second.GetVolume(ArenaAudioChannel.Music), Is.EqualTo(.33f).Within(.001f));
                Assert.That(second.GetVolume(ArenaAudioChannel.Ambient), Is.EqualTo(.42f).Within(.001f));
                Assert.That(second.GetVolume(ArenaAudioChannel.Sfx), Is.EqualTo(1f));
                Assert.That(second.IsMuted(ArenaAudioChannel.Voice), Is.True);
                Assert.That(second.IsMuted(ArenaAudioChannel.Music), Is.False);
                second.SetMuted(ArenaAudioChannel.Master, true);
                Assert.That(second.EffectiveLinear(ArenaAudioChannel.Sfx), Is.Zero);
                yield return null;
            }
            finally
            {
                ClearPreferences();
            }
        }
    }
}
