using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using VirtualLife.NativeScene;

namespace VirtualLife.Blockout.Tests
{
    public sealed class PetArenaPresentationTests
    {
        [UnityTest]
        public IEnumerator DecorativeFiguresHaveLodAndReceiptEffectsRespectReducedMotion()
        {
            var root = new GameObject("Pet presentation regression");
            var stage = root.AddComponent<PetArenaStage>();
            yield return null;
            foreach (var name in new[] {"Cinder developer figure", "Brook developer figure", "Briar developer figure"}) {
                var figure = GameObject.Find(name);
                Assert.That(figure, Is.Not.Null);
                Assert.That(figure.GetComponentsInChildren<Collider>(), Is.Empty, "Decorative pets cannot change authoritative collision");
                var lod = figure.GetComponent<LODGroup>().GetLODs();
                Assert.That(lod.Length, Is.EqualTo(2));
                Assert.That(lod[0].renderers.Length, Is.GreaterThan(lod[1].renderers.Length));
                Assert.That(lod.SelectMany(level => level.renderers).All(renderer => renderer.sharedMaterial.shader.name == "Universal Render Pipeline/Lit"), Is.True);
            }
            stage.Present(null, null, false);
            Assert.That(stage.ReceiptEventCount, Is.Zero, "Views have no committed receipt effect");
            stage.Present(null, "authenticated-receipt-a", false);
            Assert.That(stage.ReceiptEventCount, Is.EqualTo(1)); Assert.That(stage.OptionalPulseActive, Is.True);
            yield return new WaitForSecondsRealtime(.3f);
            stage.Present(null, "authenticated-receipt-a", false);
            Assert.That(stage.ReceiptEventCount, Is.EqualTo(1)); Assert.That(stage.OptionalPulseActive, Is.False, "Immutable receipt replay cannot restart FX");
            stage.Present(null, "authenticated-receipt-b", true);
            Assert.That(stage.ReceiptEventCount, Is.EqualTo(2)); Assert.That(stage.OptionalPulseActive, Is.False);
            yield return null;
            Assert.That(GameObject.Find("Cinder developer figure").transform.localScale, Is.EqualTo(Vector3.one));
            Object.Destroy(root); yield return null;
            Assert.That(GameObject.Find("Cinder developer figure"), Is.Null, "Scene disposal removes decorative actors");
        }
    }
}
