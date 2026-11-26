using System;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class CoopWorldEntry : MonoBehaviour
    {
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private Wave1LocalApi api;
        private PanelSettings panel;
        private UIDocument document;
        private CoopNativeCampaignScreen campaign;
        private bool signedIn, savedSession, busy;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Open()
        {
            var origin = Environment.GetEnvironmentVariable("AETHERIA_COOP_API");
            if (string.IsNullOrWhiteSpace(origin) || Application.isEditor) return;
            var host = new GameObject("Cooperative Campaign");
            DontDestroyOnLoad(host);
            host.AddComponent<CoopWorldEntry>().Initialize(origin);
        }

        private void Initialize(string origin)
        {
            var webOrigin = Environment.GetEnvironmentVariable("AETHERIA_WAVE1_WEB_ORIGIN") ?? "http://127.0.0.1:3300";
            api = new Wave1LocalApi(origin, webOrigin, Application.persistentDataPath);
            savedSession = api.LoadSession();
            document = GetComponent<UIDocument>();
            panel = ScriptableObject.CreateInstance<PanelSettings>();
            panel.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
            document.panelSettings = panel;
            SceneManager.sceneLoaded += SceneLoaded;
            if (SceneManager.GetActiveScene().name == WorldMapCatalog.CentralPlazaSceneName)
                SceneLoaded(SceneManager.GetActiveScene(), LoadSceneMode.Single);
            else
                WorldSceneFlow.Load(WorldMapCatalog.CentralPlazaSceneName);
        }

        private void SceneLoaded(Scene scene, LoadSceneMode mode)
        {
            document.rootVisualElement.Clear();
            var hud = GetComponent<CoopNativeHud>();
            if (hud != null)
            {
                hud.Bind(null);
                Destroy(hud);
            }
            if (campaign != null)
            {
                Destroy(campaign);
                campaign = null;
            }
            if (!WorldMapCatalog.TryGetByScene(scene.name, out var map)) return;
            var world = FindFirstObjectByType<WorldSceneControllerBase>();
            if (map.Id == WorldMapCatalog.CentralPlazaId)
            {
                if (world != null) world.InputLocked = !signedIn;
                if (!signedIn) ShowGuest(world);
                return;
            }
            if (!signedIn) { ReturnToHub(); return; }
            if (world != null) world.InputLocked = true;
            _ = OpenArenaAsync(map);
        }

        private void ShowGuest(WorldSceneControllerBase world, string failure = null)
        {
            var root = document.rootVisualElement;
            root.Clear();
            root.Add(new Label(failure ?? "Central Plaza"));
            var name = new TextField("Guest name") { value = "Arena Guest " + Guid.NewGuid().ToString("N").Substring(0, 6) };
            root.Add(name);
            root.Add(new Button(() => _ = LoginAsync(world, name.value)) { name = "coop-guest", text = "Play as guest" });
            if (savedSession)
                root.Add(new Button(() => _ = LoginAsync(world, null)) { name = "coop-restore-guest", text = "Resume guest session" });
        }

        private async Task LoginAsync(WorldSceneControllerBase world, string name)
        {
            if (busy) return;
            busy = true;
            try
            {
                if (name == null)
                    await api.GetWave1State(lifetime.Token);
                else
                    await api.CreateGuest(name, Guid.NewGuid().ToString(), lifetime.Token);
                signedIn = true;
                document.rootVisualElement.Clear();
                if (world != null) world.InputLocked = false;
            }
            catch (OperationCanceledException) { }
            catch (Exception error) { ShowGuest(world, error.Message); }
            finally { busy = false; }
        }

        private async Task OpenArenaAsync(WorldMapDefinition map)
        {
            try
            {
                var collection = await api.GetWave1State(lifetime.Token);
                if (SceneManager.GetActiveScene().name != map.SceneName) return;
                campaign = gameObject.AddComponent<CoopNativeCampaignScreen>();
                campaign.Attach(document);
                campaign.Enter(api, collection.pets, map.Id, ReturnToHub);
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                if (SceneManager.GetActiveScene().name != map.SceneName) return;
                document.rootVisualElement.Add(new Label(error.Message));
                document.rootVisualElement.Add(new Button(ReturnToHub) { text = "Return to Central Plaza" });
            }
        }

        private static void ReturnToHub() => WorldSceneFlow.Load(WorldMapCatalog.CentralPlazaSceneName);

        private void OnDestroy()
        {
            SceneManager.sceneLoaded -= SceneLoaded;
            lifetime.Cancel();
            lifetime.Dispose();
            api?.Dispose();
            if (panel != null) Destroy(panel);
        }
    }
}
