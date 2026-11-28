using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UniVRM10;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.Timeline;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    public static class IcarusCharakuruMotionReview
    {
        private const string VrmPath = "Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm";
        private const string VrmSha256 = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a";
        private static readonly float[] ReviewSamples = { .1f, .35f, .6f, .85f };

        // Runs only against temporary scene objects and assets. The checked-in
        // prefab keeps its existing Generic Icarus review import contract.
        public static void Verify()
        {
            const string motionVariable = "AETHERIA_ICARUS_REVIEW_MOTION";
            const string outputVariable = "AETHERIA_ICARUS_REVIEW_OUTPUT";
            string source = Environment.GetEnvironmentVariable(motionVariable);
            string output = Environment.GetEnvironmentVariable(outputVariable);
            if (!Application.isBatchMode || !Path.IsPathRooted(source ?? "") ||
                !File.Exists(source) || !source.EndsWith(".vrma", StringComparison.OrdinalIgnoreCase) ||
                !Path.IsPathRooted(output ?? "") || Directory.Exists(output) || File.Exists(output))
                throw new InvalidOperationException($"Batch mode requires a local VRMA in {motionVariable} and a new absolute review directory in {outputVariable}.");

            string sourceVrmFile = Path.Combine(Path.GetDirectoryName(Application.dataPath), VrmPath);
            Require(Hash(sourceVrmFile) == VrmSha256, "The owner-designated Icarus VRM has changed.");
            Directory.CreateDirectory(output);
            IcarusPrefabSetupEditor.RecoverReviewImports();
            var originalScene = SceneManager.GetActiveScene();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            string leaf = "IcarusMotionReview-" + Guid.NewGuid().ToString("N");
            string folder = "Assets/" + leaf;
            PlayableDirector director = null;
            try
            {
                AssetDatabase.CreateFolder("Assets", leaf);
                string inputPath = folder + "/CharakuruWalk.vrma";
                File.Copy(source, Path.Combine(Application.dataPath, leaf, "CharakuruWalk.vrma"));
                AssetDatabase.ImportAsset(inputPath, ImportAssetOptions.ForceSynchronousImport);
                var importedObject = AssetDatabase.LoadAssetAtPath<GameObject>(inputPath);
                var vrmObject = AssetDatabase.LoadAssetAtPath<GameObject>(VrmPath);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(IcarusPrefabSetupEditor.PrefabPath);
                Require(importedObject != null && vrmObject != null && prefab != null, "VRMA, VRM or modular Icarus prefab failed to import.");
                Require(AssetDatabase.GetDependencies(IcarusPrefabSetupEditor.PrefabPath).Contains(VrmPath),
                    "Modular Icarus does not depend on the selected owner baseline VRM.");

                var motionSource = (GameObject)PrefabUtility.InstantiatePrefab(importedObject, scene);
                var model = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                var sourceAnimator = motionSource.GetComponentInChildren<Animator>(true);
                var motion = motionSource.GetComponentInChildren<Animation>(true)?.clip;
                var modelAnimator = model.GetComponentsInChildren<Animator>(true).Single();
                var modelVrm = model.GetComponentInChildren<Vrm10Instance>(true);
                var humanAvatar = vrmObject.GetComponentsInChildren<Animator>(true).Single().avatar;
                var genericAvatar = modelAnimator.avatar;
                Require(motion != null && motion.length > 0, "Imported VRMA has no positive-duration motion clip.");
                Require(sourceAnimator != null && sourceAnimator.avatar != null && sourceAnimator.avatar.isHuman &&
                    sourceAnimator.avatar.isValid && humanAvatar != null && humanAvatar.isHuman && humanAvatar.isValid,
                    "The original VRMA and VRM require valid mapped Humanoid avatars.");
                Require(modelVrm != null && genericAvatar != null && genericAvatar.isValid && !genericAvatar.isHuman,
                    "The modular review instance requires its original valid Generic Avatar.");
                modelAnimator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                modelAnimator.runtimeAnimatorController = null;
                sourceAnimator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

                var bones = new List<(HumanBodyBones Kind, Transform Joint)>();
                for (int index = 0; index < (int)HumanBodyBones.LastBone; index++)
                {
                    var kind = (HumanBodyBones)index;
                    if (modelVrm.TryGetBoneTransform(kind, out var joint)) bones.Add((kind, joint));
                }
                Require(bones.Count >= 20, "Modular Icarus is missing its VRM-mapped bones.");
                var hips = bones.Single(bone => bone.Kind == HumanBodyBones.Hips).Joint;
                var bound = BakeMotion(motion, sourceAnimator, modelAnimator, humanAvatar, genericAvatar,
                    bones.Select(bone => bone.Joint).ToArray(), hips);
                AssetDatabase.CreateAsset(bound, folder + "/CharakuruWalkRetargeted.anim");
                AssetDatabase.SaveAssetIfDirty(bound);
                Object.DestroyImmediate(motionSource);

                var skins = model.GetComponentsInChildren<SkinnedMeshRenderer>(false)
                    .Where(renderer => renderer.enabled && renderer.sharedMesh != null).ToArray();
                Require(skins.Length > 0 && skins.All(renderer => renderer.bones.Length > 0),
                    "Imported Icarus has no active skinned mesh.");

                director = CinematicStudio.CreateBoundTimeline(modelAnimator, bound,
                    CinematicStudio.Sequence.CharacterIntro, folder + "/CharakuruWalkReview.playable");
                var track = ((TimelineAsset)director.playableAsset).GetOutputTracks().OfType<AnimationTrack>().Single();
                var take = track.GetClips().Single();
                Require(director.GetGenericBinding(track) == modelAnimator && take.animationClip == bound && !director.playOnAwake,
                    "Cinematic Studio did not bind the retargeted motion to the actual Icarus instance.");
                var review = Sample(director, take.start, bound.length, bones.Select(bone => bone.Joint).ToArray(), skins);
                Require(review.maxMappedJointAngleDegrees > 1f && review.maxSkinnedVertexDelta > .001f,
                    $"The Timeline must move mapped joints and deform the actual skin. Joint degrees {review.maxMappedJointAngleDegrees}, mesh delta {review.maxSkinnedVertexDelta}.");
                review.modelSha256 = VrmSha256;
                review.sourceMotionSha256 = Hash(source);
                review.sourceMotionFile = Path.GetFileName(source);
                review.sourceMotionClip = motion.name;
                review.clipSeconds = motion.length;
                review.mappedHumanoidBones = bones.Count;
                review.skinnedMeshes = skins.Length;
                review.editorVersion = Application.unityVersion;
                review.productionReady = false;
                review.graphicsDevice = SystemInfo.graphicsDeviceType.ToString();
                if (SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null)
                    review.frames = Capture(director, take.start, bound.length, skins, output);
                File.WriteAllText(Path.Combine(output, "icarus-motion-review.json"), JsonUtility.ToJson(review, true) + "\n");
                Debug.Log($"Charakuru Icarus motion verified on Timeline. {review.mappedHumanoidBones} mapped bones, " +
                    $"{review.maxMappedJointAngleDegrees:F2}° joint motion, {review.maxSkinnedVertexDelta:F4} m skin movement.");
            }
            finally
            {
                if (director != null)
                {
                    director.Stop();
                    Undo.ClearUndo(director.gameObject);
                }
                EditorSceneManager.CloseScene(scene, true);
                if (originalScene.IsValid() && originalScene.isLoaded) SceneManager.SetActiveScene(originalScene);
                if (AssetDatabase.IsValidFolder(folder)) AssetDatabase.DeleteAsset(folder);
            }
        }

        private static AnimationClip BakeMotion(AnimationClip source, Animator sourceAnimator, Animator targetAnimator,
            Avatar human, Avatar generic, Transform[] joints, Transform hips)
        {
            const int sampleRate = 30;
            int segments = Mathf.CeilToInt(source.length * sampleRate);
            var rotations = joints.Select(_ => new Quaternion[segments + 1]).ToArray();
            var positions = new Vector3[segments + 1];
            var rest = joints.Select(joint => joint.localRotation).ToArray();
            Vector3 restHips = hips.localPosition;
            Vector3 restRoot = targetAnimator.transform.localPosition;
            Quaternion restRootRotation = targetAnimator.transform.localRotation;
            var pose = new HumanPose();
            targetAnimator.avatar = human;
            try
            {
                using var sourceHandler = new HumanPoseHandler(sourceAnimator.avatar, sourceAnimator.transform);
                using var targetHandler = new HumanPoseHandler(human, targetAnimator.transform);
                for (int step = 0; step <= segments; step++)
                {
                    source.SampleAnimation(sourceAnimator.gameObject, source.length * step / segments);
                    sourceHandler.GetHumanPose(ref pose);
                    targetHandler.SetHumanPose(ref pose);
                    for (int i = 0; i < joints.Length; i++) rotations[i][step] = joints[i].localRotation;
                    positions[step] = hips.localPosition;
                }
            }
            finally
            {
                targetAnimator.avatar = generic;
                targetAnimator.transform.SetLocalPositionAndRotation(restRoot, restRootRotation);
                for (int i = 0; i < joints.Length; i++) joints[i].localRotation = rest[i];
                hips.localPosition = restHips;
            }

            var clip = new AnimationClip { name = "CharakuruWalkRetargeted", frameRate = sampleRate };
            var bindings = new List<EditorCurveBinding>();
            var curves = new List<AnimationCurve>();
            void Record(Transform joint, string property, Func<int, float> value)
            {
                string path = AnimationUtility.CalculateTransformPath(joint, targetAnimator.transform);
                bindings.Add(EditorCurveBinding.FloatCurve(path, typeof(Transform), property));
                curves.Add(new AnimationCurve(Enumerable.Range(0, segments + 1)
                    .Select(step => new Keyframe(source.length * step / segments, value(step))).ToArray()));
            }
            for (int i = 0; i < joints.Length; i++)
            {
                Quaternion[] rotation = rotations[i];
                Record(joints[i], "m_LocalRotation.x", step => rotation[step].x);
                Record(joints[i], "m_LocalRotation.y", step => rotation[step].y);
                Record(joints[i], "m_LocalRotation.z", step => rotation[step].z);
                Record(joints[i], "m_LocalRotation.w", step => rotation[step].w);
            }
            Record(hips, "m_LocalPosition.x", step => positions[step].x);
            Record(hips, "m_LocalPosition.y", step => positions[step].y);
            Record(hips, "m_LocalPosition.z", step => positions[step].z);
            AnimationUtility.SetEditorCurves(clip, bindings.ToArray(), curves.ToArray());
            clip.EnsureQuaternionContinuity();
            return clip;
        }

        private static ReviewFacts Sample(PlayableDirector director, double lead, float length,
            Transform[] joints, SkinnedMeshRenderer[] skins)
        {
            director.RebuildGraph();
            void Evaluate(float ratio)
            {
                director.time = lead + ratio * length;
                director.Evaluate();
            }

            Evaluate(ReviewSamples[0]);
            var startingRotations = joints.Select(joint => joint.localRotation).ToArray();
            var mesh = new Mesh();
            try
            {
                var baseline = skins.Select(skin => { skin.BakeMesh(mesh); return mesh.vertices; }).ToArray();
                var facts = new ReviewFacts { sampleFractions = ReviewSamples };
                foreach (float ratio in ReviewSamples.Skip(1))
                {
                    Evaluate(ratio);
                    for (int i = 0; i < joints.Length; i++)
                        facts.maxMappedJointAngleDegrees = Mathf.Max(facts.maxMappedJointAngleDegrees,
                            Quaternion.Angle(startingRotations[i], joints[i].localRotation));
                    for (int i = 0; i < skins.Length; i++)
                    {
                        skins[i].BakeMesh(mesh);
                        var vertices = mesh.vertices;
                        Require(vertices.Length == baseline[i].Length && vertices.Length > 0, "Baked skin lost its vertices.");
                        float scale = skins[i].transform.lossyScale.x;
                        for (int v = 0; v < vertices.Length; v++)
                            facts.maxSkinnedVertexDelta = Mathf.Max(facts.maxSkinnedVertexDelta,
                                scale * Vector3.Distance(baseline[i][v], vertices[v]));
                    }
                }
                return facts;
            }
            finally { Object.DestroyImmediate(mesh); }
        }

        private static string[] Capture(PlayableDirector director, double lead, float length,
            SkinnedMeshRenderer[] skins, string output)
        {
            var camera = new GameObject("Icarus motion review camera").AddComponent<Camera>();
            var light = new GameObject("Icarus motion review key").AddComponent<Light>();
            SceneManager.MoveGameObjectToScene(camera.gameObject, director.gameObject.scene);
            SceneManager.MoveGameObjectToScene(light.gameObject, director.gameObject.scene);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.14f, .16f, .20f);
            camera.orthographic = true;
            light.type = LightType.Directional;
            light.intensity = 1.35f;
            light.transform.rotation = Quaternion.Euler(30, 155, 0);
            var bounds = skins[0].bounds;
            foreach (var skin in skins.Skip(1)) bounds.Encapsulate(skin.bounds);
            camera.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.35f;
            camera.transform.position = bounds.center + new Vector3(1.45f, .18f, 5);
            camera.transform.LookAt(bounds.center);
            Require(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset,
                "A graphics capture requires the project's URP pipeline.");
            const int size = 720;
            var target = new RenderTexture(size, size, 24, RenderTextureFormat.ARGB32);
            var image = new Texture2D(size, size, TextureFormat.RGB24, false);
            var previous = RenderTexture.active;
            var bakedSkins = new List<(SkinnedMeshRenderer Source, MeshFilter Filter, Mesh Mesh)>();
            try
            {
                foreach (var skin in skins)
                {
                    var draw = new GameObject(skin.name + " sampled motion");
                    draw.transform.SetParent(skin.transform, false);
                    var filter = draw.AddComponent<MeshFilter>();
                    draw.AddComponent<MeshRenderer>().sharedMaterials = skin.sharedMaterials;
                    bakedSkins.Add((skin, filter, new Mesh()));
                    skin.enabled = false;
                }
                Require(target.Create(), "Could not allocate the review render target.");
                var frames = new List<string>();
                for (int i = 0; i < ReviewSamples.Length; i++)
                {
                    director.time = lead + ReviewSamples[i] * length;
                    director.Evaluate();
                    foreach (var (source, filter, mesh) in bakedSkins)
                    {
                        source.BakeMesh(mesh);
                        Require(mesh.vertexCount == source.sharedMesh.vertexCount, "A captured pose lost skinned vertices.");
                        mesh.RecalculateBounds();
                        filter.sharedMesh = mesh;
                    }
                    RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                    RenderTexture.active = target;
                    image.ReadPixels(new Rect(0, 0, size, size), 0, 0);
                    image.Apply();
                    var pixels = image.GetPixels32();
                    var background = pixels[0];
                    Require(pixels.Count(pixel => !pixel.Equals(background)) > size * size / 20,
                        "The review frame contains no readable character render.");
                    string name = $"icarus-charakuru-walk-{i + 1:D2}.png";
                    File.WriteAllBytes(Path.Combine(output, name), image.EncodeToPNG());
                    frames.Add(name);
                }
                return frames.ToArray();
            }
            finally
            {
                RenderTexture.active = previous;
                foreach (var (source, filter, mesh) in bakedSkins)
                {
                    source.enabled = true;
                    Object.DestroyImmediate(filter.gameObject);
                    Object.DestroyImmediate(mesh);
                }
                target.Release();
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(image);
            }
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }

        private static string Hash(string path)
        {
            using var stream = File.OpenRead(path);
            using var sha256 = SHA256.Create();
            return BitConverter.ToString(sha256.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }

        [Serializable]
        private sealed class ReviewFacts
        {
            public string modelSha256, sourceMotionSha256, sourceMotionFile, sourceMotionClip, editorVersion, graphicsDevice;
            public int mappedHumanoidBones, skinnedMeshes;
            public float clipSeconds, maxMappedJointAngleDegrees, maxSkinnedVertexDelta;
            public bool productionReady;
            public float[] sampleFractions;
            public string[] frames = Array.Empty<string>();
        }
    }
}
