using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace VirtualLife.Blockout.Tests
{
    public sealed class BlockoutTests
    {
        [UnityTest]
        public IEnumerator SceneSpawnsMovesAndInteracts()
        {
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            var district = Object.FindFirstObjectByType<OfflineDistrict>();
            Assert.That(district.Player, Is.Not.Null);
            Assert.That(district.TryInteract(), Is.False);
            var before = district.Player.transform.position;
            district.Move(Vector3.forward, 0.1f);
            Assert.That(district.Player.transform.position.z, Is.GreaterThan(before.z));
            district.Player.enabled = false;
            district.Player.transform.position = new Vector3(0, 1.1f, 1);
            district.Player.enabled = true;
            Assert.That(district.TryInteract(), Is.True);
            Assert.That(district.RehearsalTurns, Is.EqualTo(1));
            var nativeRequests = 0;
            district.NativeInteraction = () => nativeRequests++;
            Assert.That(district.TryInteract(), Is.True);
            Assert.That(nativeRequests, Is.EqualTo(1));
            Assert.That(district.RehearsalTurns, Is.EqualTo(1), "Native mode must not fabricate a local turn");
            district.NativeInteraction = null;
        }
    }
}
