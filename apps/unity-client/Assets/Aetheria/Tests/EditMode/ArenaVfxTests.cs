using System;
using Aetheria.PetArena.Vfx;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using Object = UnityEngine.Object;

namespace Aetheria.Tests.EditMode
{
    public sealed class ArenaVfxTests
    {
        private const string MixerPath =
            "Assets/Aetheria/Features/PetArena/Vfx/Audio/AetheriaArenaMixer.mixer";
        private const string LibraryPath =
            "Assets/Aetheria/Features/PetArena/Vfx/Audio/ArenaAudioLibrary.asset";

        [Test]
        public void SixElementBurstsBoardFeedbackAndFireZoneArePooled()
        {
            var host = new GameObject("Arena vfx pool test");
            try
            {
                Assert.Throws<ArgumentNullException>(() => ArenaVfxDirector.Ensure(null));
                var director = ArenaVfxDirector.Ensure(host);
                Assert.That(ArenaVfxDirector.Ensure(host), Is.SameAs(director));
                for (var index = 0; index < 6; index++)
                    director.PlayElement((ArenaElement)index, new Vector3(index, 0f, 0f));
                Assert.That(director.ActiveDecalCount, Is.EqualTo(6));
                Assert.That(director.BurstSystemCount, Is.EqualTo(6));
                for (var index = 0; index < 5; index++)
                    director.TileSelected(new Vector3(index, 0f, 1f));
                Assert.That(director.ActiveTileFeedbackCount, Is.EqualTo(5));
                director.TileMatch(ArenaElement.Ground, new Vector3(2f, 0f, 2f));
                Assert.That(director.ActiveDecalCount, Is.EqualTo(7));
                director.InvalidSwap(new Vector3(3f, 0f, 3f));
                director.Cascade(new Vector3(4f, 0f, 4f), 3);
                Assert.That(director.ActiveTileFeedbackCount, Is.EqualTo(10));
                var cells = director.FireZone(new Vector3(4f, 0f, 4f), 1f, 4);
                Assert.That(cells, Is.EqualTo(16));
                Assert.That(director.IsFireZoneActive, Is.True);
                Assert.That(director.FireZoneCellCount, Is.EqualTo(16));
                var renderers = host.GetComponentsInChildren<MeshRenderer>();
                Assert.That(renderers.Length, Is.GreaterThanOrEqualTo(6 + 6 + 16));
                Assert.That(host.GetComponentsInChildren<Collider>().Length, Is.Zero,
                    "Presentation VFX cannot add gameplay colliders");
                director.HideFireZone();
                Assert.That(director.IsFireZoneActive, Is.False);
                Assert.That(director.FireZoneCellCount, Is.Zero);
                director.Clear();
                Assert.That(director.ActiveDecalCount, Is.Zero);
                Assert.That(director.ActiveTileFeedbackCount, Is.Zero);
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
            Assert.That(GameObject.Find("Board Feedback"), Is.Null, "Disposal removes pooled VFX");
            Assert.That(GameObject.Find("Icarus Fire Zone"), Is.Null);
        }

        [Test]
        public void FlashShakeAndReducedMotionAreExplicitControls()
        {
            var host = new GameObject("Arena vfx comfort test");
            var cameraObject = new GameObject("Arena vfx test camera") {tag = "MainCamera"};
            var camera = cameraObject.AddComponent<Camera>();
            var start = cameraObject.transform.localPosition;
            try
            {
                var director = ArenaVfxDirector.Ensure(host);
                director.BindCamera(camera);
                director.SetReducedMotion(true);
                director.SetFlashEnabled(true);
                Assert.That(director.ReducedMotion, Is.True);
                Assert.That(director.FlashEnabled, Is.True);
                director.AttackImpact(ArenaElement.Fire, Vector3.zero, ArenaImpactStrength.Strong);
                Assert.That(director.IsScreenFlashActive, Is.True, "Flash stays available under reduced motion");
                Assert.That(director.IsCameraShaking, Is.False, "Reduced motion suppresses camera shake");
                director.Tick(.5f);
                Assert.That(director.IsScreenFlashActive, Is.False);
                Assert.That(cameraObject.transform.localPosition, Is.EqualTo(start));

                director.SetReducedMotion(false);
                director.SetShakeScale(1f);
                director.SetFlashEnabled(false);
                Assert.That(director.FlashEnabled, Is.False);
                director.AttackImpact(ArenaElement.Fire, Vector3.zero, ArenaImpactStrength.Strong);
                Assert.That(director.IsScreenFlashActive, Is.False, "Disabled flash must not activate");
                Assert.That(director.IsCameraShaking, Is.True);
                director.Tick(.05f);
                Assert.That(cameraObject.transform.localPosition, Is.Not.EqualTo(start),
                    "Shake moves the camera while active");
                director.Tick(.5f);
                Assert.That(director.IsCameraShaking, Is.False);
                Assert.That(cameraObject.transform.localPosition, Is.EqualTo(start),
                    "Shake restores the exact camera transform");

                director.SetShakeScale(0f);
                director.AttackImpact(ArenaElement.Water, Vector3.zero, ArenaImpactStrength.Strong);
                Assert.That(director.IsCameraShaking, Is.False, "Zero shake scale disables shake");
            }
            finally
            {
                Object.DestroyImmediate(host);
                Object.DestroyImmediate(cameraObject);
            }
        }

        [Test]
        public void BridgeRaisesPresentationEventsWithoutGameplayAuthority()
        {
            var host = new GameObject("Arena bridge test");
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            try
            {
                var audio = host.AddComponent<ArenaAudioDirector>();
                var audioSerialized = new SerializedObject(audio);
                audioSerialized.FindProperty("persistSettings").boolValue = false;
                audioSerialized.ApplyModifiedPropertiesWithoutUndo();
                audio.SetMixer(mixer);
                audio.SetLibrary(library);
                var vfx = host.AddComponent<ArenaVfxDirector>();
                var bridge = host.AddComponent<ArenaPresentationBridge>();
                bridge.Configure(audio, vfx, true, true, .35f);
                Assert.That(bridge.HasWiredAudio, Is.True);
                Assert.That(bridge.HasWiredVfx, Is.True);

                bridge.EnterHub(ArenaHub.CinderTerraces);
                Assert.That(audio.Ambience, Is.EqualTo(ArenaAmbience.Fire));
                Assert.That(audio.AmbienceSource.clip, Is.Not.Null);
                bridge.EnterHub(ArenaHub.TideglassLagoon);
                Assert.That(audio.Ambience, Is.EqualTo(ArenaAmbience.Water));
                bridge.EnterHub(ArenaHub.Plaza);
                Assert.That(audio.Ambience, Is.EqualTo(ArenaAmbience.Plaza));

                bridge.BeginCombat(ArenaCombatScore.Regular);
                Assert.That(audio.Score, Is.EqualTo(ArenaCombatScore.Regular));
                bridge.BeginBossEncounter(ArenaCombatScore.None);
                Assert.That(audio.Score, Is.EqualTo(ArenaCombatScore.Boss));
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.BossWarning));

                var tileFeedbackBefore = vfx.ActiveTileFeedbackCount;
                bridge.NotifyTileSelected(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.TileSelect));
                Assert.That(vfx.ActiveTileFeedbackCount, Is.EqualTo(tileFeedbackBefore + 1));
                bridge.NotifyTileMatch(ArenaElement.Ground, Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.ElementGround),
                    "The elemental sting follows the match cue");
                Assert.That(vfx.ActiveDecalCount, Is.EqualTo(1));
                bridge.NotifyInvalidSwap(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.TileInvalid));
                bridge.NotifyCascade(Vector3.zero, 2);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Cascade));
                bridge.NotifyAttack(ArenaElement.Fire, Vector3.zero, ArenaImpactStrength.Strong);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.ElementFire));
                bridge.NotifyGuard(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Guard));
                bridge.NotifyShieldBreak(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.ShieldBreak));
                Assert.That(bridge.NotifyFireZone(Vector3.zero, 1f), Is.EqualTo(16));
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.FireZone));
                bridge.HideFireZone();
                Assert.That(vfx.IsFireZoneActive, Is.False);

                bridge.NotifyArtifactEquipped(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.ArtifactEquip));
                bridge.NotifyArtifactUpgraded(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Reward));
                bridge.NotifyVictory(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Victory));
                bridge.NotifyDefeat(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Defeat));
                bridge.NotifyRecruitment(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Reward));
                bridge.NotifyReward(Vector3.zero);
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.Reward));
                bridge.NotifyUiClick();
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.UiClick));
                bridge.NotifyUiBack();
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.UiBack));
                bridge.NotifyUiConfirm();
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.UiConfirm));
                bridge.NotifyAnnouncerPrompt();
                Assert.That(audio.LastCue, Is.EqualTo(ArenaAudioCue.AnnouncerPrompt));
                Assert.That(audio.LastChannel, Is.EqualTo(ArenaAudioChannel.Voice));

                bridge.SetChannelMuted(ArenaAudioChannel.Ui, true);
                Assert.That(audio.Settings.IsMuted(ArenaAudioChannel.Ui), Is.True);
                Assert.That(host.GetComponentsInChildren<Collider>().Length, Is.Zero);
            }
            finally
            {
                Object.DestroyImmediate(host);
                ArenaAudioMixerRouter.Apply(mixer, ArenaAudioSettings.CreateTransient());
            }
        }
    }
}
