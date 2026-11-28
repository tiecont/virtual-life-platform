using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using UniVRM10;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.Recorder;
using UnityEditor.Recorder.Input;
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
    // Recorder needs the Editor's Game view and end-of-frame callbacks. The
    // batch stage builds a disposable scene, then a private graphical Editor
    // records it through the same bound model and Timeline.
    public static class IcarusCinematicRecording
    {
        private const string OutputVariable = "AETHERIA_ICARUS_REVIEW_OUTPUT";
        private const string SessionKey = "aetheria.icarus.cinematic.recording";
        private const string RequestName = "recorder-stage.json";
        private const string CameraName = "Icarus Recorder Camera";
        private const int FrameRate = 24;
        private const int ImageSize = 720;
        private static RecorderController controller;
        private static RecorderControllerSettings controllerSettings;
        private static ImageRecorderSettings imageSettings;
        private static PlayableDirector director;
        private static CinemachineBrain brain;
        private static CinemachineCamera shotCamera;
        private static Transform hips;
        private static IcarusAccessoryReview accessories;
        private static Vector3 firstHipPosition;
        private static Quaternion firstHipRotation;
        private static double deadline, clipStart;
        private static int readyFrame;
        private static float maxHipDistance;
        private static float maxHipAngle;

        [Serializable]
        private sealed class RecordingStage
        {
            public string scenePath;
            public string motionReportHash;
            public double startSeconds;
            public double durationSeconds;
            public bool showcaseAccessories;
        }

        [Serializable]
        private sealed class RecordingReport
        {
            public string motionReportHash, graphicsDevice, scenePath, recorder, camera;
            public int width, height, fps;
            public bool productionReady;
            public double startSeconds, recordedTimelineSeconds;
            public float maxNearWhitePercent, minForegroundPercent, maxHipDistance, maxHipAngle;
            public string[] frames, frameSha256;
            public IcarusAccessoryReview.Facts accessories;
        }

        internal static void Stage(Scene scene, string folder, string output, Transform root, Vrm10Instance vrm,
            SkinnedMeshRenderer[] skins, PlayableDirector boundDirector, TimelineClip take, bool showcaseAccessories)
        {
            Require(vrm.TryGetBoneTransform(HumanBodyBones.Hips, out var hipsBone), "Icarus Recorder requires mapped hips.");
            if (SceneManager.GetActiveScene() != scene)
                Require(SceneManager.SetActiveScene(scene), "Could not activate the private recording scene.");
            foreach (var camera in scene.GetRootGameObjects().SelectMany(item => item.GetComponentsInChildren<Camera>()))
            {
                camera.enabled = false;
                if (camera.CompareTag("MainCamera")) camera.tag = "Untagged";
            }
            foreach (var light in scene.GetRootGameObjects().SelectMany(item => item.GetComponentsInChildren<Light>()))
                light.enabled = false;
            AddLight(root, "Icarus key", new Color(1f, .95f, .91f), .57f, Quaternion.Euler(32, 155, 0));
            AddLight(root, "Icarus fill", new Color(.75f, .83f, 1f), .14f, Quaternion.Euler(12, 223, 0));
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.36f, .39f, .47f);
            RenderSettings.ambientEquatorColor = new Color(.19f, .21f, .26f);
            RenderSettings.ambientGroundColor = new Color(.09f, .09f, .13f);
            RenderSettings.reflectionIntensity = .25f;

            var bounds = skins[0].bounds;
            foreach (var skin in skins)
            {
                bounds.Encapsulate(skin.bounds);
                skin.updateWhenOffscreen = true;
            }

            if (showcaseAccessories) bounds = IcarusAccessoryReview.Frame(vrm, bounds);

            var outputCamera = new GameObject(CameraName).AddComponent<Camera>();
            outputCamera.transform.SetParent(root, false);
            outputCamera.tag = "MainCamera";
            outputCamera.clearFlags = CameraClearFlags.SolidColor;
            outputCamera.backgroundColor = new Color(.14f, .16f, .20f);
            outputCamera.orthographic = true;
            outputCamera.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.35f;
            outputCamera.transform.position = bounds.center + new Vector3(1.45f, .18f, 5f);
            outputCamera.transform.LookAt(bounds.center);
            outputCamera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            var outputBrain = outputCamera.gameObject.AddComponent<CinemachineBrain>();
            outputBrain.UpdateMethod = CinemachineBrain.UpdateMethods.LateUpdate;
            outputBrain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.Cut, 0);

            // Offset from the mapped hips keeps framing attached to the real
            // animated model without parenting the camera to a rotating joint.
            var focus = new GameObject("Icarus framing target").transform;
            focus.SetParent(hipsBone, true);
            focus.position = bounds.center;
            var view = new GameObject("Icarus full-body Cinemachine shot").AddComponent<CinemachineCamera>();
            view.transform.SetParent(root, false);
            view.transform.SetPositionAndRotation(outputCamera.transform.position, outputCamera.transform.rotation);
            view.Lens = LensSettings.FromCamera(outputCamera);
            view.LookAt = focus;
            view.gameObject.AddComponent<CinemachineHardLookAt>();

            var timeline = (TimelineAsset)boundDirector.playableAsset;
            var track = timeline.CreateTrack<CinemachineTrack>(null, "Icarus review camera");
            var shot = track.CreateClip<CinemachineShot>();
            shot.start = 0;
            shot.duration = timeline.duration;
            var asset = (CinemachineShot)shot.asset;
            asset.VirtualCamera = new ExposedReference<CinemachineVirtualCameraBase>
                { exposedName = new PropertyName("icarus-recorder-camera") };
            boundDirector.SetReferenceValue(asset.VirtualCamera.exposedName, view);
            boundDirector.SetGenericBinding(track, outputBrain);
            boundDirector.Stop();
            boundDirector.timeUpdateMode = DirectorUpdateMode.GameTime;
            boundDirector.extrapolationMode = DirectorWrapMode.Hold;
            EditorUtility.SetDirty(asset);
            EditorUtility.SetDirty(track);
            EditorUtility.SetDirty(timeline);
            AssetDatabase.SaveAssetIfDirty(timeline);

            string scenePath = folder + "/IcarusRecorder.unity";
            Require(EditorSceneManager.SaveScene(scene, scenePath), "Could not save the private recording scene.");
            var request = new RecordingStage {
                scenePath = scenePath, startSeconds = take.start, durationSeconds = take.duration,
                motionReportHash = Hash(Path.Combine(output, "icarus-motion-review.json")),
                showcaseAccessories = showcaseAccessories
            };
            WriteJson(Path.Combine(output, RequestName), request);
            Debug.Log("Icarus Recorder stage: " + scenePath);
        }

        private static void AddLight(Transform root, string name, Color color, float intensity, Quaternion rotation)
        {
            var light = new GameObject(name).AddComponent<Light>();
            light.transform.SetParent(root, false);
            light.type = LightType.Directional;
            light.color = color;
            light.intensity = intensity;
            light.transform.rotation = rotation;
        }

        public static void Record()
        {
            try
            {
                Require(!Application.isBatchMode && SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null,
                    "Launch the direct graphical Editor in a private compositor for Recorder.");
                Require(!EditorApplication.isPlayingOrWillChangePlaymode, "Recorder requires an idle private Editor.");
                string output = Environment.GetEnvironmentVariable(OutputVariable);
                var stage = ReadStage(output);
                Require(!Directory.Exists(Path.Combine(output, "sequence")), "Recorder requires an unused sequence directory.");
                Require(Enumerable.Range(0, SceneManager.sceneCount).All(i => !SceneManager.GetSceneAt(i).isDirty),
                    "Recorder will not replace a scene with unsaved changes.");
                EditorSceneManager.OpenScene(stage.scenePath, OpenSceneMode.Single);
                SessionState.SetString(SessionKey, output);
                FocusGameView();
                EditorApplication.isPlaying = true;
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                EditorApplication.Exit(1);
            }
        }

        [InitializeOnLoadMethod]
        private static void Register() => EditorApplication.playModeStateChanged += OnPlayModeState;

        private static void OnPlayModeState(PlayModeStateChange change)
        {
            string output = SessionState.GetString(SessionKey, "");
            if (string.IsNullOrEmpty(output)) return;
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                try
                {
                    FocusGameView();
                    readyFrame = Time.frameCount + 3;
                    deadline = EditorApplication.timeSinceStartup + 420;
                    EditorApplication.update += WaitForGraphics;
                }
                catch (Exception error) { Fail(error); }
            }
            else if (change == PlayModeStateChange.EnteredEditMode)
            {
                SessionState.EraseString(SessionKey);
                int status = File.Exists(Path.Combine(output, "icarus-recorder-review.json")) ? 0 : 1;
                EditorApplication.delayCall += () => EditorApplication.Exit(status);
            }
        }

        private static void WaitForGraphics()
        {
            try
            {
                Require(EditorApplication.timeSinceStartup < deadline, "Private recording never reached an active Game view.");
                // The first URP Game view can import shaders and camera assets.
                // Let several real game frames complete before starting Recorder's
                // fixed timeline and bounded recording interval.
                if (Time.frameCount < readyFrame || EditorApplication.isUpdating || ShaderUtil.anythingCompiling)
                    return;
                EditorApplication.update -= WaitForGraphics;
                Begin(SessionState.GetString(SessionKey, ""));
            }
            catch (Exception error) { Fail(error); }
        }

        private static void Begin(string output)
        {
            var stage = ReadStage(output);
            Require(SceneManager.GetActiveScene().path == stage.scenePath, "Wrong recording scene entered Play Mode.");
            FocusGameView();
            var camera = Camera.main;
            Require(camera != null && camera.name == CameraName, "Recorder did not resolve the intended output camera.");
            brain = camera.GetComponent<CinemachineBrain>();
            shotCamera = Object.FindObjectsByType<CinemachineCamera>(FindObjectsSortMode.None).Single();
            director = Object.FindObjectsByType<PlayableDirector>(FindObjectsSortMode.None).Single();
            var timeline = (TimelineAsset)director.playableAsset;
            var track = timeline.GetOutputTracks().OfType<CinemachineTrack>().Single();
            var animation = timeline.GetOutputTracks().OfType<AnimationTrack>().Single();
            var shot = (CinemachineShot)track.GetClips().Single().asset;
            Require(brain != null && director.GetGenericBinding(track) == brain &&
                shot.VirtualCamera.Resolve(director) == shotCamera &&
                director.GetGenericBinding(animation) is Animator model && model.GetComponent<Vrm10Instance>() != null,
                "Recording Timeline lost its model or Cinemachine binding.");
            var vrm = ((Animator)director.GetGenericBinding(animation)).GetComponent<Vrm10Instance>();
            Require(vrm.TryGetBoneTransform(HumanBodyBones.Hips, out hips), "Recording lost the mapped Icarus hips.");
            accessories = stage.showcaseAccessories ? new IcarusAccessoryReview(vrm, camera, stage.startSeconds) : null;

            string sequence = Path.Combine(output, "sequence");
            Directory.CreateDirectory(sequence);
            imageSettings = ScriptableObject.CreateInstance<ImageRecorderSettings>();
            imageSettings.name = "Private Icarus PNG sequence";
            imageSettings.Enabled = true;
            imageSettings.OutputFormat = ImageRecorderSettings.ImageRecorderOutputFormat.PNG;
            imageSettings.imageInputSettings = new CameraInputSettings {
                Source = ImageSource.MainCamera, OutputWidth = ImageSize, OutputHeight = ImageSize, CaptureUI = false
            };
            imageSettings.OutputFile = Path.Combine(sequence, "icarus-<Frame>");
            controllerSettings = ScriptableObject.CreateInstance<RecorderControllerSettings>();
            controllerSettings.FrameRate = FrameRate;
            controllerSettings.ExitPlayMode = false;
            controllerSettings.SetRecordModeToFrameInterval(0, ExpectedFrames(stage) - 1);
            controllerSettings.AddRecorderSettings(imageSettings);
            controller = new RecorderController(controllerSettings);
            director.initialTime = stage.startSeconds;
            director.time = stage.startSeconds;
            director.Evaluate();
            firstHipPosition = hips.localPosition;
            firstHipRotation = hips.localRotation;
            maxHipDistance = maxHipAngle = 0f;
            controller.PrepareRecording();
            Require(controller.StartRecording(), "Unity Recorder refused the image sequence.");
            director.Play();
            clipStart = stage.startSeconds;
            deadline = EditorApplication.timeSinceStartup + 120;
            EditorApplication.update += Poll;
            Debug.Log($"Icarus Recorder started {ExpectedFrames(stage)} targeted PNG frames at {FrameRate} fps.");
        }

        private static void Poll()
        {
            try
            {
                Require(EditorApplication.timeSinceStartup < deadline, "Unity Recorder did not finish before the deadline.");
                maxHipDistance = Mathf.Max(maxHipDistance, Vector3.Distance(firstHipPosition, hips.localPosition));
                maxHipAngle = Mathf.Max(maxHipAngle, Quaternion.Angle(firstHipRotation, hips.localRotation));
                accessories?.Observe(director.time, director.time - clipStart);
                if (controller.IsRecording()) return;
                string output = SessionState.GetString(SessionKey, "");
                var stage = ReadStage(output);
                Require(brain.ActiveVirtualCamera is CinemachineCamera live && live == shotCamera, "The Icarus Cinemachine shot was not live at capture.");
                Require(director.time >= stage.startSeconds + stage.durationSeconds * .8 &&
                    (maxHipDistance > .001f || maxHipAngle > 1f), "The model-bound Timeline did not advance through the expected take.");
                Finish(output, stage);
                ClosePrivateEditor(0);
            }
            catch (Exception error) { Fail(error); }
        }

        private static void Finish(string output, RecordingStage stage)
        {
            var frames = Directory.GetFiles(Path.Combine(output, "sequence"), "icarus-*.png").OrderBy(path => path).ToArray();
            Require(frames.Length == ExpectedFrames(stage), $"Unity Recorder wrote {frames.Length} PNGs instead of {ExpectedFrames(stage)}.");
            var hashes = frames.Select(Hash).ToArray();
            Require(hashes.Distinct(StringComparer.Ordinal).Count() >= frames.Length / 2, "Recorder captured repeated static poses.");
            float minForeground = 100f, maxWhite = 0f;
            var image = new Texture2D(2, 2, TextureFormat.RGB24, false);
            try
            {
                foreach (string frame in frames)
                {
                    Require(image.LoadImage(File.ReadAllBytes(frame)) && image.width == ImageSize && image.height == ImageSize,
                        "Recorder emitted an unreadable or incorrectly sized PNG.");
                    var pixels = image.GetPixels32();
                    var background = pixels[0];
                    int foreground = 0, white = 0;
                    foreach (var pixel in pixels)
                    {
                        if (pixel.Equals(background)) continue;
                        foreground++;
                        if (pixel.r >= 250 && pixel.g >= 250 && pixel.b >= 250) white++;
                    }
                    Require(foreground > pixels.Length / 20 && foreground < pixels.Length * .9f,
                        "Recorder frame lacks a readable subject against the review background.");
                    minForeground = Mathf.Min(minForeground, 100f * foreground / pixels.Length);
                    maxWhite = Mathf.Max(maxWhite, 100f * white / foreground);
                }
            }
            finally { Object.DestroyImmediate(image); }
            Require(maxWhite < 25f, "Recorder frame exceeded the near-white foreground review limit.");
            WriteJson(Path.Combine(output, "icarus-recorder-review.json"), new RecordingReport {
                motionReportHash = stage.motionReportHash, graphicsDevice = SystemInfo.graphicsDeviceType.ToString(),
                scenePath = stage.scenePath, recorder = "Unity Recorder PNG image sequence", camera = shotCamera.name,
                width = ImageSize, height = ImageSize, fps = FrameRate, startSeconds = stage.startSeconds,
                recordedTimelineSeconds = director.time - stage.startSeconds, maxNearWhitePercent = maxWhite,
                minForegroundPercent = minForeground, maxHipDistance = maxHipDistance, maxHipAngle = maxHipAngle,
                frames = frames.Select(path => "sequence/" + Path.GetFileName(path)).ToArray(), frameSha256 = hashes,
                accessories = accessories?.Complete(), productionReady = false
            });
            Debug.Log($"Icarus Recorder verified {frames.Length} model-bound PNG frames.");
        }

        private static void Fail(Exception error)
        {
            Debug.LogException(error);
            ClosePrivateEditor(1);
        }

        private static void ClosePrivateEditor(int status)
        {
            EditorApplication.update -= WaitForGraphics;
            EditorApplication.update -= Poll;
            controller?.StopRecording();
            controller = null;
            accessories?.Stop();
            accessories = null;
            if (director != null) director.Stop();
            if (imageSettings != null) Object.DestroyImmediate(imageSettings);
            if (controllerSettings != null) Object.DestroyImmediate(controllerSettings);
            SessionState.EraseString(SessionKey);
            // All evidence is flushed. This dedicated Editor can exit directly;
            // leaving Play Mode first would trigger another full asset refresh.
            EditorApplication.delayCall += () => EditorApplication.Exit(status);
        }

        private static RecordingStage ReadStage(string output)
        {
            Require(Path.IsPathRooted(output ?? "") && File.Exists(Path.Combine(output, RequestName)), "Missing private Recorder stage.");
            var stage = JsonUtility.FromJson<RecordingStage>(File.ReadAllText(Path.Combine(output, RequestName)));
            Require(stage != null && stage.scenePath != null &&
                Regex.IsMatch(stage.scenePath, @"\AAssets/IcarusMotionReview-[a-f0-9]{32}/IcarusRecorder\.unity\z") &&
                AssetDatabase.LoadAssetAtPath<SceneAsset>(stage.scenePath) != null &&
                stage.startSeconds >= 0 && stage.durationSeconds >= .25 && stage.durationSeconds <= 30 &&
                stage.motionReportHash == Hash(Path.Combine(output, "icarus-motion-review.json")), "Invalid private Recorder stage.");
            return stage;
        }

        private static int ExpectedFrames(RecordingStage stage) => (int)Math.Floor(stage.durationSeconds * FrameRate);
        private static string Hash(string path)
        {
            using var hash = SHA256.Create();
            using var file = File.OpenRead(path);
            return BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
        }

        private static void FocusGameView()
        {
            var type = typeof(EditorWindow).Assembly.GetType("UnityEditor.GameView");
            Require(type != null, "Unity Game view is unavailable.");
            EditorWindow.GetWindow(type).Focus();
        }

        private static void WriteJson(string file, object value) => File.WriteAllText(file, JsonUtility.ToJson(value, true) + "\n");

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
