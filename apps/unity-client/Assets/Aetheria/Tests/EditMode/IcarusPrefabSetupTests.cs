using System;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Aetheria.Icarus;
using Object = UnityEngine.Object;

namespace Aetheria.Editor.Tests
{
    public sealed class IcarusPrefabSetupTests
    {
        private static readonly string[] IcarusActions = {
            "idle", "world_walk_or_hover", "world_follow", "emote", "summon",
            "normal_sword_hit", "rage_sword_100", "signature_skill_windup",
            "signature_skill_cast", "ultimate_cut_in", "ultimate_impact",
            "damage_reaction", "defend", "status_affected", "victory", "defeat"
        };

        [Test]
        public void FireZoneSnapshotRequiresBoundedAuthoritativeShape()
        {
            Assert.That(IcarusActions, Has.Length.EqualTo(16));
            Assert.That(IcarusFireZoneSnapshot.TryCreate(1, 40, true, 6, 0, 40, out var edge), Is.True);
            Assert.That(edge.Contains(9, 3), Is.True);
            Assert.That(edge.Contains(5, 0), Is.False);
            Assert.That(IcarusFireZoneSnapshot.TryCreate(2, 41, true, 7, 0, 40, out _), Is.False);
            Assert.That(IcarusFireZoneSnapshot.TryCreate(3, 42, true, 0, 0, 40, out _), Is.False);
            Assert.That(IcarusFireZoneSnapshot.TryCreate(4, 39, true, 0, 0, 40, out _), Is.False);
            Assert.That(IcarusFireZoneSnapshot.TryCreate(5, 42, false, 0, 0, -1, out var cleared), Is.True);
            Assert.That(cleared.HasZone, Is.False);
        }

        [Test]
        public void ReviewedPrefabContainsVerifiedTripoModularAccessories()
        {
            GameObject prefab = PrefabUtility.LoadPrefabContents(IcarusPrefabSetupEditor.PrefabPath);
            try
            {
                Transform wingsSocket = prefab.GetComponentsInChildren<Transform>(true)
                    .Single(node => node.name == "Socket_Wings");
                Transform bowSocket = prefab.GetComponentsInChildren<Transform>(true)
                    .Single(node => node.name == "Socket_Bow");
                Transform wings = wingsSocket.Find("Icarus_Wings");
                Transform bow = bowSocket.Find("Icarus_Bow");

                Assert.That(wings, Is.Not.Null);
                Assert.That(bow, Is.Not.Null);
                Assert.That(wingsSocket.gameObject.activeSelf, Is.False, "Wings must default OFF.");
                Assert.That(TriangleCount(wings.gameObject), Is.EqualTo(26133));
                Assert.That(TriangleCount(bow.gameObject), Is.EqualTo(10489));
                AssertTexturedMaterials(wings.GetComponentsInChildren<Renderer>(true), "Universal Render Pipeline/Lit");
                AssertTexturedMaterials(bow.GetComponentsInChildren<Renderer>(true), "Universal Render Pipeline/Lit");

                var face = prefab.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                    .Single(renderer => Array.Exists(renderer.sharedMaterials, material => material != null && material.name == "Material_head"));
                AssertTexturedMaterials(new[] { face }, "VRM10/Universal Render Pipeline/MToon10");

                Transform top = bowSocket.Find("Socket_BowString_Top");
                Transform bottom = bowSocket.Find("Socket_BowString_Bottom");
                Assert.That(top.localPosition.y, Is.EqualTo(.55f).Within(.0001f));
                Assert.That(bottom.localPosition.y, Is.EqualTo(-.55f).Within(.0001f));
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(prefab);
            }
        }

