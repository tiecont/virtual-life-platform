using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Aetheria.ArtValidation
{
    // Runs only in a disposable project. It never authors clips or modifies the supplied FBX.
    public static class IcarusImportAudit
    {
        [Serializable] private sealed class ActionProfile { public string[] actions; }
        [Serializable] private sealed class TextureFact { public string path; public int width; public int height; }
        [Serializable] private sealed class LodFact
        {
            public int level, triangles, bones, materials, skinnedVertices, unweightedVertices;
            public int invalidWeights, missingBones, maximumInfluences, missingMaterials;
            public TextureFact[] textures;
        }
        [Serializable] private sealed class ClipFact
        {
            public string name, sourceClipName, motionHash;
            public float seconds;
            public int invalidBindings, transformBindings;
            public float[] lodDisplacementMeters;
        }
        [Serializable] private sealed class Facts
        {
            public string editor, urp, animationType;
            public bool imported, applyRootMotion, productionReady;
            public int lodGroups;
            public LodFact[] lods;
            public ClipFact[] clips;
            public string[] importedClipNames;
        }
        private sealed class RestPose
        {
            public Transform transform;
            public Vector3 position, scale;
            public Quaternion rotation;
            public void Restore() { transform.localPosition = position; transform.localRotation = rotation; transform.localScale = scale; }
        }

        public static void Run()
        {
            if (Application.unityVersion != "6000.3.14f1") throw new InvalidOperationException("Pinned Editor required");
            string model = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_AUDIT_MODEL");
            string output = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_AUDIT_OUTPUT");
            var actions = JsonUtility.FromJson<ActionProfile>(Environment.GetEnvironmentVariable("AETHERIA_ICARUS_AUDIT_ACTIONS"));
            if (string.IsNullOrEmpty(output) || !Path.IsPathRooted(output) || File.Exists(output))
                throw new InvalidOperationException("New absolute report path required");
            var importer = AssetImporter.GetAtPath(model) as ModelImporter;
            if (importer == null) throw new InvalidOperationException("FBX importer missing");
            importer.animationType = ModelImporterAnimationType.Generic;
            importer.importAnimation = true;
            importer.isReadable = true;
            importer.optimizeGameObjects = false;
            importer.skinWeights = ModelImporterSkinWeights.Custom;
            importer.maxBonesPerVertex = 255;
            importer.minBoneWeight = 0;
            importer.importCameras = importer.importLights = false;
            importer.SaveAndReimport();
            string textureDirectory = Path.GetDirectoryName(model) + "/EmbeddedTextures";
            Directory.CreateDirectory(textureDirectory);
            importer.ExtractTextures(textureDirectory);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            importer.SaveAndReimport();
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(model);
            if (asset == null) throw new InvalidOperationException("FBX did not import");
            var instance = UnityEngine.Object.Instantiate(asset);
            var animator = instance.GetComponent<Animator>();
            if (animator != null) { animator.applyRootMotion = false; animator.enabled = false; }
            var groups = instance.GetComponentsInChildren<LODGroup>(true);
            var allRenderers = instance.GetComponentsInChildren<Renderer>(true)
                .Where(renderer => renderer is SkinnedMeshRenderer || renderer is MeshRenderer).ToArray();
            var levels = new List<Renderer[]>();
            if (groups.Length == 1)
            {
                var lods = groups[0].GetLODs();
                var assigned = new HashSet<Renderer>(lods.SelectMany(lod => lod.renderers));
                var persistent = allRenderers.Where(renderer => !assigned.Contains(renderer));
                levels.AddRange(lods.Select(lod => lod.renderers.Concat(persistent).Where(renderer => renderer != null).Distinct().ToArray()));
            }
            else levels.Add(allRenderers);
            var transforms = instance.GetComponentsInChildren<Transform>(true);
            var rest = transforms.Select(transform => new RestPose { transform = transform,
                position = transform.localPosition, rotation = transform.localRotation, scale = transform.localScale }).ToArray();
            var clips = AssetDatabase.LoadAllAssetsAtPath(model).OfType<AnimationClip>()
                .Where(clip => !clip.name.StartsWith("__preview__", StringComparison.Ordinal)).ToArray();
            var facts = new Facts {
                editor = Application.unityVersion,
                urp = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.unity.render-pipelines.universal")?.version,
                imported = true, animationType = importer.animationType.ToString(), applyRootMotion = false,
                lodGroups = groups.Length,
                lods = levels.Select((renderers, index) => InspectLod(renderers, index)).ToArray(),
                importedClipNames = clips.Select(clip => clip.name).ToArray(),
                clips = actions.actions.SelectMany(action => clips.Where(clip => clip.name == action || clip.name.EndsWith("|" + action, StringComparison.Ordinal))
                    .Select(clip => InspectClip(instance, clip, action, levels, rest))).ToArray()
            };
            File.WriteAllText(output, JsonUtility.ToJson(facts, true) + "\n");
            UnityEngine.Object.DestroyImmediate(instance);
            Debug.Log("ICARUS_IMPORT_FACTS_WRITTEN " + output);
        }

        private static LodFact InspectLod(Renderer[] renderers, int level)
        {
            var fact = new LodFact { level = level };
            var materials = new HashSet<Material>();
            var bones = new HashSet<Transform>();
            var textures = new HashSet<Texture>();
            foreach (var renderer in renderers)
            {
                var skin = renderer as SkinnedMeshRenderer;
                var mesh = skin != null ? skin.sharedMesh : renderer.GetComponent<MeshFilter>()?.sharedMesh;
                if (mesh == null) throw new InvalidOperationException("Missing render mesh " + renderer.name);
                for (int submesh = 0; submesh < mesh.subMeshCount; submesh++)
                {
                    if (mesh.GetTopology(submesh) != MeshTopology.Triangles) throw new InvalidOperationException("Non-triangle topology " + mesh.name);
                    fact.triangles += checked((int)mesh.GetIndexCount(submesh) / 3);
                }
                foreach (var material in renderer.sharedMaterials)
                {
                    if (material == null) { fact.missingMaterials++; continue; }
                    materials.Add(material);
                    foreach (string property in material.GetTexturePropertyNames())
                    {
                        var texture = material.GetTexture(property);
                        if (texture != null) textures.Add(texture);
                    }
                }
                if (renderer.sharedMaterials.Length < mesh.subMeshCount)
                    fact.missingMaterials += mesh.subMeshCount - renderer.sharedMaterials.Length;
                if (skin == null) continue;
                foreach (var bone in skin.bones)
                {
                    if (bone == null) fact.missingBones++;
                    else bones.Add(bone);
                }
                if (mesh.bindposes.Length != skin.bones.Length) fact.missingBones++;
                fact.skinnedVertices += mesh.vertexCount;
                var counts = mesh.GetBonesPerVertex();
                var weights = mesh.GetAllBoneWeights();
                int cursor = 0;
                for (int vertex = 0; vertex < mesh.vertexCount; vertex++)
                {
                    int influences = vertex < counts.Length ? counts[vertex] : 0;
                    fact.maximumInfluences = Math.Max(fact.maximumInfluences, influences);
                    if (influences == 0) fact.unweightedVertices++;
                    float total = 0;
                    for (int influence = 0; influence < influences; influence++)
                    {
                        var weight = weights[cursor++];
                        if (float.IsNaN(weight.weight) || float.IsInfinity(weight.weight) || weight.weight <= 0 ||
                            weight.boneIndex < 0 || weight.boneIndex >= skin.bones.Length) fact.invalidWeights++;
                        total += weight.weight;
                    }
                    if (Math.Abs(total - 1) > .001f) fact.invalidWeights++;
                }
            }
            fact.materials = materials.Count;
            fact.bones = bones.Count;
            fact.textures = textures.Select(texture => new TextureFact { path = AssetDatabase.GetAssetPath(texture), width = texture.width, height = texture.height }).ToArray();
            return fact;
        }

        private static ClipFact InspectClip(GameObject instance, AnimationClip clip, string action, List<Renderer[]> levels, RestPose[] rest)
        {
            var fact = new ClipFact { name = action, sourceClipName = clip.name, seconds = clip.length, lodDisplacementMeters = new float[levels.Count] };
            foreach (var binding in AnimationUtility.GetCurveBindings(clip))
            {
                if (binding.type != typeof(Transform)) continue;
                fact.transformBindings++;
                var target = binding.path.Length == 0 ? instance.transform : instance.transform.Find(binding.path);
                if (target == null) fact.invalidBindings++;
            }
            var skins = levels.SelectMany(level => level.OfType<SkinnedMeshRenderer>()).Distinct().ToArray();
            var baseline = new Dictionary<SkinnedMeshRenderer, Vector3[]>();
            var probe = new Mesh();
            var fingerprint = new StringBuilder();
            // Restore the bind pose before every sample so missing curves cannot inherit another action.
            for (int sample = 0; sample <= 16; sample++)
            {
                foreach (var pose in rest) pose.Restore();
                clip.SampleAnimation(instance, clip.length * sample / 16f);
                foreach (var skin in skins)
                {
                    skin.BakeMesh(probe);
                    var vertices = probe.vertices;
                    if (vertices.Any(vertex => !Finite(vertex.x) || !Finite(vertex.y) || !Finite(vertex.z)))
                        throw new InvalidOperationException("Nonfinite deformation in " + clip.name);
                    if (sample == 0) baseline[skin] = vertices;
                    else
                    {
                        float delta = 0;
                        for (int vertex = 0; vertex < vertices.Length; vertex++)
                            delta = Mathf.Max(delta, skin.transform.TransformVector(vertices[vertex] - baseline[skin][vertex]).magnitude);
                        for (int lod = 0; lod < levels.Count; lod++)
                            if (levels[lod].Contains(skin)) fact.lodDisplacementMeters[lod] = Mathf.Max(fact.lodDisplacementMeters[lod], delta);
                    }
                }
                foreach (var pose in rest)
                {
                    var transform = pose.transform;
                    var position = transform.localPosition;
                    var rotation = transform.localRotation;
                    var scale = transform.localScale;
                    // Quantized transforms ignore float noise and clip names when finding renamed copies.
                    foreach (float value in new[] {position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w, scale.x, scale.y, scale.z})
                        fingerprint.Append(Math.Round(value, 5).ToString("F5", CultureInfo.InvariantCulture)).Append(',');
                }
            }
            using (var hash = SHA256.Create())
                fact.motionHash = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(fingerprint.ToString()))).Replace("-", "").ToLowerInvariant();
            UnityEngine.Object.DestroyImmediate(probe);
            foreach (var pose in rest) pose.Restore();
            return fact;
        }

        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
