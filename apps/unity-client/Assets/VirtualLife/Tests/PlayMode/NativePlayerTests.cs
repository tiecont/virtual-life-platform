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
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot + ".initial.png");
            yield return input.Click(160, 188);
            Assert.That(Application.isFocused, Is.True, "The OS input must target the test player");
            yield return input.Type(config.loginName);
            Assert.That(Entered(panel, "loginName", config.loginName), Is.True, "OS keyboard account entry must match disposable input; " + InputDiagnostic(panel, config.loginName));
            yield return input.Click(440, 188); yield return input.Type(new string('a', 48));
            yield return input.Click(90, 225);
            yield return Until(() => !panel.Busy && panel.Status.Contains("Authentication"), () => "wrong-login: " + panel.Status);
            Assert.That(panel.Ready, Is.False);
            yield return input.Click(440, 188); yield return input.Type(config.password);
            Assert.That(Entered(panel, "password", config.password), Is.True, "OS keyboard password entry must match disposable input");
            yield return input.Click(90, 225);
            yield return Until(() => panel.Ready, () => "login: " + panel.Status);
            var initial = panel.PresentedState.Version;
            Assert.That(district.NetworkAuthority, Is.EqualTo(config.movement));
            Assert.That(initial, Is.LessThan(3));
            input.Key("w", true);
            yield return Until(() => district.Player.transform.position.z >= 1.0f, () => "walk: " + district.Player.transform.position.z + "/captured=" + district.InputCaptured);
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
            input.Key("e", true); yield return new WaitForSecondsRealtime(0.08f); input.Key("e", false);
            yield return Until(() => panel.Ready && panel.PresentedState.Version == initial + 1, () => "terminal: " + panel.Status);
            Assert.That(panel.PresentedState.Turns, Is.EqualTo((int)initial + 1));
            Assert.That(district.RehearsalTurns, Is.Zero, "Only a committed server receipt can advance native gameplay");
            yield return input.Click(260, 225);
            yield return Until(() => panel.Ready && !panel.Busy);
            Assert.That(panel.PresentedState.Version, Is.EqualTo(initial + 1));
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(config.screenshot);
            yield return Until(() => File.Exists(config.screenshot));
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
                panelKeyboardTerminal = true, authoritativeMovement = config.movement, version = initial + 1
            }));
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
        private static IEnumerator Until(Func<bool> condition, Func<string> diagnostic = null)
        {
            var end = Time.realtimeSinceStartup + 15;
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
            public bool movement;
            public string origin = "", caCertificate = "", wrongCaCertificate = "", boot = "", match = "", loginName = "", password = "", screenshot = "", result = "";
        }
        [Serializable] private sealed class Facts {
            public string editor, platform, graphics, graphicsApi;
            public bool committedReceipt, reconnectReplay, wrongCaRejected, panelKeyboardTerminal, authoritativeMovement;
            public ulong version;
        }
    }
}
