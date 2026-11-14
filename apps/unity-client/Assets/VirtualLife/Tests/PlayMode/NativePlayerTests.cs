using System;
using System.Collections;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Linq;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VirtualLife.Networking;
using VirtualLife.NativeScene;

namespace VirtualLife.Blockout.Tests
{
    // Included only in Unity test players. Private fixture input is supplied at
    // runtime outside Assets and the build, never serialized into a scene.
    public sealed class NativePlayerTests
    {
        private string stage = "input";

        [UnityTest]
        [Category("NativePlayerFixture")]
        [Timeout(360000)]
        public IEnumerator LinuxPlayerPetArenaFullMatch()
        {
            var file = Environment.GetEnvironmentVariable("VL_UNITY_NATIVE_FIXTURE");
            if (string.IsNullOrEmpty(file)) Assert.Ignore("Requires the explicit real-process Unity fixture.");
            Assert.That(Application.platform, Is.EqualTo(RuntimePlatform.LinuxPlayer));
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null));
            var config = JsonUtility.FromJson<Fixture>(File.ReadAllText(file));
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            yield return new WaitForSecondsRealtime(.5f);
            var panel = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
            var district = UnityEngine.Object.FindFirstObjectByType<OfflineDistrict>();
            Assert.That(panel.Status, Does.StartWith("Disconnected."), panel.Status);
            using var input = new LinuxInput(1024, 768);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot + ".initial.png");
            yield return input.Click(160, 188); yield return input.Type(config.loginName);
            Assert.That(Entered(panel, "loginName", config.loginName), Is.True, InputDiagnostic(panel, config.loginName));
            yield return input.Click(440, 188); yield return input.Type(config.password);
            Assert.That(Entered(panel, "password", config.password), Is.True, "OS password entry");
            yield return input.Click(90, 225);
            yield return Until(() => panel.Ready, () => "Pet login: " + panel.Status);
            Assert.That(panel.PresentedState.Arena.Phase, Is.EqualTo("ready"));
            Assert.That(panel.PresentedState.Version, Is.Zero);
            Assert.That(panel.ReducedMotion, Is.True);
            yield return input.Click(180, 482); yield return null;
            Assert.That(panel.ReducedMotion, Is.False);
            yield return input.Click(180, 482); yield return null;
            Assert.That(panel.ReducedMotion, Is.True);
            Assert.That(district.NativeTarget, Is.EqualTo(district.ArenaEntrance));
            yield return WalkToArena(input, panel, district);
            input.Key("e", true); yield return new WaitForSecondsRealtime(.08f); input.Key("e", false);
            yield return Until(() => panel.ArenaOpen);
            File.Delete(config.ackObserved); File.WriteAllText(config.ackGate, "1");
            try {
                yield return input.Click(800, 610);
                yield return Until(() => File.Exists(config.ackObserved));
                yield return Until(() => !panel.Busy && panel.HasPendingCommand);
                Assert.That(panel.Ready, Is.False); Assert.That(panel.PresentedState.Version, Is.Zero);
            } finally { File.Delete(config.ackGate); File.Delete(config.ackObserved); }
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy, () => "lost ACK resync: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(1)); Assert.That(panel.HasPendingCommand, Is.True);
            yield return input.Click(470, 225);
            yield return Until(() => panel.Ready && !panel.Busy && !panel.HasPendingCommand, () => "start retry: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(1));
            Assert.That(panel.PresentedState.Arena.Phase, Is.EqualTo("playing"));
            var beforeInvalid = panel.PresentedState;
            yield return input.Click(684, 294); yield return input.Click(944, 554);
            Assert.That(panel.PresentedState, Is.SameAs(beforeInvalid), "Invalid nonadjacent tile selection cannot invent a result");
            yield return input.Click(config.loss ? 890 : 734, 610);
            yield return Until(() => panel.Ready && !panel.Busy && panel.PresentedState.Version == 2, () => "first combat turn: " + panel.Status);
            var saved = panel.PresentedState.Arena;
            var board = string.Join(",", saved.Board);
            File.WriteAllText(config.restartRequested, "Checkpoint version 2 before fixture SIGKILL");
            yield return Until(() => File.Exists(config.restartReady), seconds: 30);
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy, () => "Pet restart reconnect: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(2));
            Assert.That(string.Join(",", panel.PresentedState.Arena.Board), Is.EqualTo(board));
            Assert.That(panel.PresentedState.Arena.Health, Is.EqualTo(saved.Health));
            Assert.That(panel.PresentedState.Arena.EnemyHealth, Is.EqualTo(saved.EnemyHealth));
            Assert.That(district.Player.transform.position.z, Is.EqualTo(-4).Within(.001f), "Restart reconciles the new movement incarnation");
            yield return input.Click(890, 648); yield return null;
            Assert.That(panel.ArenaOpen, Is.False);
            yield return WalkToArena(input, panel, district);
            input.Key("e", true); yield return new WaitForSecondsRealtime(.08f); input.Key("e", false);
            yield return Until(() => panel.ArenaOpen);
            var usedSwap = false;
            for (var action = 0; !panel.PresentedState.Arena.Terminal && action < 60; action++) {
                yield return Until(() => panel.Ready && !panel.Busy && !panel.Moving);
                yield return new WaitForEndOfFrame();
                var current = panel.PresentedState;
                if (config.loss) yield return input.Click(890, 610);
                else if (current.Arena.Cooldown == 0) yield return input.Click(734, 610);
                else {
                    Assert.That(current.Arena.Hint(out var first, out var second), Is.True);
                    yield return input.Click(684 + first % 6 * 52, 294 + first / 6 * 52);
                    yield return input.Click(684 + second % 6 * 52, 294 + second / 6 * 52); usedSwap = true;
                }
                yield return Until(() => panel.Ready && !panel.Busy && panel.PresentedState.Version == current.Version + 1,
                    () => "Pet turn: " + current.Version + " -> " + panel.PresentedState?.Version + "/busy=" + panel.Busy + "/pending=" + panel.HasPendingCommand + "/open=" + panel.ArenaOpen + "/phase=" + panel.PresentedState?.Arena.Phase + "/" + panel.Status);
                Assert.That(district.RehearsalTurns, Is.Zero);
            }
            var terminal = panel.PresentedState;
            Assert.That(terminal.Arena.Phase, Is.EqualTo(config.loss ? "lost" : "won"));
            Assert.That(terminal.Reward, Is.EqualTo("REWARD_PENDING"));
            if (!config.loss) Assert.That(usedSwap, Is.True, "Real OS tile clicks must submit at least one swap");
            File.WriteAllText(config.settleRequested, "Reconcile the authoritative terminal outcome");
            yield return Until(() => File.Exists(config.settleReady), seconds: 30);
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy, () => "reward refresh: " + panel.Status);
            var reward = panel.PresentedState.Reward;
            Assert.That(reward, Is.EqualTo(config.loss ? "DECLINED" : "GRANTED"));
            Assert.That(panel.PresentedState.Version, Is.EqualTo(terminal.Version));
            yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(config.screenshot);
            yield return Until(() => File.Exists(config.screenshot));
            Assert.That(panel.ReducedMotion, Is.True);
            foreach (var name in new[] {"Cinder developer figure", "Brook developer figure", "Briar developer figure"})
                Assert.That(GameObject.Find(name).transform.localScale, Is.EqualTo(Vector3.one), "Reduced motion removes optional receipt pulses");
            yield return input.Click(890, 648); yield return null;
            input.Key("s", true);
            yield return Until(() => district.Player.transform.position.z < 4.5f, () => "return to plaza: " + panel.Status, 30);
            input.Key("s", false); yield return Until(() => !panel.Moving);
            Assert.That(panel.ArenaOpen, Is.False); Assert.That(district.InputCaptured, Is.False);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(terminal.Version));
            yield return input.Click(470, 262);
            yield return Until(() => !panel.LoggingOut && panel.Status == "Signed out. Platform session revoked.");
            Assert.That(panel.PresentedState, Is.Null); Assert.That(panel.ArenaOpen, Is.False);
            Assert.That(Entered(panel, "password", "") && Entered(panel, "loginName", ""), Is.True);
            Assert.That(UnityEngine.Object.FindObjectsByType<PetArenaStage>(FindObjectsSortMode.None).Length, Is.EqualTo(1), "Logout cannot duplicate decorative actors");
            File.WriteAllText(config.result, JsonUtility.ToJson(new Facts {
                editor = Application.unityVersion, platform = Application.platform.ToString(), graphics = SystemInfo.graphicsDeviceName,
                graphicsApi = SystemInfo.graphicsDeviceType.ToString(), committedReceipt = true, authoritativeMovement = true,
                ambiguousAckReplay = true, reconnectReplay = true, petArenaComplete = true, rewardReconciled = true,
                returnedToRoam = true, reducedMotion = true, outcome = terminal.Arena.Phase, reward = reward, version = terminal.Version
            }));
        }
        private static IEnumerator WalkToArena(LinuxInput input, NativeSceneController panel, OfflineDistrict district)
        {
            input.Key("d", true);
            yield return Until(() => district.Player.transform.position.x >= 8.9f, () => "Arena X: " + district.Player.transform.position.x + " / " + panel.Status, 90);
            input.Key("d", false); yield return Until(() => !panel.Moving);
            input.Key("w", true);
            yield return Until(() => district.Player.transform.position.z >= 6f, () => "Arena Z: " + district.Player.transform.position.z + " / " + panel.Status, 90);
            input.Key("w", false); yield return Until(() => !panel.Moving && !panel.Busy);
            Assert.That(panel.MovementState.OwnActor.XMm / 1000f, Is.EqualTo(district.Player.transform.position.x).Within(.001f));
            Assert.That(panel.MovementState.OwnActor.ZMm / 1000f, Is.EqualTo(district.Player.transform.position.z).Within(.001f));
        }

        [UnityTest]
        [Category("NativePlayerFixture")]
        public IEnumerator LinuxPlayerPanelKeyboardAndTerminal()
        {
            var file = Environment.GetEnvironmentVariable("VL_UNITY_NATIVE_FIXTURE");
            if (string.IsNullOrEmpty(file)) Assert.Ignore("Requires the explicit real-process Unity fixture.");
            Assert.That(Application.platform, Is.EqualTo(RuntimePlatform.LinuxPlayer));
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null));
            var config = JsonUtility.FromJson<Fixture>(File.ReadAllText(file));
            using var trust = new FixtureTrust(config.caCertificate);
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            yield return new WaitForSecondsRealtime(0.5f);
            var panel = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
            var district = UnityEngine.Object.FindFirstObjectByType<OfflineDistrict>();
            Assert.That(panel, Is.Not.Null, "External development scope must activate the real scene controller");
            Assert.That(panel.Status, Does.StartWith("Disconnected."), "The panel must accept input: " + panel.Status);
            Assert.That(Screen.width, Is.GreaterThanOrEqualTo(650));
            Assert.That(Screen.height, Is.GreaterThanOrEqualTo(390));
            using var input = new LinuxInput();
            var negatives = config.admissionErrors ? new[] {"wrong-ca", "wrong-boot", "wrong-content", "invalid-signature", "expired", "protocol"} : Array.Empty<string>();
            var scopeFile = Environment.GetEnvironmentVariable("VL_NATIVE_DEV_CONFIG");
            var originalScope = File.ReadAllText(scopeFile);
            try {
                foreach (var negative in negatives) {
                    var badScope = JsonUtility.FromJson<PanelScope>(originalScope);
                    if (negative == "wrong-boot") badScope.bootId = Guid.NewGuid().ToString();
                    if (negative == "wrong-content") badScope.contentHash = new string('6', 64);
                    File.WriteAllText(scopeFile, JsonUtility.ToJson(badScope));
                    if (negative == "invalid-signature" || negative == "expired" || negative == "protocol") File.WriteAllText(config.ticketFault, negative);
                    using (var wrongTrust = negative == "wrong-ca" ? new FixtureTrust(config.wrongCaCertificate) : null) {
                        yield return SceneManager.LoadSceneAsync("AuroraBlockout"); yield return null;
                        panel = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
                        yield return input.Click(160, 188); yield return input.Type(config.loginName);
                        yield return input.Click(440, 188); yield return input.Type(config.password);
                        yield return LoginClick(input, config.loginPace);
                        yield return Until(() => !panel.Busy && panel.Status.StartsWith("Native "), () => negative + ": " + panel.Status);
                        Assert.That(panel.Ready, Is.False, negative); Assert.That(panel.PresentedState, Is.Null, negative);
                        Assert.That(panel.HasPendingCommand, Is.False, negative);
                        Assert.That(panel.Status, Does.StartWith(negative == "wrong-boot" ? "Native failure: Scope" : "Native failure: Transport"), negative);
                        Assert.That(Entered(panel, "password", ""), Is.True, negative);
                        yield return new WaitForEndOfFrame();
                        ScreenCapture.CaptureScreenshot(config.screenshot + "." + negative + ".png");
                        yield return Until(() => File.Exists(config.screenshot + "." + negative + ".png"));
                    }
                    File.Delete(config.ticketFault);
                }
            } finally { File.WriteAllText(scopeFile, originalScope); File.Delete(config.ticketFault); }
            yield return SceneManager.LoadSceneAsync("AuroraBlockout"); yield return null;
            panel = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
            district = UnityEngine.Object.FindFirstObjectByType<OfflineDistrict>();
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot + ".initial.png");
            yield return input.Click(160, 188);
            Assert.That(Application.isFocused, Is.True, "The OS input must target the test player");
            yield return input.Type(config.loginName);
            Assert.That(Entered(panel, "loginName", config.loginName), Is.True, "OS keyboard account entry must match disposable input; " + InputDiagnostic(panel, config.loginName));
            yield return input.Click(440, 188); yield return input.Type(new string('a', 48));
            yield return LoginClick(input, config.loginPace);
            yield return Until(() => !panel.Busy && panel.Status.Contains("Authentication"), () => "wrong-login: " + panel.Status);
            Assert.That(panel.Ready, Is.False);
            yield return input.Click(440, 188); yield return input.Type(config.password);
            Assert.That(Entered(panel, "password", config.password), Is.True, "OS keyboard password entry must match disposable input");
            yield return LoginClick(input, config.loginPace);
            yield return Until(() => panel.Ready, () => "login: " + panel.Status);
            var initial = panel.PresentedState.Version;
            Assert.That(district.NetworkAuthority, Is.EqualTo(config.movement));
            Assert.That(initial, Is.LessThan(3));
            input.Key("w", true);
            // Every step awaits authorization and a server tick; silence stops motion.
            // Allow the 5m route to complete under a loaded Linux test workstation.
            yield return Until(() => district.Player.transform.position.z >= 1.0f, () => "walk: " + district.Player.transform.position.z + "/captured=" + district.InputCaptured + "/ready=" + panel.Ready + "/" + panel.Status, 60);
            input.Key("w", false); yield return null;
            yield return Until(() => !panel.Moving);
            if (config.movement) {
                Assert.That(panel.MovementState.OwnActor.LastInputSequence, Is.GreaterThan(0));
                Assert.That(district.Player.transform.position.x, Is.EqualTo(panel.MovementState.OwnActor.XMm / 1000f).Within(0.001f));
                Assert.That(district.Player.transform.position.z, Is.EqualTo(panel.MovementState.OwnActor.ZMm / 1000f).Within(0.001f));
                var before = district.Player.transform.position; district.Move(Vector3.right, 0.1f);
                Assert.That(district.Player.transform.position, Is.EqualTo(before), "Offline movement cannot override connected authority");
            }
            Assert.That(district.RehearsalTurns, Is.Zero);
            File.Delete(config.ackObserved);
            File.WriteAllText(config.ackGate, (initial + 1).ToString(System.Globalization.CultureInfo.InvariantCulture));
            try {
                input.Key("e", true); yield return new WaitForSecondsRealtime(0.08f); input.Key("e", false);
                yield return Until(() => File.Exists(config.ackObserved), () => "durable lost ACK: " + panel.Status);
                yield return Until(() => !panel.Busy && panel.HasPendingCommand, () => "ambiguous command: " + panel.Status);
                Assert.That(panel.Ready, Is.False);
                Assert.That(panel.Status, Does.StartWith("Native failure:"));
                Assert.That(panel.PresentedState.Version, Is.EqualTo(initial), "A missing receipt cannot update presentation");
                yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(config.screenshot + ".ambiguous.png");
                yield return Until(() => File.Exists(config.screenshot + ".ambiguous.png"));
            } finally { File.Delete(config.ackGate); File.Delete(config.ackObserved); }
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy, () => "pending resync: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1));
            Assert.That(panel.HasPendingCommand, Is.True, "A read cannot resolve the immutable pending intent");
            input.Key("e", true); yield return new WaitForSecondsRealtime(0.08f); input.Key("e", false);
            yield return Until(() => panel.Status.StartsWith("Reconnect and retry"));
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1));
            yield return input.Click(470, 225);
            yield return Until(() => panel.Ready && !panel.Busy && !panel.HasPendingCommand, () => "same-ID retry: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1), "Retry resolves the original turn without a second effect");
            Assert.That(panel.PresentedState.Turns, Is.EqualTo((int)initial + 1));
            Assert.That(district.RehearsalTurns, Is.Zero, "Only a committed server receipt can advance native gameplay");
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1));
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot);
            yield return Until(() => File.Exists(config.screenshot));
            // Unload while an actual HTTP request is blocked, then release its
            // handler after a fresh controller exists. Late work cannot restore UI.
            File.Delete(config.logoutObserved); File.Delete(config.ticketReleased);
            File.WriteAllText(config.logoutGate, "Hold ticket until the old scene is gone");
            try {
                yield return input.Click(260, 225);
                yield return Until(() => File.Exists(config.logoutObserved), () => "scene-exit ticket barrier: " + panel.Status);
                Assert.That(panel.Busy, Is.True);
                var leaving = panel;
                yield return SceneManager.LoadSceneAsync("AuroraBlockout");
                yield return null;
                Assert.That(leaving == null, Is.True, "Scene unload must destroy the old controller");
                Assert.That(leaving.PresentedState, Is.Null);
                Assert.That(leaving.Ready || leaving.Busy || leaving.HasPendingCommand || leaving.Moving, Is.False);
                Assert.That(Entered(leaving, "password", "") && Entered(leaving, "loginName", ""), Is.True);
                panel = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
                Assert.That(panel, Is.Not.Null);
                File.Delete(config.logoutGate);
                yield return Until(() => File.Exists(config.ticketReleased));
                yield return new WaitForSecondsRealtime(0.5f);
                Assert.That(panel.Ready || panel.Busy || panel.HasPendingCommand, Is.False);
                Assert.That(panel.PresentedState, Is.Null);
                Assert.That(panel.Status, Does.StartWith("Disconnected."));
            } finally { File.Delete(config.logoutGate); File.Delete(config.logoutObserved); File.Delete(config.ticketReleased); }
            yield return input.Click(160, 188); yield return input.Type(config.loginName);
            yield return input.Click(440, 188); yield return input.Type(config.password);
            yield return input.Click(90, 225);
            yield return Until(() => panel.Ready && !panel.Busy, () => "scene re-entry login: " + panel.Status);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1), "New login recovers the committed turn");
            File.Delete(config.logoutObserved);
            File.WriteAllText(config.logoutGate, "Hold the next ticket response");
            try {
                yield return input.Click(260, 225);
                yield return Until(() => File.Exists(config.logoutObserved), () => "ticket barrier: " + panel.Status);
                Assert.That(panel.Busy, Is.True, "Logout must interrupt an actual in-flight ticket request");
                yield return input.Click(470, 262);
                yield return Until(() => !panel.LoggingOut && panel.Status == "Signed out. Platform session revoked.", () => "logout: " + panel.Status);
            } finally { File.Delete(config.logoutGate); File.Delete(config.logoutObserved); }
            Assert.That(panel.Ready, Is.False); Assert.That(panel.PresentedState, Is.Null);
            Assert.That(Entered(panel, "password", ""), Is.True);
            Assert.That(Entered(panel, "loginName", ""), Is.True);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot + ".logout.png");
            yield return Until(() => File.Exists(config.screenshot + ".logout.png"));
            yield return input.Click(260, 262);
            yield return null;
            Assert.That(panel.Ready, Is.False); Assert.That(panel.PresentedState, Is.Null);
            // Re-entering the scene must create a fresh scoped controller, with no old state.
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            yield return null;
            var reentered = UnityEngine.Object.FindFirstObjectByType<NativeSceneController>();
            Assert.That(reentered, Is.Not.Null); Assert.That(reentered.Ready, Is.False);
            Assert.That(reentered.PresentedState, Is.Null);
            File.WriteAllText(config.result, JsonUtility.ToJson(new Facts {
                editor = Application.unityVersion, platform = Application.platform.ToString(),
                graphics = SystemInfo.graphicsDeviceName, graphicsApi = SystemInfo.graphicsDeviceType.ToString(),
                committedReceipt = true, reconnectReplay = false, wrongCaRejected = false,
                panelKeyboardTerminal = true, authoritativeMovement = config.movement,
                ambiguousAckReplay = true, inflightSceneExit = true, panelAdmissionErrors = negatives.Length, version = initial + 1
            }));
        }
        private static IEnumerator LoginClick(LinuxInput input, string pacingFile)
        {
            var after = File.Exists(pacingFile) ? long.Parse(File.ReadAllText(pacingFile), System.Globalization.CultureInfo.InvariantCulture) : 0;
            yield return Until(() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= after, () => "Waiting for real identity rate window", 65);
            yield return input.Click(90, 225);
        }
        private static bool Entered(NativeSceneController panel, string field, string expected) =>
            string.Equals((string)typeof(NativeSceneController).GetField(field, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).GetValue(panel), expected, StringComparison.Ordinal);
        private static string InputDiagnostic(NativeSceneController panel, string expected)
        {
            var value = (string)typeof(NativeSceneController).GetField("loginName", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).GetValue(panel);
            var mismatch = -1;
            for (var at = 0; at < Math.Min(value.Length, expected.Length); at++)
                if (value[at] != expected[at]) { mismatch = at; break; }
            return "length=" + value.Length + ", expectedLength=" + expected.Length + ", firstMismatch=" + mismatch + ", caseOnly=" + string.Equals(value, expected, StringComparison.OrdinalIgnoreCase);
        }
        private static IEnumerator Until(Func<bool> condition, Func<string> diagnostic = null, float seconds = 15)
        {
            var end = Time.realtimeSinceStartup + seconds;
            while (!condition() && Time.realtimeSinceStartup < end) yield return null;
            Assert.That(condition(), Is.True, "Timed out waiting for the rendered player interaction: " + diagnostic?.Invoke());
        }

        [UnityTest]
        [Category("NativePlayerFixture")]
        public IEnumerator LinuxPlayerLoginCommandAndReconnect()
        {
            var file = Environment.GetEnvironmentVariable("VL_UNITY_NATIVE_FIXTURE");
            if (string.IsNullOrEmpty(file)) Assert.Ignore("Requires the explicit real-process Unity fixture.");
            Assert.That(Application.platform, Is.EqualTo(RuntimePlatform.LinuxPlayer), "A real Linux Unity player is required.");
            Assert.That(new FileInfo(file).Length, Is.LessThan(8192));
            var config = JsonUtility.FromJson<Fixture>(File.ReadAllText(file));
            yield return SceneManager.LoadSceneAsync("AuroraBlockout");
            var district = UnityEngine.Object.FindFirstObjectByType<OfflineDistrict>();
            Assert.That(district.Player, Is.Not.Null);
            Assert.That(district.Player.GetComponent<Renderer>().sharedMaterial.shader.name,
                Is.EqualTo("Universal Render Pipeline/Lit"), "The developer capsule must use the rendered URP material.");
            Assert.That(Camera.main, Is.Not.Null);
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null), "Actual player rendering is required.");
            var task = RoundTrip(config);
            while (!task.IsCompleted) yield return null;
            if (task.IsFaulted) {
                var error = task.Exception.GetBaseException();
                var reason = error is NativeFailure native ? "/" + native.Reason + "/" + native.Code : "";
                Assert.Fail("Native player failed at " + stage + ": " + error.GetType().Name + reason);
            }
            Assert.That(task.IsCanceled, Is.False);
            Assert.That(task.Result, Is.GreaterThanOrEqualTo(1));
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot);
            var until = Time.realtimeSinceStartup + 5;
            while (!File.Exists(config.screenshot) && Time.realtimeSinceStartup < until) yield return null;
            Assert.That(File.Exists(config.screenshot), Is.True);
            File.WriteAllText(config.result, JsonUtility.ToJson(new Facts {
                editor = Application.unityVersion, platform = Application.platform.ToString(),
                graphics = SystemInfo.graphicsDeviceName, graphicsApi = SystemInfo.graphicsDeviceType.ToString(),
                committedReceipt = true, reconnectReplay = true, wrongCaRejected = true, version = task.Result
            }));
        }

        private async Task<ulong> RoundTrip(Fixture data)
        {
            var origin = new Uri(data.origin);
            stage = "wrong-ca";
            using (var wrongTrust = new FixtureTrust(data.wrongCaCertificate))
            using (var socket = new ClientWebSocket())
            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10))) {
                var denied = false;
                try { await socket.ConnectAsync(new Uri(data.origin.Replace("https:", "wss:") + "/rt/v1"), timeout.Token).ConfigureAwait(false); }
                catch (Exception error) {
                    for (var cause = error; cause != null; cause = cause.InnerException)
                        if (cause is System.Security.Authentication.AuthenticationException || cause.GetType().Name == "TlsException") denied = true;
                }
                Require(denied);
            }
            using var trust = new FixtureTrust(data.caCertificate);
            var handler = new HttpClientHandler {
                AllowAutoRedirect = false, UseCookies = true, CookieContainer = new CookieContainer()
            };
            using (var platform = new PlatformSession(origin, handler))
            using (var connection = new NativeConnection(new Uri(data.origin.Replace("https:", "wss:") + "/rt/v1"), origin,
                Enumerable.Repeat((byte)0x53, 32).ToArray(), Guid.Parse(data.boot), platform.TicketAsync))
            {
                stage = "login";
                await platform.LoginAsync(data.loginName, data.password, Guid.NewGuid()).ConfigureAwait(false);
                stage = "ticket-connect"; await connection.ConnectAsync().ConfigureAwait(false);
                var command = new GameCommand(Guid.Parse("03030303-0303-0303-0303-030303030303"), Guid.Parse(data.match),
                    0, "fixture.advance.v1", Encoding.UTF8.GetBytes("{\"epoch\":1}"));
                stage = "commit"; var first = await connection.SubmitAsync(command).ConfigureAwait(false);
                Require(first.Receipt.Committed && first.CanonicalVersion == 1);
                Require((await connection.SubmitAsync(command).ConfigureAwait(false)).Equals(first));
                stage = "reconnect"; await connection.ReconnectAsync().ConfigureAwait(false);
                Require((await connection.SubmitAsync(command).ConfigureAwait(false)).Equals(first));
                stage = "scene-use-case";
                using (var play = new SyntheticPlaySession(platform, connection, Guid.Parse(data.match))) {
                    var entered = await play.LoginAsync(data.loginName, data.password).ConfigureAwait(false);
                    Require(entered.Version >= 1 && !play.HasPendingCommand);
                    Require((await play.ReconnectAsync().ConfigureAwait(false)).Version == entered.Version);
                    return entered.Version;
                }
            }
        }
        // UnityTls uses native roots rather than Mono's on-disk X509Store.
        // Configure its public explicit-CA API only inside this isolated test
        // process, retaining chain/expiry/hostname validation and restoring it.
        private sealed class FixtureTrust : IDisposable
        {
            private readonly System.Reflection.PropertyInfo defaults;
            private readonly object previous;
            private readonly X509Certificate certificate;
            public FixtureTrust(string file)
            {
                var type = Type.GetType("Mono.Security.Interface.MonoTlsSettings, Mono.Security", true);
                defaults = type.GetProperty("DefaultSettings");
                previous = defaults.GetValue(null);
                var settings = type.GetMethod("Clone").Invoke(previous, null);
                var pem = File.ReadAllText(file).Replace("-----BEGIN CERTIFICATE-----", "").Replace("-----END CERTIFICATE-----", "");
                certificate = new X509Certificate(Convert.FromBase64String(pem));
                type.GetProperty("TrustAnchors").SetValue(settings, new X509CertificateCollection { certificate });
                defaults.SetValue(null, settings);
            }
            public void Dispose() { defaults.SetValue(null, previous); certificate.Dispose(); }
        }
        private static void Require(bool condition) { if (!condition) throw new InvalidOperationException("Native player invariant failed"); }
        [Serializable] private sealed class Fixture {
            public bool movement, loss, admissionErrors;
            public string ticketFault = "", loginPace = "";
            public string origin = "", caCertificate = "", wrongCaCertificate = "", boot = "", match = "", loginName = "", password = "", screenshot = "", result = "", logoutGate = "", logoutObserved = "", ackGate = "", ackObserved = "", ticketReleased = "";
            public string restartRequested = "", restartReady = "", settleRequested = "", settleReady = "";
        }
        [Serializable] private sealed class Facts {
            public int panelAdmissionErrors;
            public string editor, platform, graphics, graphicsApi;
            public bool committedReceipt, reconnectReplay, wrongCaRejected, panelKeyboardTerminal, authoritativeMovement, ambiguousAckReplay, inflightSceneExit;
            public bool petArenaComplete, rewardReconciled, returnedToRoam, reducedMotion;
            public string outcome, reward;
            public ulong version;
        }
        [Serializable] private sealed class PanelScope {
            public string httpsOrigin, wssOrigin, contentHash, bootId, matchId;
            public bool movement;
        }
    }
}
