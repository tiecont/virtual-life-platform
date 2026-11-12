using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace VirtualLife.Blockout.Tests
{
    public sealed class BlockoutTests
    {
        [UnityTest]
        public IEnumerator SpawnRoutesReachCafeAndArenaWithoutCrossingColliders()
        {
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            var district = Object.FindFirstObjectByType<OfflineDistrict>();
            district.InputCaptured = true;
            Assert.That(Camera.main, Is.Not.Null);
            if (!Application.isEditor) {
                Assert.That(Application.platform, Is.EqualTo(RuntimePlatform.LinuxPlayer));
                Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(UnityEngine.Rendering.GraphicsDeviceType.Null));
            }
            var spawn = BlockoutGeometry.Anchors[0];
            foreach (var id in new[] {"cafe-approach", "arena-approach"}) {
                district.Player.enabled = false;
                district.Player.transform.position = new Vector3(spawn.X, 1.1f, spawn.Z);
                district.Player.enabled = true;
                var anchor = BlockoutGeometry.Anchors.Single(item => item.Id == id);
                foreach (var point in new[] {new Vector3(anchor.X, 0, spawn.Z), new Vector3(anchor.X, 0, anchor.Z)}) {
                    var steps = 0;
                    while (steps++ < 200) {
                        var delta = point - district.Player.transform.position; delta.y = 0;
                        if (delta.magnitude < 0.12f) break;
                        district.Move(delta.normalized * Mathf.Min(1, delta.magnitude / 0.4f), 0.1f);
                        yield return null;
                    }
                    var position = district.Player.transform.position; position.y = 0;
                    Assert.That(Vector3.Distance(position, point), Is.LessThan(0.12f), "Unreachable route: " + id);
                }
                if (id == "cafe-approach") {
                    for (var step = 0; step < 30; step++) { district.Move(Vector3.forward, 0.1f); yield return null; }
                    Assert.That(district.Player.transform.position.z, Is.LessThan(5.5f), "The cafe collider must stop movement");
                }
            }
            district.Player.enabled = false;
            district.Player.transform.position = new Vector3(15.4f, 1.1f, 0);
            district.Player.enabled = true;
            for (var step = 0; step < 10; step++) { district.Move(Vector3.right, 0.1f); yield return null; }
            Assert.That(district.Player.transform.position.x, Is.EqualTo(15.5f).Within(0.02f));
            Assert.That(district.Player.GetComponent<Renderer>().sharedMaterial.shader.name, Is.EqualTo("Universal Render Pipeline/Lit"));
        }

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
