using System;
using System.IO;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Player entry point for a pre-admitted cooperative seat. The lobby or test
    // harness supplies the admission JSON file; this bootstrap creates the
    // UIDocument, connects the admitted seat and mounts the committed HUD.
    public static class CoopSceneBootstrap
    {
        public const string AdmissionVariable = "AETHERIA_COOP_ADMISSION";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Open()
        {
            var source = Environment.GetEnvironmentVariable(AdmissionVariable);
            if (string.IsNullOrWhiteSpace(source)) return;
            string json;
            try { json = File.Exists(source) ? File.ReadAllText(source) : source; }
            catch (Exception error) { Debug.LogError("Coop admission could not be read: " + error.Message); return; }
            CoopNativeAdmission admission;
            try { admission = CoopNativeAdmission.Decode(json); }
            catch (FormatException error) { Debug.LogError("Coop admission rejected: " + error.Message); return; }

            var host = new GameObject("CoopNativeRuntime");
            UnityEngine.Object.DontDestroyOnLoad(host);
            var document = host.AddComponent<UIDocument>();
            document.panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            var hud = host.AddComponent<CoopNativeHud>();
            hud.Attach(document);
            var platform = new PlatformSession(admission.HttpsOrigin);
            var expectedRoute = admission.BossId.StartsWith("recruit-", StringComparison.Ordinal) ? admission.BossId : null;
            var session = new CoopNativePlaySession(platform, admission.CreateConnection(), admission.MatchId, expectedEncounter: expectedRoute);
            _ = ConnectAsync(session, hud, host);
        }

        private static async Task ConnectAsync(CoopNativePlaySession session, CoopNativeHud hud, GameObject host)
        {
            try
            {
                await session.ConnectAsync();
                hud.Bind(session);
            }
            catch (Exception error)
            {
                Debug.LogError("Coop native admission failed: " + error.Message);
                session.Dispose();
                UnityEngine.Object.Destroy(host);
            }
        }
    }
}
