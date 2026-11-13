using System;
using System.Collections.Concurrent;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.SceneManagement;
using VirtualLife.Blockout;
using VirtualLife.Networking;

namespace VirtualLife.NativeScene
{
    // Explicit local-development opt-in. Nothing is serialized into scene assets.
    public sealed class NativeSceneController : MonoBehaviour
    {
        private readonly ConcurrentQueue<Action> updates = new ConcurrentQueue<Action>();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private SyntheticPlaySession session;
        private OfflineDistrict district;
        private PlayState state;
        private string loginName = "", password = "", status = "Native configuration unavailable.";
        private bool busy, ready, pending;
        private CancellationTokenSource request;
        private volatile bool alive = true;
        private int generation;
        public PlayState PresentedState => state;
        public string Status => status;
        public bool Busy => busy;
        public bool Ready => ready;
        public bool HasPendingCommand => pending;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            SceneManager.sceneLoaded -= SceneLoaded;
            SceneManager.sceneLoaded += SceneLoaded;
            SceneLoaded(SceneManager.GetActiveScene(), LoadSceneMode.Single);
        }
        private static void SceneLoaded(Scene scene, LoadSceneMode mode)
        {
            if (Application.isBatchMode || (!Application.isEditor && !Debug.isDebugBuild) || scene.name != "AuroraBlockout" ||
                string.IsNullOrEmpty(Environment.GetEnvironmentVariable("VL_NATIVE_DEV_CONFIG")) || FindFirstObjectByType<NativeSceneController>() != null) return;
            new GameObject("Native developer connection").AddComponent<NativeSceneController>();
        }
        private void Awake() { Initialize(); }
        private void Initialize()
        {
            district = FindFirstObjectByType<OfflineDistrict>();
            try {
                var path = Path.GetFullPath(Environment.GetEnvironmentVariable("VL_NATIVE_DEV_CONFIG"));
                // Keep local scope configuration outside packaged client assets.
                var assets = Path.GetFullPath(Application.dataPath).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (path.StartsWith(assets, StringComparison.Ordinal) || new FileInfo(path).Length > 4096) throw new ArgumentException();
                var config = JsonUtility.FromJson<DevelopmentConfig>(File.ReadAllText(path));
                if (config == null || config.contentHash.Length != 64) throw new ArgumentException();
                var hash = new byte[32];
                for (var at = 0; at < 32; at++) hash[at] = Convert.ToByte(config.contentHash.Substring(at * 2, 2), 16);
                var origin = new Uri(config.httpsOrigin);
                var boot = Guid.Parse(config.bootId); var match = Guid.Parse(config.matchId);
                if (match == Guid.Empty) throw new ArgumentException();
                var platform = new PlatformSession(origin);
                try {
                    var connection = new NativeConnection(new Uri(config.wssOrigin), origin, hash, boot, platform.TicketAsync);
                    session = new SyntheticPlaySession(platform, connection, match);
                } catch { platform.Dispose(); throw; }
                if (district == null) throw new ArgumentException();
                district.NativeInteraction = Interact;
                status = "Disconnected. Log in to the isolated native synthetic match.";
            } catch {
                session?.Dispose(); session = null;
                status = "Invalid local native configuration. Check the external scope file and system TLS trust.";
            }
        }
        private void Update()
        {
            // Network continuations enqueue at most one update per UI operation.
            // All Unity presentation changes run here on the Unity main thread.
            while (updates.TryDequeue(out var update)) update();
            if (district != null && session != null) district.InputCaptured = busy || GUIUtility.keyboardControl != 0;
        }
        private void Interact()
        {
            if (session == null || busy || !ready) return;
            if (pending) { status = "Reconnect and retry the pending command before another turn."; return; }
            if (state == null || state.Turns >= 3) { status = "Synthetic match complete. Reconnect to refresh settlement."; return; }
            Run(session.AdvanceAsync);
        }
        private async void Run(Func<CancellationToken, Task<PlayState>> work)
        {
            if (busy || session == null) return;
            request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            var current = request;
            var owner = session;
            var startedGeneration = generation;
            busy = true; status = "Connecting / awaiting authoritative receipt...";
            try {
                var result = await work(current.Token).ConfigureAwait(false);
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; state = result; ready = true; pending = owner.HasPendingCommand; busy = false; status = "Authorized server state received."; });
            } catch (OperationCanceledException) {
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Cancelled. Reconnect before continuing."; });
            } catch (NativeFailure failure) {
                var reason = failure.Reason.ToString(); var code = failure.Code.ToString();
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Native failure: " + reason + " / " + code + ". Reconnect or retry the pending command."; });
            } catch {
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Native request unavailable. Check local services and scope."; });
            } finally { if (!alive) current.Dispose(); }
        }
        private void OnGUI()
        {
            var matrix = GUI.matrix;
            var enabled = GUI.enabled;
            var scale = Mathf.Min(1f, Screen.width / 650f, Screen.height / 390f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            var wrapped = new GUIStyle(GUI.skin.label) { wordWrap = true };
            GUI.Box(new Rect(16, 100, 610, 270), "Native developer connection - synthetic ruleset");
            GUI.Label(new Rect(28, 128, 580, 44), status, wrapped);
            GUI.enabled = session != null && !busy;
            GUI.Label(new Rect(28, 177, 72, 24), "Account");
            loginName = GUI.TextField(new Rect(104, 176, 180, 24), loginName, 32);
            GUI.Label(new Rect(294, 177, 72, 24), "Password");
            password = GUI.PasswordField(new Rect(368, 176, 220, 24), password, '*', 128);
            GUI.enabled = session != null && !busy && !pending;
            if (GUI.Button(new Rect(28, 212, 150, 28), "Login + connect")) {
                GUIUtility.keyboardControl = 0;
                var secret = password; password = ""; var name = loginName;
                Run(token => session.LoginAsync(name, secret, token));
            }
            GUI.enabled = session != null && !busy;
            if (GUI.Button(new Rect(188, 212, 170, 28), "Reconnect + resync")) { GUIUtility.keyboardControl = 0; Run(session.ReconnectAsync); }
            GUI.enabled = session != null && !busy && pending;
            if (GUI.Button(new Rect(368, 212, 220, 28), "Retry same command ID")) { GUIUtility.keyboardControl = 0; Run(session.RetryAsync); }
            GUI.enabled = true;
            if (busy && GUI.Button(new Rect(28, 248, 150, 26), "Cancel / disconnect")) {
                // Cancellation aborts the current exchange; ambiguous mutations keep their ID.
                request?.Cancel(); ready = false;
            }
            if (GUI.Button(new Rect(188, 248, 170, 26), "End local session")) {
                generation++; request?.Cancel(); request = null; session?.Dispose(); session = null;
                state = null; ready = false; busy = false; pending = false; password = ""; loginName = "";
                GUIUtility.keyboardControl = 0;
                Initialize();
            }
            if (state != null) GUI.Label(new Rect(28, 282, 580, 24), "Committed version " + state.Version + " | turn " + state.Turns + "/3 | reward " + (state.Reward ?? "none"));
            GUI.Label(new Rect(28, 314, 580, 44), "Walk to the blue terminal and press E for one authoritative turn.", wrapped);
            GUI.matrix = matrix; GUI.enabled = enabled;
        }
        private void OnDestroy()
        {
            alive = false; generation++; lifetime.Cancel(); session?.Dispose(); lifetime.Dispose(); password = "";
            if (district != null) { district.NativeInteraction = null; district.InputCaptured = false; }
            while (updates.TryDequeue(out _)) { }
        }
        [Serializable] private sealed class DevelopmentConfig {
            public string httpsOrigin = "", wssOrigin = "", contentHash = "", bootId = "", matchId = "";
        }
    }
}
