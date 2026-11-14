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
        private NativePlaySession session;
        private DevelopmentCertificateTrust developmentTrust;
        private PetArenaHud arena;
        private bool arenaOpen;
        private OfflineDistrict district;
        private PlayState state;
        private string loginName = "", password = "", status = "Native configuration unavailable.";
        private bool busy, ready, pending, loggingOut;
        private CancellationTokenSource request;
        private volatile bool alive = true;
        private bool movementEnabled, moving;
        private float nextMove;
        private int generation;
        public PlayState PresentedState => state;
        public string Status => status;
        public bool Busy => busy;
        public bool Ready => ready;
        public bool HasPendingCommand => pending;
        public bool Moving => moving;
        public bool LoggingOut => loggingOut;
        public bool ArenaOpen => arenaOpen;
        public bool ReducedMotion => arena == null || arena.ReducedMotion;
        public VirtualLife.Native.Public.V1.WorldSnapshot MovementState => session?.MovementState;

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
            var step = "scope-file";
            try {
                var path = Path.GetFullPath(Environment.GetEnvironmentVariable("VL_NATIVE_DEV_CONFIG"));
                // Keep local scope configuration outside packaged client assets.
                var assets = Path.GetFullPath(Application.dataPath).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (path.StartsWith(assets, StringComparison.Ordinal) || new FileInfo(path).Length > 4096) throw new ArgumentException();
                step = "scope-json";
                var config = JsonUtility.FromJson<DevelopmentConfig>(File.ReadAllText(path));
                if (config == null || config.contentHash.Length != 64) throw new ArgumentException();
                if (string.IsNullOrEmpty(config.ruleset)) config.ruleset = "headless-counter";
                var hash = new byte[32];
                for (var at = 0; at < 32; at++) hash[at] = Convert.ToByte(config.contentHash.Substring(at * 2, 2), 16);
                var origin = new Uri(config.httpsOrigin);
                if (!string.IsNullOrEmpty(config.developmentCaFile) && developmentTrust == null) {
                    if (!Application.isEditor && !Debug.isDebugBuild) throw new ArgumentException();
                    step = "local-ca";
                    var ca = Path.GetFullPath(config.developmentCaFile);
                    if (ca.StartsWith(assets, StringComparison.Ordinal)) throw new ArgumentException();
                    developmentTrust = new DevelopmentCertificateTrust(ca, origin);
                }
                var boot = Guid.Parse(config.bootId); var match = Guid.Parse(config.matchId);
                if (match == Guid.Empty) throw new ArgumentException();
                step = "platform";
                var platform = new PlatformSession(origin);
                try {
                    step = "connection";
                    var connection = new NativeConnection(new Uri(config.wssOrigin), origin, hash, boot, platform.TicketAsync);
                    step = "session";
                    if (config.ruleset != "headless-counter" && config.ruleset != "pet-arena-pve") throw new ArgumentException();
                    session = config.ruleset == "pet-arena-pve" ? (NativePlaySession)new PetArenaPlaySession(platform, connection, match) : new SyntheticPlaySession(platform, connection, match);
                } catch { platform.Dispose(); throw; }
                step = "district";
                if (district == null) throw new ArgumentException();
                district.NativeInteraction = Interact;
                if (session is PetArenaPlaySession) {
                    arena = new PetArenaHud(GetComponent<PetArenaStage>() ?? gameObject.AddComponent<PetArenaStage>());
                    district.NativeTarget = district.ArenaEntrance;
                }
                movementEnabled = config.movement;
                district.NetworkAuthority = movementEnabled;
                district.NativeMovement = Move;
                status = "Disconnected. Log in to the isolated native " + (arena == null ? "synthetic match." : "Pet Arena.");
            } catch {
                session?.Dispose(); session = null;
                status = "Invalid local native configuration (" + step + "). Check the external scope file and system TLS trust.";
            }
        }
        private void Update()
        {
            // Network continuations enqueue at most one update per UI operation.
            // All Unity presentation changes run here on the Unity main thread.
            while (updates.TryDequeue(out var update)) update();
            if (movementEnabled && ready && !busy && !moving && session != null && session.NeedsRefresh) Run(session.ReconnectAsync);
            if (district != null) district.InputCaptured = busy || loggingOut || arenaOpen || GUIUtility.keyboardControl != 0;
        }
        private void Interact()
        {
            if (session == null || busy || moving || !ready) return;
            if (pending) { status = "Reconnect and retry the pending command before another turn."; return; }
            if (arena != null) { arenaOpen = true; return; }
            if (state == null || state.Turns >= 3) { status = "Synthetic match complete. Reconnect to refresh settlement."; return; }
            Run(session.AdvanceAsync);
        }
        private async void Move(Vector3 direction)
        {
            if (!ready || busy || moving || session == null || Time.realtimeSinceStartup < nextMove || direction == Vector3.zero) return;
            moving = true; nextMove = Time.realtimeSinceStartup + 0.05f;
            var current = session;
            try {
                var snapshot = await current.MoveAsync((int)(direction.x * 1000), (int)(direction.z * 1000), lifetime.Token).ConfigureAwait(false);
                if (alive) updates.Enqueue(() => { if (session != current) return; moving = false; if (ready) district.Reconcile(snapshot.OwnActor.XMm, snapshot.OwnActor.ZMm); });
            } catch {
                if (alive) updates.Enqueue(() => { if (session != current) return; moving = false; ready = false; status = "Movement unavailable. Reconnect to reconcile."; });
            }
        }
        private async void Run(Func<CancellationToken, Task<PlayState>> work)
        {
            if (busy || moving || session == null) return;
            request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            var current = request;
            var owner = session;
            var startedGeneration = generation;
            busy = true; status = "Connecting / awaiting authoritative receipt...";
            try {
                var result = await work(current.Token).ConfigureAwait(false);
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; state = result; arena?.Present(result); ready = true; pending = owner.HasPendingCommand; busy = false; if (movementEnabled && owner.MovementState != null) district.Reconcile(owner.MovementState.OwnActor.XMm, owner.MovementState.OwnActor.ZMm); status = "Authorized server state received."; });
            } catch (OperationCanceledException) {
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Cancelled. Reconnect before continuing."; });
            } catch (NativeFailure failure) {
                var reason = failure.Reason.ToString(); var code = failure.Code.ToString();
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Native failure: " + reason + " / " + code + ". Reconnect or retry the pending command."; });
            } catch {
                if (alive) updates.Enqueue(() => { current.Dispose(); if (generation != startedGeneration) return; request = null; ready = false; busy = false; pending = owner.HasPendingCommand; status = "Native request unavailable. Check local services and scope."; });
            } finally { if (!alive) current.Dispose(); }
        }
        private async void Logout()
        {
            if (session == null || loggingOut) return;
            var owner = session; session = null;
            var startedGeneration = ++generation;
            request?.Cancel(); request = null;
            ready = false; busy = false; moving = false; pending = false; state = null;
            arenaOpen = false; arena?.Clear();
            password = ""; loginName = ""; loggingOut = true;
            GUIUtility.keyboardControl = 0;
            status = "Signing out through the platform...";
            var confirmed = false;
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token)) {
                timeout.CancelAfter(TimeSpan.FromSeconds(6));
                try { await owner.LogoutAsync(Guid.NewGuid(), timeout.Token).ConfigureAwait(false); confirmed = true; }
                catch { /* Local cleanup does not prove server revocation. */ }
                finally { owner.Dispose(); }
            }
            if (alive) updates.Enqueue(() => {
                if (generation != startedGeneration) return;
                loggingOut = false; Initialize();
                status = confirmed ? "Signed out. Platform session revoked." : "Local session cleared. Server logout was not confirmed.";
            });
        }
        private void OnGUI()
        {
            var matrix = GUI.matrix;
            var enabled = GUI.enabled;
            var scale = arena == null ? Mathf.Min(1f, Screen.width / 650f, Screen.height / 390f) : Mathf.Min(1f, Screen.width / 1024f, Screen.height / 768f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            var wrapped = new GUIStyle(GUI.skin.label) { wordWrap = true };
            GUI.Box(new Rect(16, 100, 610, 270), "Native developer connection - " + (arena == null ? "synthetic ruleset" : "Pet Arena PvE"));
            GUI.Label(new Rect(28, 128, 580, 44), status, wrapped);
            GUI.enabled = session != null && !busy && !moving;
            GUI.Label(new Rect(28, 177, 72, 24), "Account");
            loginName = GUI.TextField(new Rect(104, 176, 180, 24), loginName, 32);
            GUI.Label(new Rect(294, 177, 72, 24), "Password");
            password = GUI.PasswordField(new Rect(368, 176, 220, 24), password, '*', 128);
            GUI.enabled = session != null && !busy && !moving && !pending;
            if (GUI.Button(new Rect(28, 212, 150, 28), "Login + connect")) {
                GUIUtility.keyboardControl = 0;
                var secret = password; password = ""; var name = loginName;
                Run(token => session.LoginAsync(name, secret, token));
            }
            GUI.enabled = session != null && !busy && !moving;
            if (GUI.Button(new Rect(188, 212, 170, 28), "Reconnect + resync")) { GUIUtility.keyboardControl = 0; Run(session.ReconnectAsync); }
            GUI.enabled = session != null && !busy && !moving && pending;
            if (GUI.Button(new Rect(368, 212, 220, 28), "Retry same command ID")) { GUIUtility.keyboardControl = 0; Run(session.RetryAsync); }
            GUI.enabled = true;
            if (busy && GUI.Button(new Rect(28, 248, 150, 26), "Cancel / disconnect")) {
                // Cancellation aborts the current exchange; ambiguous mutations keep their ID.
                request?.Cancel(); ready = false;
            }
            GUI.enabled = !loggingOut;
            if (GUI.Button(new Rect(188, 248, 170, 26), "End local session")) {
                generation++; request?.Cancel(); request = null; session?.Dispose(); session = null;
                state = null; ready = false; busy = false; moving = false; pending = false; password = ""; loginName = "";
                arenaOpen = false; arena?.Clear();
                GUIUtility.keyboardControl = 0;
                Initialize();
            }
            GUI.enabled = session != null && !loggingOut;
            if (GUI.Button(new Rect(368, 248, 220, 26), "Logout")) Logout();
            GUI.enabled = true;
            if (state != null) GUI.Label(new Rect(28, 282, 580, 24), "Committed version " + state.Version + " | turn " + state.Turns + (arena == null ? "/3" : "/60") + " | reward " + (state.Reward ?? "none"));
            var movement = movementEnabled ? session?.MovementState : null;
            GUI.Label(new Rect(28, 314, 580, 44), movement == null ? "Walk to the " + (arena == null ? "blue terminal" : "purple Arena gate") + " and press E." :
                "Rust position (mm): " + movement.OwnActor.XMm + ", " + movement.OwnActor.ZMm + " | tick " + movement.Tick + " | input " + movement.OwnActor.LastInputSequence, wrapped);
            if (arena != null) arena.Draw(state?.Arena, arenaOpen, ready && !busy && !moving && !pending, session as PetArenaPlaySession,
                Run, () => { arenaOpen = false; GUIUtility.keyboardControl = 0; });
            GUI.matrix = matrix; GUI.enabled = enabled;
        }
        private void OnDestroy()
        {
            alive = false; generation++; lifetime.Cancel(); request = null;
            session?.Dispose(); session = null; lifetime.Dispose();
            developmentTrust?.Dispose(); developmentTrust = null;
            state = null; ready = false; busy = false; moving = false; pending = false; loggingOut = false;
            arenaOpen = false; arena?.Clear();
            password = ""; loginName = "";
            if (district != null) { district.NativeInteraction = null; district.NativeMovement = null; district.NativeTarget = null; district.InputCaptured = false; district.NetworkAuthority = false; }
            while (updates.TryDequeue(out _)) { }
        }
        [Serializable] private sealed class DevelopmentConfig {
            public string httpsOrigin = "", wssOrigin = "", contentHash = "", bootId = "", matchId = "";
            public string developmentCaFile = "";
            public string ruleset = "headless-counter";
            public bool movement = false;
        }
    }
}
