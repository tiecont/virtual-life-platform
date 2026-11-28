using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UniGLTF;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetheria.ArtValidation
{
    public static class PetWingbeatAdmission
    {
        private const string ImportPath = "Assets/Candidates/";
        private const string ClipName = "Wingbeat study";
        private const string NegativeWing = "Wing.XNegative";
        private const string PositiveWing = "Wing.XPositive";
        private const int FrameCount = 49;
        private const float FramesPerSecond = 24;
        private const float Tolerance = 0.00001f;
        private const float MinimumWingTravel = 0.05f;

        [Serializable]
        private sealed class Input
        {
            public string id, sourceSha256, wingbeatSha256;
            public int partCount, triangles, torsoPart;
            public int[] wingParts;
        }

        [Serializable]
        private sealed class Inputs
        {
            public Input[] inputs;
        }

        [Serializable]
        private sealed class Report
        {
            public string unityVersion = Application.unityVersion;
            public string importer = typeof(GlbScriptedImporter).FullName;
            public string materialShader = "Universal Render Pipeline/Lit";
            public Facts[] models;
        }

        [Serializable]
        private sealed class Facts
        {
            public string id, sourceSha256, wingbeatSha256, nativeClip;
            public int meshParts, triangles, vertices, framesMeasured, sharedPartPairs, wingToBodyPairs, textureSubassets;
            public float nativeClipSeconds, maxRestGeometryError, maxRestUvError, maxStartDelta;
            public float maxTorsoDelta, maxStaticBodyDelta, maxReturnDelta, maxCoincidentVertexGap, maxWrappedDelta;
            public float negativeWingUpstroke, positiveWingUpstroke, negativeWingDownstroke, positiveWingDownstroke;
        }

        private sealed class Part
        {
            public SkinnedMeshRenderer skin;
            public Vector3[] rest;
            public int side;
        }

        public static void Run()
        {
            string inputPath = Environment.GetEnvironmentVariable("AETHERIA_PET_WINGBEAT_INPUTS");
            string outputPath = Environment.GetEnvironmentVariable("AETHERIA_PET_WINGBEAT_FACTS");
            Require(Application.isBatchMode && Path.IsPathRooted(inputPath ?? "") &&
                Path.IsPathRooted(outputPath ?? "") && !File.Exists(outputPath),
                "The isolated batch runner requires absolute input and unused output paths.");
            var specs = JsonUtility.FromJson<Inputs>(File.ReadAllText(inputPath));
            var report = new Report { models = specs.inputs.Select(Review).ToArray() };
            File.WriteAllText(outputPath, JsonUtility.ToJson(report, true) + "\n");
        }

        private static GameObject Import(string path)
        {
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var importer = AssetImporter.GetAtPath(path) as GlbScriptedImporter;
            Require(importer != null, $"{path}: expected the project UniGLTF importer.");
            // The isolated project has no active render pipeline asset.
            importer.m_renderPipeline = ImporterRenderPipelineTypes.UniversalRenderPipeline;
            importer.SaveAndReimport();
            var source = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Require(source != null, $"{path}: no imported hierarchy.");
            return source;
        }

        private static Facts Review(Input spec)
        {
            var source = Import(ImportPath + spec.id + "-segmented-uv.glb");
            string wingbeatPath = ImportPath + spec.id + ".glb";
            var animated = Import(wingbeatPath);
            var assets = AssetDatabase.LoadAllAssetsAtPath(wingbeatPath);
            var clips = assets.OfType<AnimationClip>().ToArray();
            Require(clips.Length == 1 && clips[0].legacy && clips[0].name == ClipName &&
                clips[0].wrapMode == WrapMode.Loop && Mathf.Abs(clips[0].length - FrameCount / FramesPerSecond) < Tolerance,
                $"{spec.id}: incorrect imported legacy loop.");
            var instance = Object.Instantiate(animated);
            var baked = new Mesh();
            try
            {
                var geometry = source.GetComponentsInChildren<MeshFilter>(true).ToDictionary(filter => filter.name);
                var skins = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true).ToDictionary(skin => skin.name);
                Require(geometry.Count == spec.partCount && skins.Count == spec.partCount &&
                    instance.GetComponentsInChildren<MeshFilter>(true).Length == 0,
                    $"{spec.id}: changed mesh inventory.");
                var facts = new Facts {
                    id = spec.id, sourceSha256 = spec.sourceSha256, wingbeatSha256 = spec.wingbeatSha256,
                    nativeClip = clips[0].name, nativeClipSeconds = clips[0].length, meshParts = skins.Count,
                    textureSubassets = assets.OfType<Texture2D>().Count(),
                };
                var parts = new Part[spec.partCount];
                for (int index = 0; index < parts.Length; index++)
                {
                    string name = $"tripo_part_{index}";
                    var filter = geometry[name];
                    var skin = skins[name];
                    var rest = Bake(skin, baked);
                    var master = filter.sharedMesh.vertices.Select(filter.transform.TransformPoint).ToArray();
                    bool wing = spec.wingParts.Contains(index);
                    parts[index] = new Part { skin = skin, rest = rest, side = WingSide(skin, wing) };
                    Require(skin.sharedMaterials.Length == skin.sharedMesh.subMeshCount &&
                        skin.sharedMaterials.All(material => material != null &&
                            material.shader.name == "Universal Render Pipeline/Lit"),
                        $"{spec.id}/{name}: expected the URP/Lit fallback material.");
                    CompareRest(filter.sharedMesh, master, skin.sharedMesh, rest, facts);
                }
                Require(facts.triangles == spec.triangles && parts[spec.torsoPart].side == 0,
                    $"{spec.id}: changed triangle count or torso assignment.");
                Measure(instance, clips[0], parts, spec.torsoPart, baked, facts);
                return facts;
            }
            finally
            {
                Object.DestroyImmediate(baked);
                Object.DestroyImmediate(instance);
            }
        }

        private static int WingSide(SkinnedMeshRenderer skin, bool wing)
        {
            var bones = skin.bones.Select(bone => bone.name).ToArray();
            Require(skin.sharedMesh.bindposes.Length == 3 &&
                bones.OrderBy(name => name, StringComparer.Ordinal).SequenceEqual(new[] { "Body", NegativeWing, PositiveWing }),
                $"{skin.name}: incomplete imported skin binding.");
            int negative = Array.IndexOf(bones, NegativeWing);
            int positive = Array.IndexOf(bones, PositiveWing);
            bool hasNegative = false;
            bool hasPositive = false;
            var weights = skin.sharedMesh.boneWeights;
            Require(weights.Length == skin.sharedMesh.vertexCount, $"{skin.name}: missing vertex weights.");
            foreach (var weight in weights)
            {
                hasNegative |= UsesJoint(weight, negative);
                hasPositive |= UsesJoint(weight, positive);
            }
            Require(wing ? hasNegative != hasPositive : !hasNegative && !hasPositive,
                $"{skin.name}: wing joint weights contradict the qualified partition.");
            return hasNegative ? -1 : hasPositive ? 1 : 0;
        }

        private static bool UsesJoint(BoneWeight weight, int index) =>
            (weight.boneIndex0 == index && weight.weight0 > 0) ||
            (weight.boneIndex1 == index && weight.weight1 > 0) ||
            (weight.boneIndex2 == index && weight.weight2 > 0) ||
            (weight.boneIndex3 == index && weight.weight3 > 0);

        private static Vector3[] Bake(SkinnedMeshRenderer skin, Mesh baked)
        {
            skin.BakeMesh(baked);
            var positions = baked.vertices;
            for (int i = 0; i < positions.Length; i++) positions[i] = skin.transform.TransformPoint(positions[i]);
            Require(positions.Length == skin.sharedMesh.vertexCount && positions.All(point =>
                float.IsFinite(point.x) && float.IsFinite(point.y) && float.IsFinite(point.z)),
                $"{skin.name}: invalid baked vertex buffer.");
            return positions;
        }

        private static Vector3Int Cell(Vector3 position, float size) => new Vector3Int(
            Mathf.FloorToInt(position.x / size), Mathf.FloorToInt(position.y / size), Mathf.FloorToInt(position.z / size));

        private static void CompareRest(Mesh master, Vector3[] original, Mesh animated, Vector3[] rest, Facts facts)
        {
            var sourceUv = master.uv;
            var restUv = animated.uv;
            var sourceFaces = master.triangles;
            var restFaces = animated.triangles;
            Require(master.subMeshCount == 1 && animated.subMeshCount == 1 &&
                master.GetTopology(0) == MeshTopology.Triangles && animated.GetTopology(0) == MeshTopology.Triangles &&
                sourceUv.Length == original.Length && restUv.Length == rest.Length &&
                sourceFaces.Length == restFaces.Length && restFaces.Length > 0,
                $"{animated.name}: invalid triangle topology or UV inventory.");
            var byCenter = new Dictionary<Vector3Int, List<int>>();
            for (int i = 0; i < sourceFaces.Length; i += 3)
            {
                var center = (original[sourceFaces[i]] + original[sourceFaces[i + 1]] + original[sourceFaces[i + 2]]) / 3;
                var cell = Cell(center, Tolerance);
                if (!byCenter.TryGetValue(cell, out var faces)) byCenter[cell] = faces = new List<int>();
                faces.Add(i);
            }
            for (int i = 0; i < restFaces.Length; i += 3)
            {
                var center = (rest[restFaces[i]] + rest[restFaces[i + 1]] + rest[restFaces[i + 2]]) / 3;
                var key = Cell(center, Tolerance);
                bool found = false;
                for (int x = -1; x <= 1 && !found; x++)
                for (int y = -1; y <= 1 && !found; y++)
                for (int z = -1; z <= 1 && !found; z++)
                {
                    if (!byCenter.TryGetValue(key + new Vector3Int(x, y, z), out var candidates)) continue;
                    for (int j = 0; j < candidates.Count && !found; j++)
                    for (int shift = 0; shift < 3 && !found; shift++)
                    {
                        // Cyclic reindexing preserves corner UVs and oriented face winding.
                        float position = 0, uv = 0;
                        for (int corner = 0; corner < 3; corner++)
                        {
                            int left = sourceFaces[candidates[j] + (corner + shift) % 3];
                            int right = restFaces[i + corner];
                            position = Mathf.Max(position, Vector3.Distance(original[left], rest[right]));
                            uv = Mathf.Max(uv, Vector2.Distance(sourceUv[left], restUv[right]));
                        }
                        if (!(position <= Tolerance && uv <= Tolerance)) continue;
                        facts.maxRestGeometryError = Mathf.Max(facts.maxRestGeometryError, position);
                        facts.maxRestUvError = Mathf.Max(facts.maxRestUvError, uv);
                        candidates.RemoveAt(j);
                        found = true;
                    }
                }
                Require(found, $"{animated.name}: no oriented rest triangle with matching UVs at {center}.");
            }
            facts.triangles += restFaces.Length / 3;
            facts.vertices += rest.Length;
        }

        private static List<(int partA, int indexA, int partB, int indexB)> SharedVertices(Part[] parts, Facts facts)
        {
            var byPosition = new Dictionary<Vector3Int, List<(int part, int index)>>();
            var pairs = new List<(int, int, int, int)>();
            for (int part = 0; part < parts.Length; part++)
            for (int index = 0; index < parts[part].rest.Length; index++)
            {
                var p = parts[part].rest[index];
                // Match cross-part vertices within one micrometre, including across cell boundaries.
                const float seamTolerance = 0.000001f;
                var key = Cell(p, seamTolerance);
                for (int x = -1; x <= 1; x++)
                for (int y = -1; y <= 1; y++)
                for (int z = -1; z <= 1; z++)
                {
                    if (!byPosition.TryGetValue(key + new Vector3Int(x, y, z), out var nearby)) continue;
                    foreach (var vertex in nearby)
                    {
                        if (vertex.part == part || Vector3.Distance(p, parts[vertex.part].rest[vertex.index]) > seamTolerance)
                            continue;
                        pairs.Add((vertex.part, vertex.index, part, index));
                        if ((parts[vertex.part].side == 0) != (parts[part].side == 0)) facts.wingToBodyPairs++;
                    }
                }
                if (!byPosition.TryGetValue(key, out var vertices))
                    byPosition[key] = vertices = new List<(int, int)>();
                vertices.Add((part, index));
            }
            facts.sharedPartPairs = pairs.Count;
            Require(facts.wingToBodyPairs > 0, $"{facts.id}: no imported wing-to-body seam vertices.");
            return pairs;
        }

        private static void Measure(GameObject instance, AnimationClip clip, Part[] parts, int torso, Mesh baked, Facts facts)
        {
            var animation = instance.GetComponent<Animation>();
            Require(animation != null && animation.GetClipCount() == 1 && animation.clip == clip &&
                animation[ClipName] != null, $"{facts.id}: imported native Animation component lost its loop.");
            var state = animation[ClipName];
            state.enabled = true;
            state.weight = 1;
            state.wrapMode = WrapMode.ClampForever;
            var seams = SharedVertices(parts, facts);
            Vector3[][] referenceUpstroke = null;
            for (int frame = 1; frame <= FrameCount; frame++)
            {
                // The GLB sampler starts at 1/24, with the final sample at 49/24.
                state.time = frame / FramesPerSecond;
                animation.Sample();
                var sampled = parts.Select(part => Bake(part.skin, baked)).ToArray();
                for (int index = 0; index < parts.Length; index++)
                {
                    float delta = MaxDelta(parts[index].rest, sampled[index]);
                    if (frame == 1) facts.maxStartDelta = Mathf.Max(facts.maxStartDelta, delta);
                    if (frame == 25 || frame == FrameCount) facts.maxReturnDelta = Mathf.Max(facts.maxReturnDelta, delta);
                    if (index == torso) facts.maxTorsoDelta = Mathf.Max(facts.maxTorsoDelta, delta);
                    int side = parts[index].side;
                    if (side == 0) facts.maxStaticBodyDelta = Mathf.Max(facts.maxStaticBodyDelta, delta);
                    if (side < 0 && frame == 13) facts.negativeWingUpstroke = Mathf.Max(facts.negativeWingUpstroke, delta);
                    if (side > 0 && frame == 13) facts.positiveWingUpstroke = Mathf.Max(facts.positiveWingUpstroke, delta);
                    if (side < 0 && frame == 37) facts.negativeWingDownstroke = Mathf.Max(facts.negativeWingDownstroke, delta);
                    if (side > 0 && frame == 37) facts.positiveWingDownstroke = Mathf.Max(facts.positiveWingDownstroke, delta);
                }
                foreach (var seam in seams)
                    facts.maxCoincidentVertexGap = Mathf.Max(facts.maxCoincidentVertexGap,
                        Vector3.Distance(sampled[seam.partA][seam.indexA], sampled[seam.partB][seam.indexB]));
                if (frame == 13) referenceUpstroke = sampled;
                facts.framesMeasured++;
            }
            state.wrapMode = WrapMode.Loop;
            state.time = clip.length + 13 / FramesPerSecond;
            animation.Sample();
            for (int index = 0; index < parts.Length; index++)
                facts.maxWrappedDelta = Mathf.Max(facts.maxWrappedDelta, MaxDelta(referenceUpstroke[index], Bake(parts[index].skin, baked)));
            Require(new[] { facts.maxStartDelta, facts.maxTorsoDelta, facts.maxStaticBodyDelta, facts.maxReturnDelta,
                facts.maxCoincidentVertexGap, facts.maxWrappedDelta }.All(delta => delta <= Tolerance),
                $"{facts.id}: rest, torso, seam or wrapped playback exceeded tolerance. {JsonUtility.ToJson(facts)}");
            Require(new[] { facts.negativeWingUpstroke, facts.positiveWingUpstroke,
                facts.negativeWingDownstroke, facts.positiveWingDownstroke }.All(delta => delta >= MinimumWingTravel),
                $"{facts.id}: insufficient baked travel on either side of the flap. {JsonUtility.ToJson(facts)}");
        }

        private static float MaxDelta(Vector3[] reference, Vector3[] sample)
        {
            float maximum = 0;
            for (int i = 0; i < reference.Length; i++)
                maximum = Mathf.Max(maximum, Vector3.Distance(reference[i], sample[i]));
            return maximum;
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
