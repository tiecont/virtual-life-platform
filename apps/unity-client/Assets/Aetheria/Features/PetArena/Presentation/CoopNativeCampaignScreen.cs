using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Lobby and native admission flow for a cooperative room.
    [RequireComponent(typeof(UIDocument))]
    public sealed class CoopNativeCampaignScreen : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private Wave1LocalApi api;
        private CoopLobbyClient lobby;
        private CoopNativePlaySession session;
        private CoopLobbyClient.Room room;
        private CoopCampaignCatalog catalog;
        private Arena8RecruitmentCatalog recruitment;
        private WorldMapDefinition map;
        private string petId, instanceId;
        private Wave1Pet[] pets = Array.Empty<Wave1Pet>();
        private Action returnToHub;
        private Arena8NativeTrust trust;
        private bool busy, loadingCatalog;
        private TextField joinField;
        private string notice = "";

        // Scene bootstrap may create the component before assigning the document.
        public void Attach(UIDocument target) { document = target; }

        public void Enter(Wave1LocalApi authenticated, Wave1Pet[] ownedPets, WorldMapDefinition selectedMap,
            Action returnAction, CoopCampaignCatalog publishedCatalog)
        {
            api = authenticated ?? throw new ArgumentNullException(nameof(authenticated));
            map = selectedMap ?? throw new ArgumentNullException(nameof(selectedMap));
            lobby = new CoopLobbyClient(api);
            pets = (ownedPets ?? Array.Empty<Wave1Pet>()).Where(pet => pet != null && !string.IsNullOrWhiteSpace(pet.petId) &&
                Guid.TryParseExact(pet.ownedPetInstanceId, "D", out var id) && id != Guid.Empty).ToArray();
            SetPet(pets.FirstOrDefault());
            catalog = publishedCatalog;
            recruitment = null;
            returnToHub = returnAction;
            room = null;
            notice = "";
            RenderLobby();
        }

        private void SetPet(Wave1Pet pet)
        {
            petId = pet?.petId;
            instanceId = pet?.ownedPetInstanceId;
        }

        private void RenderCollection(VisualElement root)
        {
            if (pets.Length == 0) return;
            var labels = pets.Select((p, i) => (i + 1) + ". " + p.name + " · Lv " + p.level).ToList();
            var index = Array.FindIndex(pets, pet => pet.ownedPetInstanceId == instanceId);
            var selection = new DropdownField(CampaignLocale.Text("coop.owned_pet", "Owned Pet"), labels, Math.Max(0, index));
            selection.RegisterValueChangedCallback(change =>
            {
                SetPet(pets[selection.index]);
                if (room != null && room.status == "OPEN") _ = RunAsync(SelectAsync);
            });
            root.Add(selection);
        }

        private VisualElement Root => document != null ? document.rootVisualElement : null;
        private CoopCampaignCatalog.Encounter Encounter => catalog?.Find(map.Id);
        private bool CanCreate => map.IsPlayable && Encounter?.eligible == true && instanceId != null;

        internal static VisualElement BuildAvailability(WorldMapDefinition map, CoopCampaignCatalog catalog,
            bool loading = false)
        {
            var row = new VisualElement { name = "coop-availability-" + map.Id };
            row.AddToClassList("coop-campaign-map");
            var encounter = catalog?.Find(map.Id);
            var title = new Label(encounter?.mapName ?? map.DisplayName) { enableRichText = false };
            title.AddToClassList("coop-campaign-map-name");
            row.Add(title);
            if (encounter == null)
            {
                var message = catalog == null ? "Campaign availability could not be loaded." : "No published Boss encounter for this map.";
                if (loading) message = "Loading campaign availability…";
                row.Add(new Label(message) { name = "coop-availability-status" });
            }
            else
            {
                row.Add(new Label("Boss · " + encounter.bossName)
                    { name = "coop-availability-boss", enableRichText = false });
                row.Add(new Label("Achievement Points · " + catalog.points + " / " + encounter.requiredPoints)
                    { name = "coop-availability-points" });
                if (encounter.eligible)
                    row.Add(new Label("Hosting requirements met.") { name = "coop-availability-status" });
                else
                {
                    row.Add(new Label("Room hosting locked.") { name = "coop-availability-status" });
                    if (catalog.points < encounter.requiredPoints)
                        row.Add(new Label("Achievement Points still needed · " + (encounter.requiredPoints - catalog.points))
                            { name = "coop-availability-points-lock" });
                    if (encounter.prerequisite != null && !encounter.prerequisite.cleared)
                        row.Add(new Label("Clear " + encounter.prerequisite.mapName + " first.")
                            { name = "coop-availability-map-lock", enableRichText = false });
                }
            }
            if (!map.IsPlayable)
                row.Add(new Label("This map has no local developer scene.") { name = "coop-availability-scene" });
            return row;
        }

        private void RenderLobby()
        {
            var root = Root;
            if (root == null || !isActiveAndEnabled) return;
            root.Clear();
            CampaignLocale.ApplyFont(root);
            root.Add(new Label("Cooperative Arena8") { name = "coop-lobby-title" });
            root.Add(new Label("Local developer preview") { name = "coop-lobby-preview" });
            if (notice.Length > 0) root.Add(new Label(notice) { name = "coop-lobby-notice" });
            if (room == null || room.status == "OPEN") RenderCollection(root);
            if (returnToHub != null)
                root.Add(new Button(returnToHub) { text = CampaignLocale.Text("coop.plaza", "Return to Central Plaza"), name = "coop-return" });
            if (room == null)
            {
                root.Add(BuildAvailability(map, catalog, loadingCatalog));
                if (Encounter?.eligible == true && instanceId == null)
                    root.Add(new Label("An owned Pet is required to create a room."));
                var create = new Button(() => _ = RunAsync(CreateAsync)) { text = CampaignLocale.Text("coop.create", "Create room"), name = "coop-create" };
                create.SetEnabled(CanCreate);
                root.Add(create);
                var refresh = new Button(() => _ = RunAsync(RefreshCampaignAsync))
                    { text = CampaignLocale.Text("coop.refresh_availability", "Refresh availability"), name = "coop-refresh-availability" };
                refresh.SetEnabled(!loadingCatalog);
                root.Add(refresh);
                joinField = new TextField(CampaignLocale.Text("coop.id", "Room id")) { name = "coop-room-id", value = joinField?.value ?? "" };
                root.Add(joinField);
                var join = new Button(() => _ = RunAsync(JoinAsync)) { text = CampaignLocale.Text("coop.join", "Join room"), name = "coop-join" };
                join.SetEnabled(lobby != null);
                root.Add(join);
                if (lobby?.CanRefreshRoom == true)
                    root.Add(new Button(() => _ = RunAsync(ResumeAsync)) { text = CampaignLocale.Text("coop.resume", "Resume room"), name = "coop-resume" });
                var recruit = new Button(() => _ = RunAsync(async () =>
                {
                    recruitment = await api.GetRecruitmentCatalog(lifetime.Token);
                    RenderLobby();
                })) { text = CampaignLocale.Text("map.recruitment", "Recruitment encounters") };
                root.Add(recruit);
                if (recruitment?.routes != null)
                {
                    var local = recruitment.routes.Where(route => route.mapId == map.Id && route.mode == "either").ToArray();
                    if (local.Length == 0)
                        root.Add(new Label(CampaignLocale.Text("map.no_recruitment", "No recruitment encounters available.")));
                    foreach (var route in local)
                    {
                        var host = new Button(() => _ = RunAsync(() => CreateEncounterAsync(route.id)))
                            { text = route.name + (route.cleared ? " ✓" : ""), enableRichText = false };
                        host.SetEnabled(map.IsPlayable && route.canHostCoop && instanceId != null);
                        root.Add(host);
                    }
                }
                return;
            }
            root.Add(new Label("Room " + room.roomId + " · " + room.status) { name = "coop-room-status" });
            root.Add(new Label("Boss " + room.bossId + " · config v" + room.configVersion +
                " · points " + room.requiredPoints) { name = "coop-room-meta" });
            var seats = new Label("Seats: " + (room.seats == null ? 0 : room.seats.Length) + "/4");
            seats.name = "coop-room-seats";
            root.Add(seats);
            if (room.you != null && room.you.seat >= 0)
                root.Add(new Label("You are seat " + room.you.seat + (room.you.isHost ? " (host)" : "")));
            var ready = new Button(() => _ = RunAsync(ReadyAsync)) { text = CampaignLocale.Text("coop.ready", "Ready"), name = "coop-ready" };
            ready.SetEnabled(room.status == "OPEN" && room.seats.Any(seat => seat.you && !string.IsNullOrEmpty(seat.petId)));
            root.Add(ready);
            var start = new Button(() => _ = RunAsync(StartAsync)) { text = CampaignLocale.Text("coop.start", "Start match"), name = "coop-start" };
            start.SetEnabled((room.canStart || room.status == "LOCKED") && room.you != null && room.you.isHost);
            root.Add(start);
            if (lobby.CanRefreshRoom)
                root.Add(new Button(() => _ = RunAsync(RefreshRoomAsync)) { text = CampaignLocale.Text("coop.refresh", "Refresh room"), name = "coop-refresh" });
            if (room.status == "STARTED")
                root.Add(new Button(() => _ = RunAsync(ResumeMatchAsync)) { text = CampaignLocale.Text("coop.enter", "Enter match or view rewards"), name = "coop-enter" });
            var leave = new Button(() => _ = RunAsync(BackToLobbyAsync)) { text = CampaignLocale.Text("coop.back", "Back"), name = "coop-back" };
            root.Add(leave);
        }

        private async Task CreateAsync()
        {
            if (CanCreate) await CreateEncounterAsync(Encounter.bossId);
        }

        private async Task CreateEncounterAsync(string encounterId)
        {
            try
            {
                room = await lobby.CreateAsync(petId, instanceId, map.Id, Guid.NewGuid(), lifetime.Token, encounterId);
            }
            catch (Wave1ApiException error) when (error.Status == 403 || error.Status == 404 || error.Status == 503)
            {
                notice = error.Message;
                await RefreshCampaignAsync();
                return;
            }
            notice = "";
            RenderLobby();
        }

        private Task BackToLobbyAsync()
        {
            room = null;
            notice = "";
            return RefreshCampaignAsync();
        }

        private async Task RefreshCampaignAsync()
        {
            catalog = null;
            recruitment = null;
            loadingCatalog = true;
            RenderLobby();
            var cancellation = lifetime.Token;
            try { catalog = await api.GetCoopCampaignCatalog(cancellation); }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return; }
            catch (Exception) { }
            finally { loadingCatalog = false; }
            RenderLobby();
        }

        private async Task JoinAsync()
        {
            if (joinField == null || !Guid.TryParse(joinField.value, out var roomId) || roomId == Guid.Empty)
            {
                notice = "Enter a room UUID.";
                RenderLobby();
                return;
            }
            room = await lobby.JoinAsync(roomId, Guid.NewGuid(), mapId: map.Id);
            if (instanceId != null) await SelectAsync();
            notice = "";
            RenderLobby();
        }

        private async Task ResumeAsync()
        {
            if (joinField == null || !Guid.TryParse(joinField.value, out var roomId) || roomId == Guid.Empty)
                throw new ArgumentException("Enter a room UUID.");
            var loaded = await lobby.ReadAsync(roomId);
            if (loaded.you == null || !loaded.seats.Any(seat => seat.you))
                throw new InvalidOperationException("This account has no seat in that room.");
            if (!string.IsNullOrEmpty(loaded.mapId) && loaded.mapId != map.Id)
                throw new InvalidOperationException("Resume this room at the " + loaded.mapId + " entrance.");
            room = loaded;
            if (room.status == "STARTED") await ResumeMatchAsync();
            else RenderLobby();
        }

        private async Task ResumeMatchAsync()
        {
            if (lobby.CanRefreshRoom)
            {
                try
                {
                    var reward = await lobby.RewardAsync(Guid.Parse(room.roomId));
                    notice = reward.outcome + " · " + reward.Summary;
                    RenderLobby();
                    return;
                }
                catch (Wave1ApiException error) when (error.Status == 404)
                {
                    // A participant has no receipt until settlement commits.
                }
            }
            await AdmitAsync();
        }

        private async Task RefreshRoomAsync()
        {
            if (room == null) return;
            room = await lobby.ReadAsync(Guid.Parse(room.roomId));
            RenderLobby();
        }

        private async Task SelectAsync()
        {
            if (room == null || petId == null) return;
            room = await lobby.SelectPetAsync(Guid.Parse(room.roomId), petId, instanceId, Guid.NewGuid());
            RenderLobby();
        }

        private async Task ReadyAsync()
        {
            if (room == null) return;
            room = await lobby.ReadyAsync(Guid.Parse(room.roomId), true, Guid.NewGuid());
            RenderLobby();
        }

        private async Task StartAsync()
        {
            if (room == null) return;
            room = await lobby.StartAsync(Guid.Parse(room.roomId), Guid.NewGuid());
            if (room.status != "STARTED") { RenderLobby(); return; }
            await AdmitAsync();
        }

        private async Task AdmitAsync()
        {
            var roomId = Guid.Parse(room.roomId);
            var admission = await lobby.AdmissionAsync(roomId, Guid.NewGuid());
            if (admission.BossId != room.bossId || admission.Seat != room.you.seat) throw new FormatException("Admission does not match the room.");
            var connection = admission.CreateConnection(ct => lobby.AdmissionAsync(roomId, Guid.NewGuid(), ct));
            var transportPlatform = new PlatformSession(admission.HttpsOrigin);
            trust = Arena8NativeTrust.FromEnvironment(admission.HttpsOrigin);
            var expectedRoute = admission.BossId.StartsWith("recruit-", StringComparison.Ordinal) ? admission.BossId : null;
            var admitted = new CoopNativePlaySession(transportPlatform, connection, admission.MatchId, expectedEncounter: expectedRoute);
            try
            {
                await admitted.ConnectAsync();
            }
            catch
            {
                admitted.Dispose();
                trust?.Dispose();
                trust = null;
                throw;
            }
            session = admitted;
            FindFirstObjectByType<ArenaWorldSceneController>()?.EnterBattlePresentation();
            var hud = GetComponent<CoopNativeHud>();
            if (hud == null) hud = gameObject.AddComponent<CoopNativeHud>();
            hud.Attach(document);
            hud.Bind(session, returnToHub);
            if (lobby.CanRefreshRoom) hud.SetRewardLoader(() => lobby.RewardAsync(roomId, admission.MatchId));
        }

        private async Task RunAsync(Func<Task> action)
        {
            if (busy) return;
            busy = true;
            try { await action(); }
            catch (Exception error)
            {
                notice = error is NativeFailure failure ? "Native " + failure.Reason : error.Message;
                RenderLobby();
            }
            finally { busy = false; }
        }

        private void OnDestroy()
        {
            lifetime.Cancel();
            lifetime.Dispose();
            session?.Dispose();
            session = null;
            trust?.Dispose();
        }
    }
}
