using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Aetheria.World.Domain;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.World.Presentation
{
    // Development-player evidence capture. It loads the actual hub and arena
    // scenes, walks the real portal/return flow and renders the authored cameras
    // into PNGs plus a facts JSON. Gated behind a command-line flag and a
    // development build; it does nothing in a release player or normal test run.
    public sealed class WorldEvidenceCapture : MonoBehaviour
    {
        public const string Flag = "-aetheria-world-capture";
        private const int ImageWidth = 1280;
        private const int ImageHeight = 720;

        private string directory;
        private readonly List<CaptureFacts> captures = new List<CaptureFacts>();
        private readonly List<string> transitions = new List<string>();
        private string failure;

        [Serializable]
        private sealed class CaptureFacts
        {
            public string file;
            public string scene;
            public int bytes;
            public int width;
            public int height;
            public int rendererCount;
            public int boardTileCount;
            public int activePortals;
            public int foundationMarkers;
            public string playerPosition;
            public string petPosition;
            public string enemyPosition;
            public string cameraPosition;
            public string background;
            public bool fogEnabled;
            public string fogColor;
            public string sunColor;
        }

        [Serializable]
        private sealed class Facts
        {
            public string status;
            public string error;
            public string generatedAtUtc;
            public string unityVersion;
            public string graphicsDeviceType;
            public string graphicsDeviceName;
            public string graphicsDeviceVersion;
            public int screenWidth;
            public int screenHeight;
            public bool screenFullscreen;
            public string sceneNames;
            public string transitions;
            public List<CaptureFacts> captures = new List<CaptureFacts>();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (!Debug.isDebugBuild) return;
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, Flag);
            if (index < 0 || index + 1 >= args.Length) return;
            var host = new GameObject("World Evidence Capture");
            DontDestroyOnLoad(host);
            var capture = host.AddComponent<WorldEvidenceCapture>();
            capture.directory = Path.GetFullPath(args[index + 1]);
            capture.StartCoroutine(capture.Run());
        }

        // The driver keeps the catch outside any yield so a failure still writes
        // facts and a non-zero exit code.
        private IEnumerator Run()
        {
            var flow = Flow();
            while (true)
            {
                object current;
                try
                {
                    if (!flow.MoveNext()) break;
                    current = flow.Current;
                }
                catch (Exception exception)
                {
                    failure = exception.ToString();
                    Debug.LogError("World evidence capture failed: " + failure);
                    break;
                }
                yield return current;
            }

            WriteFacts();
            yield return null;
            Application.Quit(string.IsNullOrEmpty(failure) ? 0 : 1);
        }

        private IEnumerator Flow()
        {
            Directory.CreateDirectory(directory);
            WorldPresentationSettings.ReducedMotion = false;

            yield return LoadScene(WorldMapCatalog.CentralPlazaSceneName);
            yield return Settle(.8f);
            yield return Capture("01-central-plaza-spawn.png");

            var hub = Find<HubWorldController>();
            if (hub == null) throw new InvalidOperationException("Central Plaza has no hub controller.");
            var fire = hub.FindPortal("fire-portal");
            if (fire == null) throw new InvalidOperationException("Central Plaza has no fire portal.");
            hub.Player.Teleport(fire.transform.position + new Vector3(0f, .02f, -2.4f), 0f);
            hub.InputLocked = true;
            yield return Settle(.3f);
            yield return Capture("02-central-plaza-fire-portal.png");
            transitions.Add(WorldMapCatalog.CentralPlazaSceneName + " -> " + fire.TargetScene);
            if (!hub.TryInteract()) throw new InvalidOperationException("Fire portal interaction was rejected.");
            yield return WaitForScene(fire.TargetScene);
            yield return Settle(.9f);

            var fireArena = Find<ArenaWorldSceneController>();
            if (fireArena == null) throw new InvalidOperationException("Cinder Terraces has no arena controller.");
            yield return Capture("03-cinder-terraces-arena.png");
            transitions.Add(SceneManager.GetActiveScene().name + " -> " + WorldMapCatalog.CentralPlazaSceneName);
            if (!fireArena.ReturnToHub()) throw new InvalidOperationException("Arena return gate was rejected.");
            yield return WaitForScene(WorldMapCatalog.CentralPlazaSceneName);
            yield return Settle(.8f);
            yield return Capture("04-central-plaza-return.png");

            hub = Find<HubWorldController>();
            if (hub == null) throw new InvalidOperationException("Central Plaza did not reload.");
            var water = hub.FindPortal("water-portal");
            if (water == null) throw new InvalidOperationException("Central Plaza has no water portal.");
            hub.Player.Teleport(water.transform.position + new Vector3(0f, .02f, -2.4f), 0f);
            hub.InputLocked = true;
            transitions.Add(WorldMapCatalog.CentralPlazaSceneName + " -> " + water.TargetScene);
            if (!hub.TryInteract()) throw new InvalidOperationException("Water portal interaction was rejected.");
            yield return WaitForScene(water.TargetScene);
            yield return Settle(.9f);
            var waterArena = Find<ArenaWorldSceneController>();
            if (waterArena == null) throw new InvalidOperationException("Tideglass Lagoon has no arena controller.");
            yield return Capture("05-tideglass-lagoon-arena.png");
        }

        private static IEnumerator LoadScene(string sceneName)
        {
            var operation = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);
            if (operation == null) throw new InvalidOperationException("Scene is not in build settings: " + sceneName);
            yield return operation;
            yield return null;
        }

        private static IEnumerator WaitForScene(string sceneName)
        {
            var deadline = Time.realtimeSinceStartup + 25f;
            while (!string.Equals(SceneManager.GetActiveScene().name, sceneName, StringComparison.Ordinal))
            {
                if (Time.realtimeSinceStartup > deadline)
                    throw new TimeoutException("Timed out waiting for scene " + sceneName);
                yield return null;
            }
            yield return null;
        }

        private static IEnumerator Settle(float seconds)
        {
            var deadline = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < deadline) yield return null;
            yield return null;
        }

        private IEnumerator Capture(string file)
        {
            var camera = Camera.main != null ? Camera.main : Find<Camera>();
            if (camera == null) throw new InvalidOperationException("No camera in " + SceneManager.GetActiveScene().name);
            var target = new RenderTexture(ImageWidth, ImageHeight, 24, RenderTextureFormat.ARGB32);
            var previousTarget = camera.targetTexture;
            camera.targetTexture = target;
            yield return null;
            yield return null;

            var active = RenderTexture.active;
            RenderTexture.active = target;
            var texture = new Texture2D(ImageWidth, ImageHeight, TextureFormat.RGB24, false);
            texture.ReadPixels(new Rect(0f, 0f, ImageWidth, ImageHeight), 0, 0);
            texture.Apply();
            var bytes = texture.EncodeToPNG();
            var path = Path.Combine(directory, file);
            File.WriteAllBytes(path, bytes);
            RenderTexture.active = active;
            camera.targetTexture = previousTarget;
            UnityEngine.Object.Destroy(texture);
            UnityEngine.Object.Destroy(target);

            var arena = Find<ArenaWorldSceneController>();
            var hub = Find<HubWorldController>();
            var pet = arena != null ? arena.PetActor : null;
            var enemy = arena != null ? arena.EnemyActor : null;
            var sun = RenderSettings.sun;
            captures.Add(new CaptureFacts
            {
                file = file,
                scene = SceneManager.GetActiveScene().name,
                bytes = bytes.Length,
                width = ImageWidth,
                height = ImageHeight,
                rendererCount = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None).Length,
                boardTileCount = arena != null ? arena.BoardTileCount : 0,
                activePortals = hub != null ? hub.ActivePortalCount : arena != null && arena.ReturnGate != null ? 1 : 0,
                foundationMarkers = hub != null ? hub.FoundationMarkerCount : 0,
                playerPosition = arena != null ? Format(arena.Player != null ? arena.Player.transform.position : Vector3.zero)
                    : hub != null && hub.Player != null ? Format(hub.Player.transform.position) : string.Empty,
                petPosition = pet != null ? Format(pet.position) : string.Empty,
                enemyPosition = enemy != null ? Format(enemy.position) : string.Empty,
                cameraPosition = Format(camera.transform.position),
                background = ColorUtility.ToHtmlStringRGB(camera.backgroundColor),
                fogEnabled = RenderSettings.fog,
                fogColor = ColorUtility.ToHtmlStringRGB(RenderSettings.fogColor),
                sunColor = sun != null ? ColorUtility.ToHtmlStringRGB(sun.color) : string.Empty
            });
        }

        private void WriteFacts()
        {
            var facts = new Facts
            {
                status = string.IsNullOrEmpty(failure) ? "ok" : "failed",
                error = failure ?? string.Empty,
                generatedAtUtc = DateTime.UtcNow.ToString("o"),
                unityVersion = Application.unityVersion,
                graphicsDeviceType = SystemInfo.graphicsDeviceType.ToString(),
                graphicsDeviceName = SystemInfo.graphicsDeviceName,
                graphicsDeviceVersion = SystemInfo.graphicsDeviceVersion,
                screenWidth = Screen.width,
                screenHeight = Screen.height,
                screenFullscreen = Screen.fullScreen,
                sceneNames = string.Join(",", WorldMapCatalog.WorldSceneNames),
                transitions = string.Join(" | ", transitions)
            };
            facts.captures.AddRange(captures);
            var path = Path.Combine(directory, "facts.json");
            File.WriteAllText(path, JsonUtility.ToJson(facts, true));
            Debug.Log("World evidence captured to " + path + " (" + captures.Count + " images).");
        }

        private static T Find<T>() where T : Component =>
            UnityEngine.Object.FindFirstObjectByType<T>();

        private static string Format(Vector3 value) =>
            value.x.ToString("0.00") + "," + value.y.ToString("0.00") + "," + value.z.ToString("0.00");
    }
}
