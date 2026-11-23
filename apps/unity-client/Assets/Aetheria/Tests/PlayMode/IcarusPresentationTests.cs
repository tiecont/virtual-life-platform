using System.Collections;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using VirtualLife.Icarus;

namespace VirtualLife.Blockout.Tests
{
    public sealed class IcarusPresentationTests
    {
        [UnityTest]
        public IEnumerator FireZoneBuildsReadableDecalAndKeepsReducedMotionQuiet()
        {
            var root = new GameObject("Icarus FIRE_ZONE fixture");
            try
            {
                var presentation = root.AddComponent<IcarusFireZonePresentation>();
                Assert.That(IcarusFireZoneSnapshot.TryCreate(1, 40, true, 3, 4, 40, out var first), Is.True);
                Assert.That(presentation.ApplyValidatedSnapshot(first), Is.True);
                Assert.That(presentation.HasActiveZone, Is.True);
                Assert.That(presentation.ActiveColumn, Is.EqualTo(3));
                Assert.That(presentation.ActiveRow, Is.EqualTo(4));
                Assert.That(presentation.BeginSignature(IcarusSignaturePresentation.PetId,
                    IcarusSignaturePresentation.Opcode), Is.True);

                presentation.SetPresentationMode(IcarusPresentationMode.Off);
                Assert.That(presentation.BeginSignature(IcarusSignaturePresentation.PetId,
                    IcarusSignaturePresentation.Opcode), Is.False);

                presentation.SetPresentationMode(IcarusPresentationMode.Reduced);
                Assert.That(presentation.ApplyValidatedSnapshot(first), Is.False, "Duplicate revisions are ignored");
                Assert.That(IcarusFireZoneSnapshot.TryCreate(2, 41, false, 0, 0, -1, out var cleared), Is.True);
                Assert.That(presentation.ApplyValidatedSnapshot(cleared), Is.True);
                Assert.That(presentation.HasActiveZone, Is.False);
                yield return null;
            }
            finally { Object.Destroy(root); }
        }

        [UnityTest]
        public IEnumerator SignatureControlsWingsAndIdleMotion()
        {
            var root = new GameObject("Icarus presentation fixture");
            root.SetActive(false);
            try
            {
                var wings = new GameObject("Socket_Wings").transform;
                wings.SetParent(root.transform, false);
                wings.localScale = Vector3.one * 1.25f;
                var halo = new GameObject("Socket_Halo").transform;
                halo.SetParent(root.transform, false);
                halo.localPosition = Vector3.up * .2f;
                var signature = root.AddComponent<IcarusSignaturePresentation>();
                var controller = root.GetComponent<IcarusWingController>();
                const BindingFlags fields = BindingFlags.Instance | BindingFlags.NonPublic;
                typeof(IcarusWingController).GetField("wingSocket", fields).SetValue(controller, wings);
                typeof(IcarusWingController).GetField("haloSocket", fields).SetValue(controller, halo);
                root.SetActive(true);
                Assert.That(wings.gameObject.activeSelf, Is.False);
                Assert.That(signature.BeginSignature("another-pet", "FIRE_ZONE"), Is.False);
                Assert.That(signature.BeginSignature("pet-v3-fire-icarus", "NORMAL_ATTACK"), Is.False);
                Assert.That(wings.gameObject.activeSelf, Is.False);
                Assert.That(signature.BeginSignature("pet-v3-fire-icarus", "FIRE_ZONE"), Is.True);
                Assert.That(wings.gameObject.activeSelf, Is.True);
                Assert.That(wings.localScale, Is.EqualTo(Vector3.one * 1.25f));
                controller.ToggleWings();
                signature.EndSignature();
                Assert.That(wings.gameObject.activeSelf, Is.True, "Ending Signature preserves the manual selection");
                controller.ToggleWings();
                Assert.That(wings.gameObject.activeSelf, Is.False);

                controller.SetReducedMotion(false);
                Assert.That(signature.BeginSignature("pet-v3-fire-icarus", "FIRE_ZONE"), Is.True);
                Assert.That(wings.gameObject.activeSelf, Is.False, "Normal mode transitions across frames");
                yield return new WaitForSecondsRealtime(.3f);
                Assert.That(wings.localScale, Is.EqualTo(Vector3.one * 1.25f));
                Assert.That(Quaternion.Angle(halo.localRotation, Quaternion.identity), Is.GreaterThan(1));
                Assert.That(halo.localPosition.y, Is.GreaterThan(.2f));
                controller.SetReducedMotion(true);
                Assert.That(halo.localRotation, Is.EqualTo(Quaternion.identity));
                Assert.That(halo.localPosition, Is.EqualTo(Vector3.up * .2f));
                signature.enabled = false;
                Assert.That(wings.gameObject.activeSelf, Is.False, "An interrupted Signature clears its visibility request");
            }
            finally { Object.Destroy(root); }
        }
    }
}
