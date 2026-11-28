using System;
using Aetheria.PetArena.Vfx;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetheria.Tests.EditMode
{
    public sealed class ArenaPresentationKitTests
    {
        [Test]
        public void EnsureIsIdempotentAndRejectsNull()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                Assert.Throws<ArgumentNullException>(() => { ArenaPresentationKit.Ensure(null); });
                var first = ArenaPresentationKit.Ensure(host);
                var second = ArenaPresentationKit.Ensure(host);
                Assert.That(second, Is.SameAs(first));
                Assert.That(host.GetComponents<ArenaPresentationKit>().Length, Is.EqualTo(1));
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void AllSixElementsCreateBoardDecals()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                for (var index = 0; index < 6; index++)
                {
                    var element = (ArenaElement)index;
                    Assert.DoesNotThrow(() => kit.PlayElement(element, new Vector3(index, 0f, 0f)));
                }
                Assert.That(kit.ActiveDecalCount, Is.EqualTo(6));
                Assert.That(kit.BurstSystemCount, Is.EqualTo(6));
                Assert.That(host.GetComponentsInChildren<Collider>().Length, Is.Zero);
                var decals = host.GetComponentsInChildren<MeshRenderer>();
                Assert.That(decals.Length, Is.EqualTo(6));
                var materials = new System.Collections.Generic.HashSet<Material>();
                foreach (var decal in decals)
                {
                    Assert.That(decal.transform.position.y, Is.EqualTo(.06f).Within(.01f));
                    Assert.That(decal.GetComponent<Collider>(), Is.Null);
                    Assert.That(decal.transform.up, Is.EqualTo(Vector3.up));
                    Assert.That(decal.sharedMaterial, Is.Not.Null);
                    materials.Add(decal.sharedMaterial);
                }
                Assert.That(materials.Count, Is.EqualTo(6));
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void EverySfxProducesACachedClip()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                for (var index = 0; index < 8; index++)
                {
                    var sfx = (ArenaSfx)index;
                    Assert.That(kit.TryGetClip(sfx, out var first), Is.True, sfx.ToString());
                    Assert.That(first, Is.Not.Null);
                    Assert.That(first.samples, Is.GreaterThan(0));
                    Assert.That(first.frequency, Is.EqualTo(22050));
                    Assert.That(first.channels, Is.EqualTo(1));
                    Assert.That(kit.TryGetClip(sfx, out var second), Is.True);
                    Assert.That(second, Is.SameAs(first));
                    Assert.DoesNotThrow(() => kit.PlaySfx(sfx));
                }
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void BgmBattleLoopsAndNoneStops()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                Assert.That(kit.TryGetBgmClip(ArenaBgm.Lobby, out var lobby), Is.True);
                Assert.That(lobby.samples, Is.GreaterThan(0));
                Assert.That(kit.TryGetBgmClip(ArenaBgm.Battle, out var battle), Is.True);
                Assert.That(battle.samples, Is.GreaterThan(0));
                Assert.That(kit.TryGetBgmClip(ArenaBgm.None, out _), Is.False);
                kit.PlayBgm(ArenaBgm.Battle);
                Assert.That(kit.CurrentBgm, Is.EqualTo(ArenaBgm.Battle));
                Assert.That(kit.MusicLooping, Is.True);
                kit.PlayBgm(ArenaBgm.None);
                Assert.That(kit.CurrentBgm, Is.EqualTo(ArenaBgm.None));
                Assert.That(kit.MusicLooping, Is.False);
                Assert.That(kit.IsMusicPlaying, Is.False);
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void ReducedMotionKeepsFeedbackAndDoesNotThrow()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                Assert.DoesNotThrow(() => kit.SetReducedMotion(true));
                Assert.That(kit.ReducedMotion, Is.True);
                Assert.DoesNotThrow(() => kit.PlayElement(ArenaElement.Ghost, Vector3.zero));
                Assert.DoesNotThrow(() => kit.PlaySfx(ArenaSfx.UiClick));
                Assert.That(kit.TryGetClip(ArenaSfx.UiClick, out var click), Is.True);
                Assert.That(click, Is.Not.Null);
                Assert.DoesNotThrow(() => kit.SetReducedMotion(false));
                Assert.DoesNotThrow(() => kit.PlayElement(ArenaElement.Light, Vector3.one));
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void StopAllClearsTransientPresentation()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                kit.PlayElement(ArenaElement.Fire, Vector3.zero);
                kit.PlaySfx(ArenaSfx.Attack);
                kit.PlayBgm(ArenaBgm.Lobby);
                Assert.That(kit.ActiveDecalCount, Is.GreaterThan(0));
                kit.StopAll();
                Assert.That(kit.ActiveDecalCount, Is.Zero);
                Assert.That(kit.CurrentBgm, Is.EqualTo(ArenaBgm.None));
                Assert.That(kit.IsMusicPlaying, Is.False);
                Assert.That(host.GetComponentsInChildren<MeshRenderer>().Length, Is.Zero);
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void DestroyReleasesGeneratedClips()
        {
            var host = new GameObject("Arena Presentation Kit Test");
            try
            {
                var kit = ArenaPresentationKit.Ensure(host);
                Assert.That(kit.TryGetClip(ArenaSfx.Victory, out var clip), Is.True);
                Assert.That(clip, Is.Not.Null);
                Object.DestroyImmediate(host);
                Assert.That(clip == null, Is.True);
            }
            finally
            {
                if (host != null) Object.DestroyImmediate(host);
            }
        }
    }
}
