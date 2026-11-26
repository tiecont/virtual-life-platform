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
        private Wave1CampaignScreen artifactScreen;
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
            var sheet = Resources.Load<StyleSheet>("Wave1");
            if (sheet != null) document.rootVisualElement.styleSheets.Add(sheet);
            document.rootVisualElement.AddToClassList("coop-world");
            SceneManager.sceneLoaded += SceneLoaded;
            if (SceneManager.GetActiveScene().name == WorldMapCatalog.CentralPlazaSceneName)
                SceneLoaded(SceneManager.GetActiveScene(), LoadSceneMode.Single);
            else
                WorldSceneFlow.Load(WorldMapCatalog.CentralPlazaSceneName);
        }

        private void SceneLoaded(Scene scene, LoadSceneMode mode)
        {
            CloseArtifacts();
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
                SetOverlay(world, !signedIn);
                if (!signedIn) ShowGuest(world);
                else ShowHub(world);
                return;
            }
            if (!signedIn) { ReturnToHub(); return; }
            SetOverlay(world, true);
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
                ShowHub(world);
            }
            catch (OperationCanceledException) { }
            catch (Exception error) { ShowGuest(world, error.Message); }
            finally { busy = false; }
        }

        private static void SetOverlay(WorldSceneControllerBase world, bool open)
        {
            if (world == null) return;
            world.InputLocked = open;
            var hud = world.GetComponent<WorldHud>();
            if (hud != null) hud.enabled = !open;
        }

        private void ShowHub(WorldSceneControllerBase world)
        {
            SetOverlay(world, false);
            var root = document.rootVisualElement;
            root.Clear();
            var button = new Button(() => _ = OpenCollectionAsync(world))
            {
                name = "coop-pet-collection", text = "Pet collection"
            };
            button.style.position = Position.Absolute;
            button.style.bottom = 12;
            button.style.right = 12;
            root.Add(button);
        }

        private async Task OpenCollectionAsync(WorldSceneControllerBase world)
        {
            if (busy) return;
            busy = true;
            SetOverlay(world, true);
            var root = document.rootVisualElement;
            root.Clear();
            var collectionPanel = new VisualElement();
            collectionPanel.AddToClassList("arena-panel");
            root.Add(collectionPanel);
            var status = new Label("Loading Pet collection…");
            collectionPanel.Add(status);
            try
            {
                var collection = await api.GetWave1State(lifetime.Token);
                status.text = "Pet collection · " + collection.wallet.coins + " coins";
                var list = new ScrollView();
                foreach (var pet in collection.pets)
                {
                    var row = new VisualElement();
                    var summary = new Label(pet.name + " · " + pet.element + " · Lv " + pet.level + " · " + pet.exp + " EXP");
                    summary.AddToClassList("arena-meta");
                    row.Add(summary);
                    row.Add(new Button(() => OpenArtifacts(world, collection, pet.petId))
                    {
                        name = "coop-artifacts-" + pet.petId,
                        text = "Artifacts"
                    });
                    if (Guid.TryParseExact(pet.ownedPetInstanceId, "D", out var instanceId) && instanceId != Guid.Empty)
                        row.Add(new Button(() => OpenSkills(world, pet, instanceId))
                        {
                            name = "coop-skills-" + instanceId.ToString("D"), text = "Skills"
                        });
                    list.Add(row);
                }
                collectionPanel.Add(list);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception error) { status.text = error.Message; }
            finally { busy = false; }
            collectionPanel.Add(new Button(() => ShowHub(world))
            {
                name = "coop-collection-back", text = "Back to Central Plaza"
            });
        }

        private void OpenSkills(WorldSceneControllerBase world, Wave1Pet pet, Guid instanceId)
        {
            var root = document.rootVisualElement;
            root.Clear();
            var skills = new CoopSkillPanel(new CoopSkillClient(api), instanceId, pet, lifetime.Token,
                () => _ = OpenCollectionAsync(world));
            root.Add(skills);
            _ = skills.RefreshAsync();
        }

        private void OpenArtifacts(WorldSceneControllerBase world, Wave1State collection, string petId)
        {
            if (artifactScreen != null) return;
            artifactScreen = gameObject.AddComponent<Wave1CampaignScreen>();
            artifactScreen.EnterArtifactLoadout(document, api, collection, petId, () =>
            {
                CloseArtifacts();
                ShowHub(world);
            });
        }

        private void CloseArtifacts()
        {
            if (artifactScreen == null) return;
            artifactScreen.enabled = false;
            Destroy(artifactScreen);
            artifactScreen = null;
        }

        private async Task OpenArenaAsync(WorldMapDefinition map)
        {
            try
            {
                var collection = await api.GetWave1State(lifetime.Token);
                if (SceneManager.GetActiveScene().name != map.SceneName) return;
                var eligibility = await api.GetCoopEligibility(map.Id, lifetime.Token);
                if (eligibility == null || string.IsNullOrEmpty(eligibility.bossId)) throw new FormatException("Missing encounter for this portal.");
                if (SceneManager.GetActiveScene().name != map.SceneName) return;
                campaign = gameObject.AddComponent<CoopNativeCampaignScreen>();
                campaign.Attach(document);
                campaign.Enter(api, collection.pets, map.Id, ReturnToHub, eligibility);
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