        [Test]
        public void SavesAndReopensGenericPrefabWithoutRewritingTheSourceOrExistingSockets()
        {
            string leaf = "IcarusFixture-" + Guid.NewGuid().ToString("N");
            string folder = "Assets/" + leaf;
            string output = folder + "/Icarus.prefab";
            AssetDatabase.CreateFolder("Assets", leaf);
            var root = new GameObject("TestGeneric");
            try
            {
                var skeleton = Add(root.transform, "Rig");
                var chest = Add(skeleton, "UpperChest");
                chest.localRotation = Quaternion.Euler(0, 30, 0);
                Add(chest, "Head");
                Add(chest, "hand.R");
                Avatar avatar = AvatarBuilder.BuildGenericAvatar(root, "Rig");
                Assert.That(avatar.isValid && !avatar.isHuman, Is.True);
                AssetDatabase.CreateAsset(avatar, folder + "/TestAvatar.asset");
                root.AddComponent<Animator>().avatar = avatar;
                var source = PrefabUtility.SaveAsPrefabAsset(root, folder + "/Source.prefab");
                Build(source, output);
                string guid = AssetDatabase.AssetPathToGUID(output);
                Assert.That(guid, Is.Not.Empty);
                Assert.That(source.GetComponentsInChildren<Transform>(true).Any(t => t.name.StartsWith("Socket_")), Is.False);

                GameObject model = PrefabUtility.LoadPrefabContents(output);
                Vector3 fit;
                try
                {
                    var nodes = model.GetComponentsInChildren<Transform>(true).ToDictionary(t => t.name);
                    var wings = nodes["Socket_Wings"];
                    Assert.That(wings.parent, Is.EqualTo(nodes["UpperChest"]));
                    Assert.That(wings.gameObject.activeSelf, Is.False);
                    Assert.That(model.transform.InverseTransformVector(wings.position - wings.parent.position).z,
                        Is.EqualTo(-.10f).Within(.001));
                    var left = model.transform.InverseTransformDirection(nodes["Socket_Wing_L"].forward);
                    var right = model.transform.InverseTransformDirection(nodes["Socket_Wing_R"].forward);
                    Assert.That(left.x, Is.LessThan(-.5f));
                    Assert.That(right.x, Is.GreaterThan(.5f));
                    Assert.That(left.z, Is.LessThan(-.5f));
                    Assert.That(right.z, Is.LessThan(-.5f));
                    Assert.That(nodes["Socket_Halo"].parent, Is.EqualTo(nodes["Head"]));
                    Assert.That(nodes["Socket_Bow"].parent, Is.EqualTo(nodes["hand.R"]));
                    Assert.That(model.GetComponent<IcarusSignaturePresentation>(), Is.Not.Null);
                    Assert.That(model.GetComponent<IcarusFireZonePresentation>(), Is.Not.Null);
                    fit = wings.localPosition + Vector3.up * .01f;
                    wings.localPosition = fit;
                    PrefabUtility.SaveAsPrefabAsset(model, output);
                }
                finally { PrefabUtility.UnloadPrefabContents(model); }
                var existing = AssetDatabase.LoadAssetAtPath<GameObject>(output);
                Build(existing, output);
                Assert.That(AssetDatabase.AssetPathToGUID(output), Is.EqualTo(guid));
                var updated = AssetDatabase.LoadAssetAtPath<GameObject>(output);
                var updatedWings = updated.GetComponentsInChildren<Transform>(true).Single(t => t.name == "Socket_Wings");
                Assert.That((updatedWings.localPosition - fit).sqrMagnitude, Is.LessThan(1e-8f));
            }
            finally
            {
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        private static Transform Add(Transform parent, string name)
        {
            var node = new GameObject(name).transform;
            node.SetParent(parent, false);
            return node;
        }

        private static int TriangleCount(GameObject root) =>
            root.GetComponentsInChildren<MeshFilter>(true)
                .Where(filter => filter.sharedMesh != null)
                .Sum(filter => filter.sharedMesh.triangles.Length / 3) +
            root.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                .Where(renderer => renderer.sharedMesh != null)
                .Sum(renderer => renderer.sharedMesh.triangles.Length / 3);

        private static void AssertTexturedMaterials(Renderer[] renderers, string shader)
        {
            var materials = renderers.SelectMany(renderer => renderer.sharedMaterials).Distinct().ToArray();
            Assert.That(materials, Is.Not.Empty);
            foreach (var material in materials)
            {
                Assert.That(material, Is.Not.Null);
                Assert.That(material.shader.name, Is.EqualTo(shader));
                Assert.That(material.mainTexture, Is.Not.Null);
                Assert.That(material.mainTexture.width, Is.EqualTo(4096));
                Assert.That(material.mainTexture.height, Is.EqualTo(4096));
            }
        }

        private static void Build(GameObject source, string output) =>
            typeof(IcarusPrefabSetupEditor).GetMethod("Build", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { source, output });
    }
}
