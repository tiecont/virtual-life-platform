using System.IO;
using Aetheria.Editor;
using NUnit.Framework;
using UniVRM10;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetheria.Tests
{
    public sealed class VrmFaceCueTests
    {
        static readonly VrmFaceCueTrack.Cue[] Spoken = {
            new() { preset = "aa", start = .1f, peak = .25f, end = .5f, weight = .8f }
        };

        [Test]
        public void DesignatedIcarusIntakeRejectsAnUnboundVowel()
        {
            var source = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm");
            Assert.That(source, Is.Not.Null);
            var model = source.GetComponent<Vrm10Instance>();
            Assert.Throws<InvalidDataException>(() => VrmFaceCueTrack.Bake(model, Spoken, 1));
        }

        [Test]
        public void VoiceEnvelopeMovesOnlyTheBoundMorphAndReturnsToNeutral()
        {
            var root = new GameObject("Expression test fixture");
            var mesh = new Mesh();
            var model = root.AddComponent<Vrm10Instance>();
            var description = ScriptableObject.CreateInstance<VRM10Object>();
            var vowel = ScriptableObject.CreateInstance<VRM10Expression>();
            AnimationClip clip = null;
            try
            {
                var child = new GameObject("Test vertex");
                child.transform.SetParent(root.transform, false);
                var skin = child.AddComponent<SkinnedMeshRenderer>();
                mesh.vertices = new[] { Vector3.zero };
                mesh.AddBlendShapeFrame("Open", 100, new[] { Vector3.down * .01f }, null, null);
                skin.sharedMesh = mesh;
                vowel.MorphTargetBindings = new[] { new MorphTargetBinding { RelativePath = child.name, Index = 0, Weight = .5f } };
                description.Expression.Aa = vowel;
                model.Vrm = description;
                clip = VrmFaceCueTrack.Bake(model, Spoken, 1);
                clip.SampleAnimation(root, .175f);
                Assert.That(skin.GetBlendShapeWeight(0), Is.EqualTo(20).Within(.01f));
                clip.SampleAnimation(root, .25f);
                Assert.That(skin.GetBlendShapeWeight(0), Is.EqualTo(40).Within(.01f));
                clip.SampleAnimation(root, .8f);
                Assert.That(skin.GetBlendShapeWeight(0), Is.Zero.Within(.01f));
                vowel.MorphTargetBindings[0].Index = 1;
                Assert.Throws<InvalidDataException>(() => VrmFaceCueTrack.Bake(model, Spoken, 1));
            }
            finally
            {
                if (clip != null) Object.DestroyImmediate(clip);
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(vowel);
                Object.DestroyImmediate(description);
                Object.DestroyImmediate(mesh);
            }
        }
    }
}
