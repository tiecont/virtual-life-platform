using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Aetheria.PetArena.Vfx;
using UniVRM10;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.Playables;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.Timeline;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    public static class IcarusPerformanceStage
    {
        const string Base = "Assets/Aetheria/ArtStudies/Icarus/";
        const string Body = Base + "Source/Icarus.vrm";
        const string BodyHash = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a";
        const string WalkHash = "50b27c7363ff844ccb0b71373794326583a601128e90f14de0c3df7bfefe9161";
        const string Voice = "Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Audio/Vocals/icarus_kit_signature.ogg";
        const string Mixer = "Assets/Aetheria/Features/PetArena/Vfx/Audio/AetheriaArenaMixer.mixer";

        [Serializable]
        sealed class Report
        {
            public string scene, modelSha256 = BodyHash, walkSha256 = WalkHash, voiceAsset = Voice, graphics, unity;
            public string status = "PROTOTYPE", expressions, exportProfile;
            public double duration, cueStart, walkStart = PerformanceSequence.WalkStart, overlap = PerformanceSequence.Transition;
            public float idleHeadDegrees, idleEyeDegrees, plantedFootDeltaMeters, walkLegDegrees;
            public int morphTargets, trackedBones, frameWidth, frameHeight, fps, frames;
            public string[] stills;
        }

        // Invoked in a private batch Editor. Keep the generated scene and Timeline together
        // in this project so later Play Mode, Recorder and player builds use the same bindings.
        public static void Build()
        {
            var output = Environment.GetEnvironmentVariable("AETHERIA_PERFORMANCE_OUTPUT");
            var source = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_REVIEW_MOTION");
            var export = Environment.GetEnvironmentVariable("AETHERIA_PERFORMANCE_EXPORT") ?? "stills";
            if (!Application.isBatchMode || !Path.IsPathRooted(output ?? "") || File.Exists(output) ||
                Directory.Exists(output) || !Path.IsPathRooted(source ?? "") || !File.Exists(source))
                throw new ArgumentException("Provide a new absolute output directory and the local Charakuru walk to the batch Editor.");
            if (export != "stills" && export != "preview" && export != "4k60")
                throw new ArgumentException("Choose stills, preview, or 4k60 for AETHERIA_PERFORMANCE_EXPORT.");
            if (Hash(source) != WalkHash || Hash(Path.Combine(Application.dataPath, Body.Substring(7))) != BodyHash)
                throw new InvalidDataException("Performance source fingerprints differ from the designated development intake.");
            var scene = SceneManager.GetActiveScene();
            if (scene.isDirty || !string.IsNullOrEmpty(scene.path) || SceneManager.sceneCount != 1)
                throw new InvalidOperationException("Start from a clean private batch bootstrap scene.");
            Directory.CreateDirectory(output);
            var folder = "Assets/IcarusPerformance-" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(folder));
            try
            {
                foreach (var item in scene.GetRootGameObjects()) Object.DestroyImmediate(item);
                var path = folder + "/Walk.vrma";
                File.Copy(source, Path.Combine(Application.dataPath, path.Substring(7)));
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                if (AssetDatabase.LoadAssetAtPath<GameObject>(Body) == null)
                    AssetDatabase.ImportAsset(Body, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                var model = (GameObject)PrefabUtility.InstantiatePrefab(Asset<GameObject>(Body));
                var vrm = model.GetComponentInChildren<Vrm10Instance>();
                vrm.UpdateType = Vrm10Instance.UpdateTypes.None;
                var actor = model.GetComponentInChildren<Animator>();
                actor.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                actor.runtimeAnimatorController = null;
                var human = actor.avatar;
                actor.avatar = Asset<Avatar>(Base + "Modular/IcarusReviewAvatar.asset");
                var skeleton = Enumerable.Range(0, (int)HumanBodyBones.LastBone)
                    .Select(index => vrm.TryGetBoneTransform((HumanBodyBones)index, out var joint) ? joint : null)
                    .Where(joint => joint != null).ToArray();
                Transform Bone(HumanBodyBones kind) => vrm.TryGetBoneTransform(kind, out var joint)
                    ? joint : throw new InvalidDataException("Missing required performance joint " + kind);
                var motionModel = (GameObject)PrefabUtility.InstantiatePrefab(Asset<GameObject>(path));
                AnimationClip walk;
                try
                {
                    var motion = motionModel.GetComponentInChildren<Animation>(true).clip;
                    walk = IcarusCharakuruMotionReview.BakeMotion(motion, motionModel.GetComponentInChildren<Animator>(true),
                        actor, human, actor.avatar, skeleton, Bone(HumanBodyBones.Hips));
                }
                finally { Object.DestroyImmediate(motionModel); }
                AssetDatabase.CreateAsset(walk, folder + "/Walk.anim");
                var idle = IcarusBodyPerformance.BakeIdle(actor, vrm);
                AssetDatabase.CreateAsset(idle, folder + "/Idle.anim");
                var voice = Asset<AudioClip>(Voice);
                double cueStart = PerformanceSequence.WalkStart + walk.length - PerformanceSequence.Transition + PerformanceSequence.ClosingBeat;
                float end = (float)(cueStart + voice.length + .25);
                var eyes = (Bone(HumanBodyBones.LeftEye).position + Bone(HumanBodyBones.RightEye).position) / 2;
                var foot = Bone(HumanBodyBones.LeftFoot);
                float height = (eyes.y - foot.position.y) * 1.15f;
                var center = new Vector3(eyes.x, eyes.y - height * .40f, eyes.z);
                var rig = new GameObject("Camera rig").AddComponent<Animator>();
                rig.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                var camera = new GameObject("Lens").AddComponent<Camera>();
                camera.tag = "MainCamera";
                camera.transform.SetParent(rig.transform, false);
                camera.fieldOfView = 32;
                camera.nearClipPlane = .03f;
                camera.farClipPlane = 50;
                camera.backgroundColor = new Color(.14f, .16f, .20f);
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
                camera.gameObject.AddComponent<AudioListener>();
                var shot = CameraMotion(camera, eyes, center, height, (float)cueStart, end);
                AssetDatabase.CreateAsset(shot, folder + "/Camera.anim");
                var audio = new GameObject("Signature vocal").AddComponent<AudioSource>();
                audio.playOnAwake = false;
                audio.outputAudioMixerGroup = Asset<AudioMixer>(Mixer).FindMatchingGroups("Voice").Single();
                var particles = ElementCue(folder, center + new Vector3(-.31f, .08f, .12f) * height, height);
                LightRig();
                var director = PerformanceSequence.Create(actor, idle, walk, rig, shot, audio, voice, particles, folder + "/Performance.playable");
                director.playOnAwake = true;
                var report = new Report {
                    scene = folder + "/Performance.unity", trackedBones = skeleton.Length, cueStart = cueStart,
                    duration = director.duration, graphics = SystemInfo.graphicsDeviceType.ToString(), unity = Application.unityVersion,
                    exportProfile = export, morphTargets = model.GetComponentsInChildren<SkinnedMeshRenderer>()
                        .Sum(renderer => renderer.sharedMesh.blendShapeCount),
                    expressions = "Mapped eye bones animated. Baseline has no bound blink or vowel deformation."
                };
                PrefabUtility.RecordPrefabInstancePropertyModifications(actor);
                PrefabUtility.RecordPrefabInstancePropertyModifications(vrm);
                if (!EditorSceneManager.SaveScene(scene, report.scene)) throw new IOException("Could not save the performance scene.");
                director.RebuildGraph();
                void Sample(double time) { director.time = time; director.Evaluate(); }
                var head = Bone(HumanBodyBones.Head);
                var eye = Bone(HumanBodyBones.LeftEye);
                var leg = Bone(HumanBodyBones.LeftUpperLeg);
                Sample(.01);
                var headStart = head.localRotation;
                var eyeStart = eye.localRotation;
                var footStart = foot.position;
                Sample(1.55);
                report.idleHeadDegrees = Quaternion.Angle(headStart, head.localRotation);
                report.idleEyeDegrees = Quaternion.Angle(eyeStart, eye.localRotation);
                report.plantedFootDeltaMeters = Vector3.Distance(footStart, foot.position);
                Sample(PerformanceSequence.WalkStart + walk.length * .35);
                var midStep = leg.localRotation;
                Sample(PerformanceSequence.WalkStart + walk.length * .66);
                report.walkLegDegrees = Quaternion.Angle(midStep, leg.localRotation);
                if (report.idleHeadDegrees < 1 || report.idleEyeDegrees < 1 || report.walkLegDegrees < .5 ||
                    report.plantedFootDeltaMeters > .002)
                    throw new InvalidDataException("Performance scene failed joint motion or idle foot-lock verification. " + JsonUtility.ToJson(report));
                if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null && export != "stills")
                    throw new InvalidOperationException("Frame export requires a private graphics device.");
                if (SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null) Capture(camera, director, output, report);
                File.WriteAllText(Path.Combine(output, "performance-report.json"), JsonUtility.ToJson(report, true));
                Debug.Log("Saved private body performance study " + report.scene);
            }
            catch
            {
                AssetDatabase.DeleteAsset(folder);
                throw;
            }
        }

        static T Asset<T>(string path) where T : Object =>
            AssetDatabase.LoadAssetAtPath<T>(path) ?? throw new InvalidDataException("Missing " + path);

        static string Hash(string path)
        {
            using var sha = SHA256.Create();
            using var file = File.OpenRead(path);
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
        }

        static AnimationClip CameraMotion(Camera camera, Vector3 eyes, Vector3 center, float height, float cue, float end)
        {
            var clip = new AnimationClip { name = "Portrait to full-body choreography", frameRate = 60 };
            var keys = new[] {
                (0f, eyes - Vector3.up * height * .055f, new Vector3(-.21f, .025f, .89f)),
                (2.15f, eyes - Vector3.up * height * .045f, new Vector3(.07f, .018f, .78f)),
                (3.5f, center, new Vector3(.19f, .09f, 2.08f)),
                (cue - .55f, center, new Vector3(.29f, .09f, 2.05f)),
                (cue + .42f, center + Vector3.up * height * .1f, new Vector3(.07f, .06f, 1.64f)),
                (end + .02f, center + Vector3.up * height * .12f, new Vector3(-.13f, .07f, 1.59f))
            };
            var channels = Enumerable.Range(0, 7).Select(_ => new AnimationCurve()).ToArray();
            foreach (var (time, target, offset) in keys)
            {
                var pos = target + offset * height;
                var rot = Quaternion.LookRotation(target - pos, Vector3.up);
                for (int i = 0; i < 3; i++) channels[i].AddKey(time, pos[i]);
                for (int i = 0; i < 4; i++) channels[3 + i].AddKey(time, rot[i]);
            }
            for (int i = 0; i < channels.Length; i++)
            {
                for (int k = 0; k < channels[i].length; k++) AnimationUtility.SetKeyLeftTangentMode(channels[i], k, AnimationUtility.TangentMode.ClampedAuto);
                for (int k = 0; k < channels[i].length; k++) AnimationUtility.SetKeyRightTangentMode(channels[i], k, AnimationUtility.TangentMode.ClampedAuto);
                var property = i < 3 ? "m_LocalPosition." + "xyz"[i] : "m_LocalRotation." + "xyzw"[i - 3];
                clip.SetCurve(camera.name, typeof(Transform), property, channels[i]);
            }
            clip.EnsureQuaternionContinuity();
            return clip;
        }

        static ParticleSystem ElementCue(string folder, Vector3 point, float height)
        {
            var fx = new GameObject("Fire cue").AddComponent<ParticleSystem>();
            fx.transform.position = point;
            fx.transform.rotation = Quaternion.Euler(-75, 0, 0);
            fx.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = fx.main;
            main.playOnAwake = false;
            main.loop = false;
            main.duration = 1.2f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(.32f, .72f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(height * .14f, height * .45f);
            main.startSize = new ParticleSystem.MinMaxCurve(height * .012f, height * .026f);
            main.startColor = new ParticleSystem.MinMaxGradient(ArenaPresentationKit.ElementColor(ArenaElement.Fire), new Color(1, .83f, .34f));
            var emission = fx.emission;
            emission.rateOverTime = 0;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0, 18), new ParticleSystem.Burst(.14f, 9) });
            var shape = fx.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 26;
            shape.radius = height * .035f;
            var size = fx.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.EaseInOut(0, 1, 1, 0));
            var material = new Material(Resources.Load<Shader>("Wave1Vfx"));
            material.SetTexture("_BaseMap", AssetDatabase.GetBuiltinExtraResource<Texture2D>("Default-Particle.psd"));
            AssetDatabase.CreateAsset(material, folder + "/Embers.mat");
            fx.GetComponent<ParticleSystemRenderer>().sharedMaterial = material;
            return fx;
        }

        static void LightRig()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.36f, .39f, .47f);
            RenderSettings.ambientEquatorColor = new Color(.19f, .21f, .26f);
            RenderSettings.ambientGroundColor = new Color(.09f, .09f, .13f);
            RenderSettings.reflectionIntensity = .25f;
            void Light(string name, Color tint, float intensity, Vector3 angles)
            {
                var light = new GameObject(name).AddComponent<Light>();
                light.type = LightType.Directional;
                light.color = tint;
                light.intensity = intensity;
                light.transform.rotation = Quaternion.Euler(angles);
            }
            Light("Soft key", new Color(1, .95f, .91f), .57f, new Vector3(32, 155, 0));
            Light("Cool fill", new Color(.75f, .83f, 1), .14f, new Vector3(12, 223, 0));
        }

        static void Capture(Camera camera, PlayableDirector director, string output, Report report)
        {
            report.frameWidth = report.exportProfile == "4k60" ? 3840 : 960;
            report.frameHeight = report.exportProfile == "4k60" ? 2160 : 540;
            report.fps = report.exportProfile == "4k60" ? 60 : 24;
            var texture = new RenderTexture(report.frameWidth, report.frameHeight, 24);
            var pixels = new Texture2D(texture.width, texture.height, TextureFormat.RGB24, false);
            var previous = RenderTexture.active;
            var previousTarget = camera.targetTexture;
            try
            {
                if (!texture.Create()) throw new IOException("Could not allocate the offline render target.");
                camera.targetTexture = texture;
                void Frame(double time, string file)
                {
                    director.time = time;
                    director.Evaluate();
                    camera.Render();
                    RenderTexture.active = texture;
                    pixels.ReadPixels(new Rect(0, 0, texture.width, texture.height), 0, 0);
                    pixels.Apply(false);
                    File.WriteAllBytes(Path.Combine(output, file), pixels.EncodeToPNG());
                }
                report.stills = new[] { "portrait.png", "glance.png", "walk.png", "fire-cue.png" };
                var times = new[] { .05, 1.55, PerformanceSequence.WalkStart + .70, report.cueStart + .24 };
                for (int i = 0; i < times.Length; i++) Frame(times[i], report.stills[i]);
                if (report.exportProfile != "stills")
                {
                    report.frames = (int)Math.Ceiling(report.duration * report.fps);
                    Directory.CreateDirectory(Path.Combine(output, "frames"));
                    for (int i = 0; i < report.frames; i++) Frame(i / (double)report.fps, $"frames/frame-{i:D5}.png");
                }
            }
            finally
            {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previous;
                texture.Release();
                Object.DestroyImmediate(texture);
                Object.DestroyImmediate(pixels);
            }
        }
    }
}
