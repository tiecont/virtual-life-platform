using Aetheria.Pets.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace Aetheria.Tests.EditMode
{
    public sealed class PetEvolutionTests
    {
        [Test]
        public void ThresholdsApplyCumulativeIcarusVisuals()
        {
            var root = new GameObject("Icarus");
            var profile = ScriptableObject.CreateInstance<PetEvolutionProfile>();
            var original = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            var variant = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            profile.Configure(new PetEvolutionProfileValues(
                "pet-v3-fire-icarus", "pets/pet-v3-fire-icarus", "Icarus",
                "Socket_Bow", "Socket_Halo", "Socket_Wings", "Aura", "MaxVFX", variant));
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.transform.SetParent(root.transform, false);
            var bodyRenderer = body.GetComponent<Renderer>();
            bodyRenderer.sharedMaterial = original;
            var weapon = Part(root.transform, "Socket_Bow");
            var halo = Part(root.transform, "Socket_Halo");
            var wings = Part(root.transform, "Socket_Wings");
            var aura = Part(root.transform, "Aura");
            var max = Part(root.transform, "MaxVFX");
            var controller = root.AddComponent<PetEvolutionController>();
            controller.Bind(profile);
            controller.Bind(root.transform, new[] {bodyRenderer}, new[] {bodyRenderer});
            try
            {
                controller.SetLevel(1);
                Assert.That(controller.CurrentStage, Is.EqualTo(PetEvolutionStage.Base));
                Assert.That(weapon.activeSelf, Is.False);
                controller.SetLevel(20);
                Assert.That(weapon.activeSelf, Is.True);
                Assert.That(halo.activeSelf, Is.False);
                controller.SetLevel(40);
                Assert.That(halo.activeSelf, Is.True);
                Assert.That(aura.activeSelf, Is.True);
                Assert.That(bodyRenderer.sharedMaterial, Is.SameAs(variant));
                controller.SetLevel(59);
                Assert.That(wings.activeSelf, Is.False);
                controller.SetLevel(60);
                Assert.That(wings.activeSelf, Is.True);
                Assert.That(max.activeSelf, Is.True);
                controller.SetLevel(19);
                Assert.That(bodyRenderer.sharedMaterial, Is.SameAs(original));
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(profile);
                Object.DestroyImmediate(original);
                Object.DestroyImmediate(variant);
            }
        }

        private static GameObject Part(Transform parent, string name)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.name = name;
            part.transform.SetParent(parent, false);
            return part;
        }
    }
}
