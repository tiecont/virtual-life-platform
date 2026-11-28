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
        public static void Verify() => Verify(false);
        public static void VerifySkirtClearance() => Verify(false, reviewSkirt: true);
        public static void VerifyArmClearance() => Verify(false, reviewArms: true);
        public static void VerifyPelvisDeformation() => Verify(false, reviewPelvis: true);
        public static void VerifyPelvisAndRibbonDeformation() => Verify(false, reviewPelvis: true, reviewRibbons: true);
        public static void VerifyLayers() => Verify(false, reviewLayers: true);
        public static void VerifyDeformation() => Verify(false, reviewDeformation: true);
        public static void VerifyChinDeformation() => Verify(false, reviewChin: true);
        public static void PrepareRecorder() => Verify(true);
        public static void PrepareAccessoryRecorder() => Verify(true, true);

        private static void Verify(bool prepareRecorder, bool showcaseAccessories = false, bool reviewDeformation = false,
            bool reviewChin = false, bool reviewLayers = false, bool reviewArms = false, bool reviewPelvis = false,
            bool reviewSkirt = false, bool reviewRibbons = false)
        {
            const string motionVariable = "AETHERIA_ICARUS_REVIEW_MOTION";
            const string outputVariable = "AETHERIA_ICARUS_REVIEW_OUTPUT";
            string source = Environment.GetEnvironmentVariable(motionVariable);
            string output = Environment.GetEnvironmentVariable(outputVariable);
            if (!Application.isBatchMode || !Path.IsPathRooted(source ?? "") ||
                !File.Exists(source) || !source.EndsWith(".vrma", StringComparison.OrdinalIgnoreCase) ||
                !Path.IsPathRooted(output ?? "") || Directory.Exists(output) || File.Exists(output))
                throw new InvalidOperationException($"Batch mode requires a local VRMA in {motionVariable} and a new absolute review directory in {outputVariable}.");

            string chinSource = reviewDeformation || reviewChin
                ? Environment.GetEnvironmentVariable("AETHERIA_ICARUS_REVIEW_CHIN_VRM") : null;
            string chinSha = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_REVIEW_CHIN_SHA256");
            if (reviewChin || !string.IsNullOrEmpty(chinSource))
                Require(Path.IsPathRooted(chinSource ?? "") && File.Exists(chinSource) &&
                    chinSource.EndsWith(".vrm",StringComparison.OrdinalIgnoreCase) && Hash(chinSource)==chinSha,
                    "Use the exact authorized chin candidate in AETHERIA_ICARUS_REVIEW_CHIN_VRM and AETHERIA_ICARUS_REVIEW_CHIN_SHA256.");
            string pelvisSource = reviewPelvis ? Environment.GetEnvironmentVariable("AETHERIA_ICARUS_REVIEW_PELVIS_VRM") : null;
            string pelvisSha = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_REVIEW_PELVIS_SHA256");
            if (reviewPelvis)
                Require(Path.IsPathRooted(pelvisSource ?? "") && File.Exists(pelvisSource) &&
                    pelvisSource.EndsWith(".vrm",StringComparison.OrdinalIgnoreCase) && Hash(pelvisSource)==pelvisSha,
                    "Use the exact pelvis review candidate and fingerprint environment variables.");
            string skirtBaseline = reviewSkirt ? Environment.GetEnvironmentVariable("AETHERIA_ICARUS_SKIRT_BASE_ANIM") : null;
            string skirtSha = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_SKIRT_BASE_SHA256");
            if (reviewSkirt && !string.IsNullOrEmpty(skirtBaseline))
                Require(Path.IsPathRooted(skirtBaseline) && File.Exists(skirtBaseline) &&
                    skirtBaseline.EndsWith(".anim",StringComparison.OrdinalIgnoreCase) && Hash(skirtBaseline)==skirtSha,
                    "Use the exact optional private skirt baseline AnimationClip fingerprint.");
            string sourceVrmFile = Path.Combine(Path.GetDirectoryName(Application.dataPath), VrmPath);
            Require(Hash(sourceVrmFile) == VrmSha256, "The owner-designated Icarus VRM has changed.");
            Directory.CreateDirectory(output);
            Debug.Log("Icarus review: recover pinned VRM and accessory imports.");
            IcarusPrefabSetupEditor.RecoverReviewImports();
            var originalScene = SceneManager.GetActiveScene();
            // The direct batch bootstrap is already an isolated, clean scene.
            // Opening a replacement can block on the Editor scene-save path.
            bool useBootstrap = SceneManager.sceneCount == 1 && string.IsNullOrEmpty(originalScene.path);
            Require(!useBootstrap || !originalScene.isDirty, "The untitled scene contains unsaved changes.");
            var scene = useBootstrap
                ? originalScene
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            Debug.Log("Icarus review: temporary assets in " + (useBootstrap ? "batch bootstrap" : "additive preview") + " scene.");
            string leaf = "IcarusMotionReview-" + Guid.NewGuid().ToString("N");
            string folder = "Assets/" + leaf;
            PlayableDirector director = null;
            GameObject reviewRoot = null;
            bool stagedForRecording = false;
            try
            {
                reviewRoot = new GameObject("Icarus private motion review");
                SceneManager.MoveGameObjectToScene(reviewRoot, scene);
                AssetDatabase.CreateFolder("Assets", leaf);
                string inputPath = folder + "/CharakuruWalk.vrma";
                File.Copy(source, Path.Combine(Application.dataPath, leaf, "CharakuruWalk.vrma"));
                AssetDatabase.ImportAsset(inputPath, ImportAssetOptions.ForceSynchronousImport);
                Debug.Log("Icarus review: verify imported assets and the modular prefab.");
                var importedObject = AssetDatabase.LoadAssetAtPath<GameObject>(inputPath);
                var vrmObject = AssetDatabase.LoadAssetAtPath<GameObject>(VrmPath);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(IcarusPrefabSetupEditor.PrefabPath);
                Require(importedObject != null && vrmObject != null && prefab != null, "VRMA, VRM or modular Icarus prefab failed to import.");
                Require(AssetDatabase.GetDependencies(IcarusPrefabSetupEditor.PrefabPath).Contains(VrmPath),
                    "Modular Icarus does not depend on the selected owner baseline VRM.");

                var motionSource = (GameObject)PrefabUtility.InstantiatePrefab(importedObject, scene);
                var model = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                motionSource.transform.SetParent(reviewRoot.transform, false);
                model.transform.SetParent(reviewRoot.transform, false);
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
                Debug.Log("Icarus review: retarget existing walk to the mapped joints.");
                var bound = BakeMotion(motion, sourceAnimator, modelAnimator, humanAvatar, genericAvatar,
                    bones.Select(bone => bone.Joint).ToArray(), hips);
                AssetDatabase.CreateAsset(bound, folder + "/CharakuruWalkRetargeted.anim");
                AssetDatabase.SaveAssetIfDirty(bound);
                Object.DestroyImmediate(motionSource);

                var skins = model.GetComponentsInChildren<SkinnedMeshRenderer>(false)
                    .Where(renderer => renderer.enabled && renderer.sharedMesh != null).ToArray();
                Require(skins.Length > 0 && skins.All(renderer => renderer.bones.Length > 0),
                    "Imported Icarus has no active skinned mesh.");

                Debug.Log("Icarus review: bind and sample the Timeline.");
                director = CinematicStudio.CreateBoundTimeline(modelAnimator, bound,
                    CinematicStudio.Sequence.CharacterIntro, folder + "/CharakuruWalkReview.playable");
                var track = ((TimelineAsset)director.playableAsset).GetOutputTracks().OfType<AnimationTrack>().Single();
                var take = track.GetClips().Single();
                Require(director.GetGenericBinding(track) == modelAnimator && take.animationClip == bound && !director.playOnAwake,
                    "Cinematic Studio did not bind the retargeted motion to the actual Icarus instance.");
                if (reviewArms)
                    IcarusArmClearanceReview.Export(modelVrm,modelAnimator,director,take,bound,skins,folder,output);
                if (reviewSkirt)
                {
                    AnimationClip baseline=bound;
                    if (!string.IsNullOrEmpty(skirtBaseline))
                    {
                        string path=folder+"/PrivateSkirtBaseline.anim";
                        File.Copy(skirtBaseline,Path.Combine(Application.dataPath,leaf,"PrivateSkirtBaseline.anim"));
                        AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);
                        baseline=AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                        Require(baseline!=null && Mathf.Abs(baseline.length-bound.length)<.0001f,
                            "Private skirt baseline does not match the original walk duration.");
                    }
                    IcarusSkirtClearanceReview.Export(modelVrm,modelAnimator,director,take,bound,baseline,skins,folder,output);
                }
                if (reviewLayers)
                    IcarusLayerSurfaceExport.Write(Path.Combine(output, "original-layers.bin"), skins, director, take.start, bound.length);
                IcarusWalkDeformationReview.Result deformation = null;
                AnimationClip garmentCorrection = null;
                if (reviewDeformation)
                    deformation = IcarusWalkDeformationReview.Compare(modelVrm,modelAnimator,skins,director,bound,take.start,
                        out garmentCorrection);
                IcarusChinWeightReview.Facts chin = null;
                SkinnedMeshRenderer candidateHead = null;
                SkinnedMeshRenderer originalHead = null;
                if (chinSource != null)
                {
                    string candidatePath = folder+"/PrivateChinCandidate.vrm";
                    File.Copy(chinSource,Path.Combine(Application.dataPath,leaf,"PrivateChinCandidate.vrm"));
                    AssetDatabase.ImportAsset(candidatePath,ImportAssetOptions.ForceSynchronousImport);
                    var sourceCandidate = AssetDatabase.LoadAssetAtPath<GameObject>(candidatePath);
                    Require(sourceCandidate != null,"The authorized chin candidate did not import.");
                    originalHead = skins.Single(renderer => renderer.name=="Head");
                    candidateHead = sourceCandidate.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                        .Single(renderer=>renderer.name=="Head");
                    chin = IcarusChinWeightReview.Compare(modelVrm,originalHead,candidateHead,director,take.start,bound.length,chinSha);
                }
                IcarusPelvisWeightReview.Facts pelvis = null;
                SkinnedMeshRenderer candidateBody = null;
                SkinnedMeshRenderer originalBody = null;
                var pelvisMeshes = new List<(SkinnedMeshRenderer renderer, Mesh original, Mesh candidate)>();
                void WithPelvisMeshes(Action sample)
                {
                    try
                    {
                        foreach (var part in pelvisMeshes) part.renderer.sharedMesh = part.candidate;
                        sample();
                    }
                    finally
                    {
                        foreach (var part in pelvisMeshes) part.renderer.sharedMesh = part.original;
                    }
                }
                if (reviewPelvis)
                {
                    string input = folder+"/PrivatePelvisCandidate.vrm";
                    File.Copy(pelvisSource, Path.Combine(Application.dataPath,leaf,"PrivatePelvisCandidate.vrm"));
                    AssetDatabase.ImportAsset(input, ImportAssetOptions.ForceSynchronousImport);
                    var sourceCandidate = AssetDatabase.LoadAssetAtPath<GameObject>(input);
                    Require(sourceCandidate != null,"The pelvis candidate did not import.");
                    originalBody = skins.Single(renderer=>renderer.name=="Body");
                    candidateBody = sourceCandidate.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                        .Single(renderer=>renderer.name=="Body");
                    pelvis = IcarusPelvisWeightReview.Compare(originalBody,candidateBody,director,take.start,bound.length,pelvisSha);
                    var originalMesh = originalBody.sharedMesh;
                    pelvisMeshes.Add((originalBody, originalMesh, candidateBody.sharedMesh));
                    if (reviewRibbons)
                    {
                        var imported = sourceCandidate.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                        foreach (string name in new[] { "Spring_07_ribbon_left", "Spring_08_ribbon_right" })
                        {
                            var from = skins.Single(r => r.name == name);
                            var to = imported.Single(r => r.name == name);
                            var sourceMesh = from.sharedMesh;
                            var nextMesh = to.sharedMesh;
                            Require(sourceMesh.vertexCount == nextMesh.vertexCount &&
                                sourceMesh.subMeshCount == nextMesh.subMeshCount &&
                                sourceMesh.uv.SequenceEqual(nextMesh.uv) &&
                                sourceMesh.bindposes.SequenceEqual(nextMesh.bindposes) &&
                                from.bones.Select(b => b.name).SequenceEqual(to.bones.Select(b => b.name)) &&
                                Enumerable.Range(0, sourceMesh.subMeshCount).All(index =>
                                    sourceMesh.GetIndices(index).SequenceEqual(nextMesh.GetIndices(index))),
                                name + " changed the topology, UV layout or rig of the original ribbon.");
                            pelvisMeshes.Add((from, sourceMesh, nextMesh));
                        }
                    }
                    IcarusLayerSurfaceExport.Write(Path.Combine(output,"original-layers.bin"),skins,director,take.start,bound.length);
                    WithPelvisMeshes(() => IcarusLayerSurfaceExport.Write(Path.Combine(output,"pelvis-layers.bin"),
                        skins,director,take.start,bound.length,originalMesh));
                }
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
                review.expressionBindings = modelVrm.Vrm.Expression.Clips.Where(entry => entry.Clip != null)
                    .Select(entry => new ExpressionBindings {
                        preset = entry.Preset.ToString(),
                        morph = entry.Clip.MorphTargetBindings.Length,
                        color = entry.Clip.MaterialColorBindings.Length,
                        uv = entry.Clip.MaterialUVBindings.Length,
                        transform = entry.Clip.NodeTransformBindings.Length
                    }).ToArray();
                review.eyeRig = MeasureEyeRig(modelVrm, skins);
                review.deformation = deformation;
                review.chin = chin;
                review.pelvis = pelvis;
                if (reviewSkirt) review.skirtBaselineClipSha256 = skirtSha;
                review.graphicsDevice = SystemInfo.graphicsDeviceType.ToString();
                if (SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null)
                    review.frames = Capture(director,take.start,bound.length,skins,reviewRoot.transform,modelVrm,output,
                        out review.clippedWhitePercent, captureMovingChin: chin != null, captureMovingPelvis: pelvis != null);
                if (chin != null && SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null)
                {
                    string chinOutput = Path.Combine(output,"chin-correction");
                    Directory.CreateDirectory(chinOutput);
                    var originalMesh = originalHead.sharedMesh;
                    try
                    {
                        originalHead.sharedMesh = candidateHead.sharedMesh;
                        Capture(director,take.start,bound.length,skins,reviewRoot.transform,modelVrm,chinOutput,
                            out _, captureMovingChin: true);
                    }
                    finally { originalHead.sharedMesh = originalMesh; }
                }
                if (pelvis != null && SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null)
                {
                    string correctedOutput = Path.Combine(output,"pelvis-correction");
                    Directory.CreateDirectory(correctedOutput);
                    WithPelvisMeshes(() => Capture(director,take.start,bound.length,skins,reviewRoot.transform,modelVrm,
                        correctedOutput,out _,captureMovingPelvis: true));
                }
                if (garmentCorrection != null)
                {
                    string privateClip = "IcarusWalkPrivateGarmentCorrection.anim";
                    AssetDatabase.CreateAsset(garmentCorrection,folder+"/"+privateClip);
                    AssetDatabase.SaveAssetIfDirty(garmentCorrection);
                    File.Copy(Path.Combine(Application.dataPath,leaf,privateClip),Path.Combine(output,privateClip));
                    review.correctedClipSha256 = Hash(Path.Combine(output,privateClip));
                    if (SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null)
                    {
                        director.Stop();
                        ((AnimationPlayableAsset)take.asset).clip = garmentCorrection;
                        director.RebuildGraph();
                        string correctedOutput = Path.Combine(output,"garment-correction");
                        Directory.CreateDirectory(correctedOutput);
                        review.correctedFrames = Capture(director,take.start,bound.length,skins,reviewRoot.transform,modelVrm,
                            correctedOutput,out review.correctedClippedWhitePercent);
                    }
                }
                File.WriteAllText(Path.Combine(output, "icarus-motion-review.json"), JsonUtility.ToJson(review, true) + "\n");
                if (prepareRecorder)
                {
                    IcarusCinematicRecording.Stage(scene, folder, output, reviewRoot.transform, modelVrm, skins, director, take, showcaseAccessories);
                    stagedForRecording = true;
                }
                Debug.Log($"Charakuru Icarus motion verified on Timeline. {review.mappedHumanoidBones} mapped bones, " +
                    $"{review.maxMappedJointAngleDegrees:F2}° joint motion, {review.maxSkinnedVertexDelta:F4} m skin movement.");
            }
            finally
            {
                if (!stagedForRecording && director != null)
                {
                    director.Stop();
                    Undo.ClearUndo(director.gameObject);
                    Object.DestroyImmediate(director.gameObject);
                }
                if (!stagedForRecording && reviewRoot != null) Object.DestroyImmediate(reviewRoot);
                if (!useBootstrap)
                {
                    EditorSceneManager.CloseScene(scene, true);
                    if (originalScene.IsValid() && originalScene.isLoaded) SceneManager.SetActiveScene(originalScene);
                }
                if (!stagedForRecording && AssetDatabase.IsValidFolder(folder)) AssetDatabase.DeleteAsset(folder);
            }
        }

        internal static AnimationClip BakeMotion(AnimationClip source, Animator sourceAnimator, Animator targetAnimator,
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

        // The exported LookAt uses empty expression presets. Measure each mapped
        // joint independently on a stationary pose before evaluating any camera frames.
        private static EyeRigSample[] MeasureEyeRig(Vrm10Instance model, SkinnedMeshRenderer[] skins)
        {
            var result = new List<EyeRigSample>();
            var mesh = new Mesh();
            try
            {
                foreach (var kind in new[] { HumanBodyBones.LeftEye, HumanBodyBones.RightEye })
                {
                    if (!model.TryGetBoneTransform(kind, out var eye)) continue;
                    var rest = eye.localRotation;
                    var sample = new EyeRigSample { bone = kind.ToString(), requestedYawDegrees = 10f };
                    var before = skins.Select(skin => { skin.BakeMesh(mesh); return mesh.vertices; }).ToArray();
                    try
                    {
                        eye.Rotate(Vector3.up, sample.requestedYawDegrees, Space.World);
                        for (int i = 0; i < skins.Length; i++)
                        {
                            skins[i].BakeMesh(mesh);
                            var after = mesh.vertices;
                            Require(before[i].Length == after.Length, "Eye probe changed skinned topology.");
                            for (int v = 0; v < after.Length; v++)
                            {
                                float delta = skins[i].transform.TransformVector(after[v] - before[i][v]).magnitude;
                                if (delta <= .00001f) continue;
                                sample.movedVertices++;
                                sample.maxDisplacementMeters = Mathf.Max(sample.maxDisplacementMeters, delta);
                            }
                        }
                    }
                    finally { eye.localRotation = rest; }
                    result.Add(sample);
                }
            }
            finally { Object.DestroyImmediate(mesh); }
            return result.ToArray();
        }

        internal static string[] Capture(PlayableDirector director, double lead, float length,
            SkinnedMeshRenderer[] skins, Transform reviewRoot, Vrm10Instance modelVrm, string output, out float[] clippedWhitePercent,
            bool captureMovingChin = false, bool captureMovingPelvis = false, bool supersample = false, Bounds? fixedFrame = null)
        {
            Require(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset,
                "A graphics capture requires the project's URP pipeline.");
            var sceneLights = Object.FindObjectsByType<Light>(FindObjectsInactive.Exclude, FindObjectsSortMode.None)
                .Where(light => light.enabled).ToArray();
            var camera = new GameObject("Icarus motion review camera").AddComponent<Camera>();
            camera.transform.SetParent(reviewRoot, false);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.14f, .16f, .20f);
            camera.orthographic = true;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;

            AddPreviewLight("Key", new Color(1f, .95f, .91f), .57f, Quaternion.Euler(32, 155, 0));
            AddPreviewLight("Fill", new Color(.75f, .83f, 1f), .14f, Quaternion.Euler(12, 223, 0));

            void AddPreviewLight(string name, Color color, float intensity, Quaternion rotation)
            {
                var light = new GameObject("Icarus motion review " + name).AddComponent<Light>();
                light.transform.SetParent(reviewRoot, false);
                light.type = LightType.Directional;
                light.color = color;
                light.intensity = intensity;
                light.transform.rotation = rotation;
            }
            var bounds = skins[0].bounds;
            foreach (var skin in skins.Skip(1)) bounds.Encapsulate(skin.bounds);
            bounds = fixedFrame ?? bounds;
            camera.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.35f;
            camera.transform.position = bounds.center + new Vector3(1.45f, .18f, 5);
            camera.transform.LookAt(bounds.center);
            const int size = 720;
            var renderSize = supersample ? size * 2 : size;
            var target = new RenderTexture(renderSize, renderSize, 24, RenderTextureFormat.ARGB32)
                { filterMode = FilterMode.Bilinear };
            var resolve = supersample ? new RenderTexture(size, size, 0, RenderTextureFormat.ARGB32) : null;
            var image = new Texture2D(size, size, TextureFormat.RGB24, false);
            void ReadCamera()
            {
                RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                if (resolve != null) Graphics.Blit(target, resolve);
                RenderTexture.active = resolve != null ? resolve : target;
                image.ReadPixels(new Rect(0, 0, size, size), 0, 0);
                image.Apply();
            }
            var previous = RenderTexture.active;
            var originalScene = SceneManager.GetActiveScene();
            bool switchScene = originalScene != reviewRoot.gameObject.scene;
            if (switchScene) SceneManager.SetActiveScene(reviewRoot.gameObject.scene);
            var ambientMode = RenderSettings.ambientMode;
            var sky = RenderSettings.ambientSkyColor;
            var equator = RenderSettings.ambientEquatorColor;
            var ground = RenderSettings.ambientGroundColor;
            var reflection = RenderSettings.reflectionIntensity;
            var bakedSkins = new List<(SkinnedMeshRenderer Source, MeshFilter Filter, Mesh Mesh)>();
            try
            {
                foreach (var light in sceneLights) light.enabled = false;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(.36f, .39f, .47f);
                RenderSettings.ambientEquatorColor = new Color(.19f, .21f, .26f);
                RenderSettings.ambientGroundColor = new Color(.09f, .09f, .13f);
                RenderSettings.reflectionIntensity = .25f;
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
                var exposure = new List<float>();
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
                    ReadCamera();
                    var pixels = image.GetPixels32();
                    var background = pixels[0];
                    int foreground = 0;
                    int clippedWhite = 0;
                    foreach (var pixel in pixels)
                    {
                        if (pixel.Equals(background)) continue;
                        foreground++;
                        if (pixel.r >= 250 && pixel.g >= 250 && pixel.b >= 250) clippedWhite++;
                    }
                    Require(foreground > size * size / 20, "The review frame contains no readable character render.");
                    float whitePercent = 100f * clippedWhite / foreground;
                    Debug.Log($"Icarus review frame {i + 1}: {whitePercent:F2}% of foreground pixels are near-white.");
                    string stem = $"icarus-charakuru-walk-{i + 1:D2}";
                    string name = stem + ".png";
                    if (whitePercent >= 25f)
                    {
                        File.WriteAllBytes(Path.Combine(output, stem + "-exposure-rejected.png"), image.EncodeToPNG());
                        throw new InvalidOperationException($"Icarus frame {i + 1} exceeded the 25% near-white foreground limit.");
                    }
                    File.WriteAllBytes(Path.Combine(output, name), image.EncodeToPNG());
                    if (i == 0 && fixedFrame.HasValue)
                    {
                        var origin = camera.transform.position;
                        var rotation = camera.transform.rotation;
                        foreach (var view in new[] { ("front", Vector3.forward), ("back", Vector3.back), ("side", Vector3.right) })
                        {
                            camera.transform.position = bounds.center + view.Item2 * 5;
                            camera.transform.LookAt(bounds.center);
                            ReadCamera();
                            File.WriteAllBytes(Path.Combine(output, "body-" + view.Item1 + "-walk-10pct.png"), image.EncodeToPNG());
                        }
                        camera.transform.SetPositionAndRotation(origin, rotation);
                    }
                    frames.Add(name);
                    exposure.Add(whitePercent);
                    if (captureMovingChin &&
                        modelVrm.TryGetBoneTransform(HumanBodyBones.LeftEye,out var left) &&
                        modelVrm.TryGetBoneTransform(HumanBodyBones.RightEye,out var right))
                    {
                        var position = camera.transform.position;
                        var rotation = camera.transform.rotation;
                        var orthoSize = camera.orthographicSize;
                        var eyes = (left.position+right.position)*.5f;
                        float separation = Vector3.Distance(left.position,right.position);
                        camera.orthographicSize = separation*3.3f;
                        var chinFocus = eyes+Vector3.down*(separation*1.36f);
                        camera.transform.position = chinFocus+new Vector3(.36f,.04f,1f);
                        camera.transform.LookAt(chinFocus);
                        ReadCamera();
                        File.WriteAllBytes(Path.Combine(output,$"icarus-motion-chin-{i+1:D2}.png"),image.EncodeToPNG());
                        camera.transform.SetPositionAndRotation(position,rotation);
                        camera.orthographicSize = orthoSize;
                    }
                    if (captureMovingPelvis &&
                        modelVrm.TryGetBoneTransform(HumanBodyBones.Hips,out var hips) &&
                        modelVrm.TryGetBoneTransform(HumanBodyBones.LeftLowerLeg,out var leftKnee) &&
                        modelVrm.TryGetBoneTransform(HumanBodyBones.RightLowerLeg,out var rightKnee))
                    {
                        var position = camera.transform.position;
                        var rotation = camera.transform.rotation;
                        var orthoSize = camera.orthographicSize;
                        var midpoint = (leftKnee.position+rightKnee.position)*.5f;
                        var focus = Vector3.Lerp(hips.position,midpoint,.18f);
                        camera.orthographicSize = Vector3.Distance(hips.position,midpoint)*.78f;
                        camera.transform.position = focus+new Vector3(.29f,.08f,1f);
                        camera.transform.LookAt(focus);
                        ReadCamera();
                        File.WriteAllBytes(Path.Combine(output,$"icarus-motion-pelvis-{i+1:D2}.png"),image.EncodeToPNG());
                        camera.transform.SetPositionAndRotation(position,rotation);
                        camera.orthographicSize = orthoSize;
                    }
                }
                if (modelVrm.TryGetBoneTransform(HumanBodyBones.LeftEye, out var leftEye) &&
                    modelVrm.TryGetBoneTransform(HumanBodyBones.RightEye, out var rightEye))
                {
                    var eyes = (leftEye.position + rightEye.position) * .5f;
                    var separation = Vector3.Distance(leftEye.position, rightEye.position);
                    Require(separation > .001f, "Cannot frame the mapped eye bones.");
                    camera.orthographicSize = separation * 3f;
                    var focus = eyes + Vector3.down * (separation * .45f);
                    camera.transform.position = focus + new Vector3(0, 0, 1);
                    camera.transform.LookAt(focus);
                    ReadCamera();
                    File.WriteAllBytes(Path.Combine(output, "icarus-face-walk-85pct.png"), image.EncodeToPNG());
                }
                clippedWhitePercent = exposure.ToArray();
                return frames.ToArray();
            }
            finally
            {
                RenderTexture.active = previous;
                RenderSettings.ambientMode = ambientMode;
                RenderSettings.ambientSkyColor = sky;
                RenderSettings.ambientEquatorColor = equator;
                RenderSettings.ambientGroundColor = ground;
                RenderSettings.reflectionIntensity = reflection;
                foreach (var light in sceneLights) light.enabled = true;
                if (switchScene) SceneManager.SetActiveScene(originalScene);
                foreach (var (source, filter, mesh) in bakedSkins)
                {
                    source.enabled = true;
                    Object.DestroyImmediate(filter.gameObject);
                    Object.DestroyImmediate(mesh);
                }
                if (resolve != null) { resolve.Release(); Object.DestroyImmediate(resolve); }
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
        private sealed class EyeRigSample
        {
            public string bone;
            public int movedVertices;
            public float requestedYawDegrees, maxDisplacementMeters;
        }

        [Serializable]
        private sealed class ExpressionBindings
        {
            public string preset;
            public int morph, color, uv, transform;
        }

        [Serializable]
        private sealed class ReviewFacts
        {
            public string modelSha256, sourceMotionSha256, sourceMotionFile, sourceMotionClip, editorVersion, graphicsDevice;
            public int mappedHumanoidBones, skinnedMeshes;
            public float clipSeconds, maxMappedJointAngleDegrees, maxSkinnedVertexDelta;
            public bool productionReady;
            public ExpressionBindings[] expressionBindings;
            public EyeRigSample[] eyeRig;
            public IcarusWalkDeformationReview.Result deformation;
            public IcarusChinWeightReview.Facts chin;
            public IcarusPelvisWeightReview.Facts pelvis;
            public string skirtBaselineClipSha256;
            public string correctedClipSha256;
            public string[] correctedFrames = Array.Empty<string>();
            public float[] correctedClippedWhitePercent = Array.Empty<float>();
            public float[] sampleFractions;
            public float[] clippedWhitePercent = Array.Empty<float>();
            public string[] frames = Array.Empty<string>();
        }
    }
}
