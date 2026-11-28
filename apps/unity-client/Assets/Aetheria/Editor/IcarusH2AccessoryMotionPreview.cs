using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UniVRM10;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    public static class IcarusH2AccessoryMotionPreview
    {
        private const string Intake = "Assets/AetheriaH2AccessoryReview";
        private const string Vrm = "Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm";
        private const string VrmSha = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a";
        private const string Walk = Intake + "/Walk.vrma";
        private const string WalkSha = "50b27c7363ff844ccb0b71373794326583a601128e90f14de0c3df7bfefe9161";
        private const string Wings = Intake + "/Wings.glb";
        private const string WingSourceTask = "a061ea26-294a-49f9-89f8-e4954ed11c21";
        private const string WingSourceSha = "be86f92ab8aff6e22e9a3f7f9a8e355305aa0f7b7329926f800be2d7605f4524";
        private const string WingsSha = "b7e97b488368bc0d26ae1984259f036573b4237513ddb318479409b8d7251c84";
        private const string Bow = Intake + "/Bow.glb";
        private const string BowSha = "86f0251d47103295d66878759f2cb2b14a757d0207f3034cd26d0e96680def3c";
        private const int Size = 960;

        [Serializable]
        private sealed class Facts
        {
            public string classification = "PRIVATE_H2_ASSEMBLY_REVIEW";
            public string unityVersion = Application.unityVersion, graphicsDevice = SystemInfo.graphicsDeviceType.ToString();
            public string modelSha256 = VrmSha, walkSha256 = WalkSha, bowSha256 = BowSha, wingsSha256 = WingsSha;
            public string prefabSha256, wingsSocketParent, bowSocketParent, wingsClip, bowClip;
            public string wingProviderTask = WingSourceTask, wingProviderExportSha256 = WingSourceSha;
            public SequenceFrame[] wingSequence, bowSequence;
            public int wingsTriangles, bowTriangles, assembledTriangles, frameCount, mappedWalkJoints;
            public float wingFoldDeltaMeters, bowDrawDeltaMeters, releaseRestResidualMeters;
            public float walkWingSocketTravelMeters, walkBowSocketTravelMeters;
            public float spreadMeanDepthFromChestMeters, foldMeanDepthFromChestMeters, wingPreviewYawDegrees;
            public float bowGripToPalmBeforeMeters, bowGripToPalmAfterMeters, drawNockToFreePalmMeters, bowPreviewYawDegrees;
            public float bowRestWeight, bowDrawWeight, bowReleaseMiddleWeight, bowReleasedWeight;
            public string[] frames;
            public string bowReviewScope = "Provider draw clip and integrated string. Stable center-grip band fitted to the mapped right palm. The free hand remains in the static review pose.";
            public string movementReviewScope = "Existing retargeted Charakuru walk with sampled accessory morph weights.";
        }

        [Serializable]
        private sealed class SequenceFrame
        {
            public string frame, sha256;
            public float seconds, weight;
        }

        public static void Render()
        {
            string output = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_H2_MOTION_OUTPUT");
            Require(Application.isBatchMode && SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null &&
                Path.IsPathRooted(output ?? "") && !Directory.Exists(output) && !File.Exists(output),
                "Use a private graphics-enabled batch Editor and a fresh absolute AETHERIA_ICARUS_H2_MOTION_OUTPUT directory.");
            Require(Hash(Vrm) == VrmSha && Hash(Walk) == WalkSha && Hash(Wings) == WingsSha && Hash(Bow) == BowSha,
                "The private H2 intake differs from its pinned source files.");
            var path = IcarusPrefabSetupEditor.PrefabPath;
            string prefabHash = Hash(path);
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
            Require(pipeline != null, "Pinned URP pipeline missing.");
            var previousPipeline = GraphicsSettings.defaultRenderPipeline;
            var previousQualityPipeline = QualitySettings.renderPipeline;
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            var scene = SceneManager.GetActiveScene();
            if (SceneManager.sceneCount != 1 || !string.IsNullOrEmpty(scene.path) || scene.isDirty)
                throw new InvalidOperationException("Launch the isolated H2 review with an empty batch scene.");

            var stage = new GameObject("Private H2 review");
            var target = new RenderTexture(Size, Size, 24) { antiAliasing = 4 };
            var pixels = new Texture2D(Size, Size, TextureFormat.RGB24, false);
            AnimationClip retargeted = null;
            try
            {
                Directory.CreateDirectory(output);
                IcarusPrefabSetupEditor.RecoverReviewImports();
                Require(AssetDatabase.GetDependencies(path).Contains(Vrm), "The modular prefab no longer binds the owner VRM.");
                var sourceVrm = Import(Vrm);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                Require(prefab != null, "Missing modular Icarus prefab.");
                var model = Object.Instantiate(prefab, stage.transform);
                var vrm = model.GetComponentInChildren<Vrm10Instance>(true);
                Require(vrm != null, "The prefab lost its imported VRM instance.");
                var wingSocket = Socket(model, vrm, "Socket_Wings", HumanBodyBones.UpperChest);
                var bowSocket = Socket(model, vrm, "Socket_Bow", HumanBodyBones.RightHand);
                foreach (var stringLine in model.GetComponentsInChildren<LineRenderer>(true))
                    Object.DestroyImmediate(stringLine);
                foreach (var stringController in model.GetComponentsInChildren<Aetheria.Icarus.IcarusBowString>(true))
                    stringController.enabled = false;

                var wing = Attach(wingSocket, "Icarus_Wings", Wings, "WingFold", "WingSpreadBeatFold");
                var bow = Attach(bowSocket, "Icarus_Bow", Bow, "BowDraw", "BowDrawRelease");
                var forward = model.transform.forward;
                float wingYaw = FitFoldAxis(wing, forward);
                var bowFit = FitBow(bow, vrm, bowSocket.parent);
                var (animator, clip, joints) = Retarget(model, vrm, sourceVrm, stage.transform);
                retargeted = clip;

                Vector3[] wingSpread = Measure(wing, 0), wingFolded = Measure(wing, 1);
                const float drawTime = .8f, releaseMiddle = .94f;
                float restWeight = bow.Sample(0);
                Vector3[] bowRest = MeasureSample(bow);
                float drawnWeight = bow.Sample(drawTime);
                Vector3[] bowDrawn = MeasureSample(bow);
                float middleWeight = bow.Sample(releaseMiddle);
                float releasedWeight = bow.Sample(bow.Clip.length);
                Vector3[] bowReleased = MeasureSample(bow);
                Require(restWeight < .01f && drawnWeight > .95f && middleWeight > .05f &&
                    middleWeight < .95f && releasedWeight < .01f, "The imported draw clip lost its staged rest, draw or release.");
                float spreadDepth = MeanDepth(wingSpread, wingSocket.parent.position, forward);
                float foldDepth = MeanDepth(wingFolded, wingSocket.parent.position, forward);
                Require(foldDepth < spreadDepth, "The imported folded wings move in front of their spread pose.");

                float wingDelta = Delta(wingSpread, wingFolded), drawDelta = Delta(bowRest, bowDrawn);
                float releaseDelta = Delta(bowRest, bowReleased);
                Require(wingDelta > .001f && drawDelta > .001f && releaseDelta < .00001f,
                    "The imported fold, draw and return must deform and restore the provider geometry.");
                Require(!model.GetComponentsInChildren<LineRenderer>(true).Any(),
                    "The review must use the actual imported bowstring geometry.");

                int wingTriangles = Triangles(wing.Root), bowTriangles = Triangles(bow.Root), assembled = Triangles(model);
                var camera = Studio(stage.transform, target);
                using var draw = new SampledSurfaceDraw(model);
                draw.Refresh();
                var whole = BoundsFor(model);
                wing.Set(0);
                draw.Refresh();
                whole.Encapsulate(BoundsFor(model));
                bow.Sample(drawTime);
                draw.Refresh();
                var bowFrame = BoundsFor(bow.Root);
                bow.Sample(0);
                draw.Refresh();
                bowFrame.Encapsulate(BoundsFor(bow.Root));
                var shots = new System.Collections.Generic.List<string>();
                void Shot(string name, Bounds frame, Vector3 direction, float fold, float bowWeight)
                {
                    wing.Set(fold);
                    bow.Set(bowWeight);
                    draw.Refresh();
                    Capture(camera, target, pixels, frame, direction, Path.Combine(output, name));
                    shots.Add(name);
                }
                var front = new Vector3(0, .10f, 1);
                var back = new Vector3(0, .12f, -1);
                var quarter = new Vector3(-.68f, .17f, 1);
                Shot("01-front-folded.png", whole, front, 1, 0);
                Shot("02-right-folded.png", whole, new Vector3(1, .08f, 0), 1, 0);
                Shot("03-back-spread.png", whole, back, 0, 0);
                Shot("04-three-quarter-spread.png", whole, quarter, 0, 0);
                Shot("05-back-folded.png", whole, back, 1, 0);
                wingSocket.gameObject.SetActive(false);
                var bowAngle = new Vector3(-1, .12f, .4f);
                void BowShot(string name, float seconds)
                {
                    bow.Sample(seconds);
                    draw.Refresh();
                    Capture(camera, target, pixels, bowFrame, bowAngle, Path.Combine(output, name));
                    shots.Add(name);
                }
                BowShot("06-bow-rest.png", 0);
                BowShot("07-bow-draw.png", drawTime);
                BowShot("08-bow-release-mid.png", releaseMiddle);
                BowShot("09-bow-released.png", bow.Clip.length);
                wingSocket.gameObject.SetActive(true);
                string FrameHash(int index) => Hash(Path.Combine(output, shots[index]));
                Require(FrameHash(2) != FrameHash(4) && FrameHash(5) != FrameHash(6) &&
                    FrameHash(6) != FrameHash(7) && FrameHash(7) != FrameHash(8),
                    "The fixed cameras must show the actual different accessory morph states.");

                string sequences = Path.Combine(output, "sequences");
                Directory.CreateDirectory(sequences);
                SequenceFrame[] Sequence(Morph shape, string name, Bounds frame, Vector3 direction, float[] times)
                {
                    var sequence = times.Select((seconds, index) =>
                    {
                        float normalized = shape.Sample(seconds);
                        draw.Refresh();
                        string file = $"sequences/{name}-{index + 1:D2}.png";
                        string destination = Path.Combine(output, file);
                        Capture(camera, target, pixels, frame, direction, destination);
                        return new SequenceFrame { frame = file, seconds = seconds, weight = normalized, sha256 = Hash(destination) };
                    }).ToArray();
                    Require(sequence.Select(frame => frame.sha256).Distinct().Count() >= 4,
                        "The fixed-camera sequence must contain distinct rendered deformations.");
                    return sequence;
                }
                var wingSequence = Sequence(wing, "wings-fold-to-spread", whole,
                    new Vector3(.32f, .13f, -1), new[] { 0f, .10f, .20f, .30f, .40f, .50f });
                Require(wingSequence[0].weight > .95f && wingSequence[^1].weight < .08f,
                    "Expected the imported wing expansion sequence to start folded and end spread.");
                wingSocket.gameObject.SetActive(false);
                var bowSequence = Sequence(bow, "bow-draw-to-release", bowFrame, bowAngle,
                    new[] { 0f, .25f, .50f, drawTime, releaseMiddle, bow.Clip.length });
                wingSocket.gameObject.SetActive(true);

                Vector3 wingStart = wingSocket.position, bowStart = bowSocket.position;
                float wingTravel = 0, bowTravel = 0;
                foreach (float time in new[] { .15f, .50f, .85f })
                {
                    clip.SampleAnimation(animator.gameObject, time * clip.length);
                    float fold = wing.Sample(time * wing.Clip.length);
                    wingTravel = Mathf.Max(wingTravel, Vector3.Distance(wingStart, wingSocket.position));
                    bowTravel = Mathf.Max(bowTravel, Vector3.Distance(bowStart, bowSocket.position));
                    draw.Refresh();
                    var movementFrame = whole;
                    movementFrame.Encapsulate(BoundsFor(model));
                    Shot($"{10 + shots.Count - 9:D2}-walk.png", movementFrame, quarter, fold, 0);
                }
                Require(wingTravel > .001f && bowTravel > .001f, "The actual retargeted walk did not move both sockets.");
                Require(Hash(path) == prefabHash, "The canonical prefab changed during private evidence capture.");
                var facts = new Facts {
                    prefabSha256 = prefabHash, wingsSocketParent = wingSocket.parent.name, bowSocketParent = bowSocket.parent.name,
                    wingsTriangles = wingTriangles, bowTriangles = bowTriangles, assembledTriangles = assembled,
                    wingFoldDeltaMeters = wingDelta, bowDrawDeltaMeters = drawDelta, releaseRestResidualMeters = releaseDelta,
                    walkWingSocketTravelMeters = wingTravel, walkBowSocketTravelMeters = bowTravel, mappedWalkJoints = joints,
                    wingsClip = wing.Clip.name, bowClip = bow.Clip.name,
                    spreadMeanDepthFromChestMeters = spreadDepth, foldMeanDepthFromChestMeters = foldDepth,
                    wingPreviewYawDegrees = wingYaw, bowPreviewYawDegrees = bowFit.yaw,
                    bowGripToPalmBeforeMeters = bowFit.before, bowGripToPalmAfterMeters = bowFit.after,
                    drawNockToFreePalmMeters = bowFit.free, bowRestWeight = restWeight, bowDrawWeight = drawnWeight,
                    bowReleaseMiddleWeight = middleWeight, bowReleasedWeight = releasedWeight,
                    wingSequence = wingSequence, bowSequence = bowSequence,
                    frameCount = shots.Count + wingSequence.Length + bowSequence.Length, frames = shots.ToArray(),
                };
                File.WriteAllText(Path.Combine(output, "icarus-h2-accessory-motion.json"), JsonUtility.ToJson(facts, true) + "\n");
                Debug.Log("Private Icarus H2 morph assembly and motion preview completed.");
            }
            finally
            {
                GraphicsSettings.defaultRenderPipeline = previousPipeline;
                QualitySettings.renderPipeline = previousQualityPipeline;
                Object.DestroyImmediate(retargeted);
                Object.DestroyImmediate(stage);
                target.Release();
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(pixels);
            }
        }

        private static GameObject Import(string path)
        {
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Require(root != null, $"Failed to import {path}.");
            return root;
        }

        private static Transform Socket(GameObject root, Vrm10Instance vrm, string name, HumanBodyBones parent)
        {
            var socket = root.GetComponentsInChildren<Transform>(true).Single(node => node.name == name);
            Require(vrm.TryGetBoneTransform(parent, out var joint) && socket.parent == joint, $"{name} is not on mapped {parent}.");
            return socket;
        }

        private sealed class Morph
        {
            public readonly GameObject Root;
            public readonly AnimationClip Clip;
            public readonly (SkinnedMeshRenderer renderer, int index)[] Skins;

            public Morph(GameObject root, string shape, AnimationClip clip)
            {
                Root = root;
                Clip = clip;
                Require(clip != null && clip.length > 0, $"The imported candidate has no timed {shape} clip.");
                Skins = root.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                    .Where(renderer => renderer.sharedMesh != null)
                    .Select(renderer => (renderer, index: renderer.sharedMesh.GetBlendShapeIndex(shape)))
                    .Where(entry => entry.index >= 0).ToArray();
                Require(Skins.Length > 0, $"The imported candidate has no {shape} morph.");
            }

            public float Sample(float seconds)
            {
                Clip.SampleAnimation(Root, seconds);
                return Skins[0].renderer.GetBlendShapeWeight(Skins[0].index) / 100;
            }

            public void Set(float normalized)
            {
                foreach (var (renderer, index) in Skins) renderer.SetBlendShapeWeight(index, normalized * 100);
            }
        }

        private static Morph Attach(Transform socket, string oldName, string path, string shape, string action)
        {
            var old = socket.Find(oldName);
            Require(old != null, $"The reference prefab is missing its {oldName} attachment.");
            Object.DestroyImmediate(old.gameObject);
            socket.gameObject.SetActive(true);
            var candidate = Object.Instantiate(Import(path), socket, false);
            candidate.transform.SetLocalPositionAndRotation(Vector3.zero, Quaternion.identity);
            candidate.transform.localScale = Vector3.one;
            var clip = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().SingleOrDefault(item => item.name == action);
            return new Morph(candidate, shape, clip);
        }

        private static (Animator animator, AnimationClip clip, int joints) Retarget(GameObject model, Vrm10Instance vrm,
            GameObject sourceVrm, Transform stage)
        {
            var motion = Object.Instantiate(Import(Walk), stage);
            try
            {
                var source = motion.GetComponentsInChildren<Animator>(true).Single();
                var clip = motion.GetComponentInChildren<Animation>(true)?.clip;
                var avatar = sourceVrm.GetComponentsInChildren<Animator>(true).Single().avatar;
                var animator = model.GetComponentsInChildren<Animator>(true).Single();
                Require(clip != null && clip.length > 0 && source.avatar != null && source.avatar.isHuman &&
                    avatar != null && avatar.isHuman && animator.avatar != null && !animator.avatar.isHuman,
                    "Expected the private VRMA, owner Humanoid avatar and existing Generic review prefab.");
                animator.runtimeAnimatorController = null;
                var joints = Enumerable.Range(0, (int)HumanBodyBones.LastBone)
                    .Select(index => vrm.TryGetBoneTransform((HumanBodyBones)index, out var joint) ? joint : null)
                    .Where(joint => joint != null).ToArray();
                Require(joints.Length >= 20 && vrm.TryGetBoneTransform(HumanBodyBones.Hips, out _), "Incomplete owner VRM mapping.");
                vrm.TryGetBoneTransform(HumanBodyBones.Hips, out var hips);
                return (animator, IcarusCharakuruMotionReview.BakeMotion(clip, source, animator, avatar, animator.avatar, joints, hips),
                    joints.Length);
            }
            finally { Object.DestroyImmediate(motion); }
        }

        private static Vector3[] Measure(Morph shape, float weight)
        {
            shape.Set(weight);
            return MeasureSample(shape);
        }

        private static Vector3[] MeasureSample(Morph shape)
        {
            var scratch = new Mesh();
            try
            {
                return shape.Skins.SelectMany(entry => {
                    entry.renderer.BakeMesh(scratch);
                    return scratch.vertices.Select(entry.renderer.transform.TransformPoint).ToArray();
                }).ToArray();
            }
            finally { Object.DestroyImmediate(scratch); }
        }

        private static float FitFoldAxis(Morph wing, Vector3 forward)
        {
            var spread = Measure(wing, 0);
            var folded = Measure(wing, 1);
            if (MeanDepth(folded, Vector3.zero, forward) <= MeanDepth(spread, Vector3.zero, forward))
                return 0;
            wing.Root.transform.rotation = Quaternion.AngleAxis(180, Vector3.up) * wing.Root.transform.rotation;
            return 180;
        }

        private static float MeanDepth(Vector3[] vertices, Vector3 origin, Vector3 forward) =>
            vertices.Average(vertex => Vector3.Dot(vertex - origin, forward));

        private static (float before, float after, float free, float yaw) FitBow(Morph bow, Vrm10Instance vrm, Transform wrist)
        {
            var right = Palm(vrm, wrist, HumanBodyBones.RightIndexProximal, HumanBodyBones.RightLittleProximal);
            Require(vrm.TryGetBoneTransform(HumanBodyBones.LeftHand, out var freeWrist), "The source VRM has no mapped free hand.");
            var free = Palm(vrm, freeWrist, HumanBodyBones.LeftIndexProximal, HumanBodyBones.LeftLittleProximal);
            var rest = Measure(bow, 0);
            var drawn = Measure(bow, 1);
            var root = bow.Root.transform;
            int nock = 0;
            for (int i = 1; i < rest.Length; i++)
                if ((drawn[i] - rest[i]).sqrMagnitude > (drawn[nock] - rest[nock]).sqrMagnitude)
                    nock = i;
            var handle = Enumerable.Range(0, rest.Length)
                .Where(i => Mathf.Abs(root.InverseTransformPoint(rest[i]).y) < .08f && Vector3.Distance(rest[i], drawn[i]) < .02f)
                .Select(i => root.InverseTransformPoint(rest[i])).ToArray();
            Require(handle.Length > 0, "The imported bow has no stable center grip band.");
            var grip = handle.Aggregate(Vector3.zero, (sum, point) => sum + point) / handle.Length;
            float before = Vector3.Distance(root.TransformPoint(grip), right);
            var axis = root.up;
            var drawPlane = Vector3.ProjectOnPlane(drawn[nock] - rest[nock], axis);
            var freePlane = Vector3.ProjectOnPlane(free - right, axis);
            Require(drawPlane.sqrMagnitude > .0001f && freePlane.sqrMagnitude > .0001f,
                "The draw axis and free hand must define a measurable bow plane.");
            float yaw = Vector3.SignedAngle(drawPlane, freePlane, axis);
            root.rotation = Quaternion.AngleAxis(yaw, axis) * root.rotation;
            root.position += right - root.TransformPoint(grip);
            float after = Vector3.Distance(root.TransformPoint(grip), right);
            float freeDistance = Vector3.Distance(Measure(bow, 1)[nock], free);
            return (before, after, freeDistance, yaw);
        }

        private static Vector3 Palm(Vrm10Instance vrm, Transform wrist, HumanBodyBones index, HumanBodyBones little)
        {
            bool hasIndex = vrm.TryGetBoneTransform(index, out var first);
            bool hasLittle = vrm.TryGetBoneTransform(little, out var last);
            Require(hasIndex && hasLittle, "The source VRM has no mapped palm landmarks.");
            return Vector3.Lerp(wrist.position, (first.position + last.position) / 2, .75f);
        }

        private static float Delta(Vector3[] a, Vector3[] b)
        {
            Require(a.Length > 0 && a.Length == b.Length, "Imported shape vertex topology changed.");
            float peak = a.Zip(b, (rest, moved) => Vector3.Distance(rest, moved)).Max();
            Require(float.IsFinite(peak), "Non-finite imported accessory displacement.");
            return peak;
        }

        // Edit-mode GPU skins can stay on their bind pose even after a new
        // morph or clip has been sampled. Draw the actual CPU-sampled vertices
        // with the source mesh's materials and discard the draw copies on exit.
        internal sealed class SampledSurfaceDraw : IDisposable
        {
            private readonly (SkinnedMeshRenderer skin, MeshFilter filter, Mesh sample)[] surfaces;

            public SampledSurfaceDraw(GameObject root)
            {
                surfaces = root.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                    .Where(skin => skin.enabled && skin.sharedMesh != null)
                    .Select(skin =>
                    {
                        var draw = new GameObject(skin.name + " sampled surface");
                        draw.transform.SetParent(skin.transform, false);
                        draw.AddComponent<MeshRenderer>().sharedMaterials = skin.sharedMaterials;
                        var filter = draw.AddComponent<MeshFilter>();
                        skin.enabled = false;
                        return (skin, filter, new Mesh());
                    }).ToArray();
            }

            public void Refresh()
            {
                foreach (var (skin, filter, sample) in surfaces)
                {
                    skin.BakeMesh(sample);
                    Require(sample.vertexCount == skin.sharedMesh.vertexCount, "The sampled surface lost imported vertices.");
                    sample.RecalculateBounds();
                    filter.sharedMesh = sample;
                }
            }

            public void Dispose()
            {
                foreach (var (_, filter, sample) in surfaces)
                {
                    if (filter != null) Object.DestroyImmediate(filter.gameObject);
                    Object.DestroyImmediate(sample);
                }
            }
        }

        internal static Bounds BoundsFor(GameObject model)
        {
            var renderer = model.GetComponentsInChildren<Renderer>(false).Where(value => value.enabled).ToArray();
            Require(renderer.Length > 0, "Preview has no visible renderers.");
            var bounds = renderer[0].bounds;
            foreach (var part in renderer.Skip(1)) bounds.Encapsulate(part.bounds);
            return bounds;
        }

        private static int Triangles(GameObject model) =>
            model.GetComponentsInChildren<MeshFilter>(false).Where(filter => filter.sharedMesh != null)
                .Sum(filter => filter.sharedMesh.triangles.Length / 3) +
            model.GetComponentsInChildren<SkinnedMeshRenderer>(false).Where(renderer => renderer.sharedMesh != null)
                .Sum(renderer => renderer.sharedMesh.triangles.Length / 3);

        private static Camera Studio(Transform stage, RenderTexture target)
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.36f, .39f, .47f);
            RenderSettings.ambientEquatorColor = new Color(.19f, .21f, .26f);
            RenderSettings.ambientGroundColor = new Color(.09f, .09f, .13f);
            RenderSettings.reflectionIntensity = .25f;
            foreach (var source in new[] {
                (new Vector3(28, -32, 0), .45f, new Color(1, .96f, .89f)),
                (new Vector3(24, 147, 0), .14f, new Color(.72f, .81f, 1)),
            })
            {
                var light = new GameObject("Studio light").AddComponent<Light>();
                light.transform.SetParent(stage, false);
                light.type = LightType.Directional;
                light.transform.rotation = Quaternion.Euler(source.Item1);
                light.intensity = source.Item2;
                light.color = source.Item3;
            }
            var camera = new GameObject("H2 review camera").AddComponent<Camera>();
            camera.transform.SetParent(stage, false);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.11f, .12f, .17f);
            camera.orthographic = true;
            camera.nearClipPlane = .01f;
            camera.farClipPlane = 50;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            target.Create();
            return camera;
        }

        internal static void Capture(Camera camera, RenderTexture target, Texture2D pixels, Bounds frame,
            Vector3 direction, string path)
        {
            camera.transform.position = frame.center + direction.normalized * (frame.size.magnitude + 1);
            camera.transform.LookAt(frame.center);
            camera.orthographicSize = frame.size.magnitude * .57f;
            RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
            var previous = RenderTexture.active;
            try
            {
                RenderTexture.active = target;
                pixels.ReadPixels(new Rect(0, 0, Size, Size), 0, 0);
                pixels.Apply();
                byte[] png = pixels.EncodeToPNG();
                Require(png != null && png.Length > 1000, "The Unity URP render produced no usable image.");
                File.WriteAllBytes(path, png);
            }
            finally { RenderTexture.active = previous; }
        }

        private static string Hash(string file)
        {
            string path = Path.Combine(Path.GetDirectoryName(Application.dataPath), file);
            using var sha = SHA256.Create();
            using var source = File.OpenRead(path);
            return BitConverter.ToString(sha.ComputeHash(source)).Replace("-", "").ToLowerInvariant();
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
