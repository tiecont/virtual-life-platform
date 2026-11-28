using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    /// <summary>Verifies the two retained development GLBs in an isolated Editor project.</summary>
    public static class CreaturePrototypeImportReview
    {
        private const string AssetDirectory =
            "Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Models";
        private static readonly string[] JointNames = { "CrestOrTail", "Head", "Root", "Spine" };
        private static readonly string[] Roles = { "Attack", "Hit", "Idle", "Skill" };

        [Serializable]
        private sealed class Report
        {
            public string classification = "DEVELOPMENT_PROTOTYPE_IMPORT";
            public string unityVersion = Application.unityVersion;
            public ModelFacts[] models;
        }

        [Serializable]
        private sealed class ModelFacts
        {
            public string id, sha256, importer, rootBone;
            public int vertices, triangles, textureSubassets;
            public string[] joints, materials, shaders;
            public ClipFacts[] clips;
        }

        [Serializable]
        private sealed class ClipFacts
        {
            public string name;
            public float seconds, maxVertexDisplacementMeters;
            public int sampleCount;
        }

        public static void Verify()
        {
            const string outputVariable = "AETHERIA_CREATURE_IMPORT_OUTPUT";
            string output = Environment.GetEnvironmentVariable(outputVariable);
            Require(Application.isBatchMode && Path.IsPathRooted(output ?? "") &&
                !Directory.Exists(output) && !File.Exists(output),
                $"Batch mode requires a new absolute evidence directory in {outputVariable}.");

            var report = new Report {
                models = new[] {
                    Review("fire-coalwhisk", "c23522796797607c1a89cc062ef63024b7b69e8b993e79d59078e735c7ce3fc2", 10272),
                    Review("cinder-terraces-warden", "b97caddd3fe76c4b38f4dcbf8156944a9ea2c7fb0be45370c971c1433cffd435", 5504),
                },
            };
            Directory.CreateDirectory(output);
            string reportPath = Path.Combine(output, "creature-prototype-import.json");
            File.WriteAllText(reportPath, JsonUtility.ToJson(report, true) + "\n");
            Debug.Log("Two retained creature prototypes passed the Unity import and deformation review.");
        }

        private static ModelFacts Review(string id, string expectedHash, int expectedTriangles)
        {
            string assetPath = $"{AssetDirectory}/{id}.glb";
            string sourcePath = Path.Combine(Path.GetDirectoryName(Application.dataPath), assetPath);
            Require(File.Exists(sourcePath), $"{id}: retained GLB is missing in the isolated review project.");
            string hash;
            using (var sha = SHA256.Create())
            using (var input = File.OpenRead(sourcePath))
                hash = BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
            Require(hash == expectedHash, $"{id}: retained source hash changed.");

            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            string importer = AssetImporter.GetAtPath(assetPath)?.GetType().FullName;
            Require(importer == "UniGLTF.GlbScriptedImporter", $"{id}: expected the pinned UniGLTF importer.");
            var source = AssetDatabase.LoadMainAssetAtPath(assetPath) as GameObject;
            Require(source != null, $"{id}: the importer produced no hierarchy.");
            var assets = AssetDatabase.LoadAllAssetsAtPath(assetPath);
            var skins = source.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            Require(skins.Length == 1 && skins[0].sharedMesh != null, $"{id}: expected one imported skin.");
            var skin = skins[0];
            var mesh = skin.sharedMesh;
            Require(skin.bones.All(bone => bone != null) && mesh.bindposes.Length == JointNames.Length, $"{id}: incomplete imported skin binding.");
            var joints = skin.bones.Select(bone => bone.name).OrderBy(name => name, StringComparer.Ordinal).ToArray();
            Require(joints.SequenceEqual(JointNames), $"{id}: imported joint names changed.");
            Require(mesh.vertexCount > 0 && mesh.subMeshCount == 3 &&
                Enumerable.Range(0, mesh.subMeshCount).All(index => mesh.GetTopology(index) == MeshTopology.Triangles),
                $"{id}: expected three triangle submeshes.");
            int triangles = Enumerable.Range(0, mesh.subMeshCount).Sum(index => checked((int)mesh.GetIndexCount(index) / 3));
            Require(triangles == expectedTriangles, $"{id}: imported triangle count changed.");

            var materials = skin.sharedMaterials;
            Require(materials.Length == mesh.subMeshCount && materials.All(material =>
                material != null && material.shader != null &&
                material.shader.name == "Universal Render Pipeline/Lit"),
                $"{id}: expected bound URP Lit materials in all imported slots.");
            var clips = assets.OfType<AnimationClip>().OrderBy(clip => clip.name, StringComparer.Ordinal).ToArray();
            Require(clips.Select(clip => clip.name).SequenceEqual(Roles.Select(role => $"{id}_{role}")),
                $"{id}: missing or unexpected combat clips.");
            return new ModelFacts {
                id = id, sha256 = hash, importer = importer, rootBone = skin.rootBone?.name ?? "",
                vertices = mesh.vertexCount, triangles = triangles,
                textureSubassets = assets.OfType<Texture2D>().Count(),
                joints = joints, materials = materials.Select(material => material.name).ToArray(),
                shaders = materials.Select(material => material.shader.name).ToArray(),
                clips = clips.Select(clip => MeasureClip(source, clip, mesh.vertexCount)).ToArray(),
            };
        }

        private static ClipFacts MeasureClip(GameObject source, AnimationClip clip, int vertices)
        {
            Require(clip.length > 0 && float.IsFinite(clip.length), $"{clip.name}: empty or invalid duration.");
            var instance = Object.Instantiate(source);
            instance.hideFlags = HideFlags.HideAndDontSave;
            var baked = new Mesh();
            try
            {
                var skin = instance.GetComponentInChildren<SkinnedMeshRenderer>(true);
                const int samples = 9;
                float maximum = 0;
                Vector3[] first = null;
                for (int sample = 0; sample < samples; sample++)
                {
                    clip.SampleAnimation(instance, clip.length * sample / (samples - 1));
                    skin.BakeMesh(baked);
                    var current = baked.vertices;
                    Require(current.Length == vertices && current.All(IsFinite),
                        $"{clip.name}: baked mesh lost vertices or contains invalid positions.");
                    if (first == null)
                        first = current;
                    else
                        for (int index = 0; index < vertices; index++)
                            maximum = Mathf.Max(maximum, Vector3.Distance(first[index], current[index]));
                }
                Require(float.IsFinite(maximum) && maximum > 0.001f, $"{clip.name}: no visible skin deformation.");
                return new ClipFacts {
                    name = clip.name, seconds = clip.length,
                    maxVertexDisplacementMeters = maximum, sampleCount = samples,
                };
            }
            finally
            {
                Object.DestroyImmediate(baked);
                Object.DestroyImmediate(instance);
            }
        }

        private static bool IsFinite(Vector3 position) =>
            float.IsFinite(position.x) && float.IsFinite(position.y) && float.IsFinite(position.z);

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
