using System;
using System.Threading.Tasks;
using System.Linq;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Lobby and native admission flow for a cooperative room. It reads only the
    // server room view: create/join/select/ready/start, then connects the admitted
    // seat and hands the committed projection to CoopNativeHud.
    [RequireComponent(typeof(UIDocument))]
    public sealed class CoopNativeCampaignScreen : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private PlatformSession platform;
        private CoopLobbyClient lobby;
        private CoopNativePlaySession session;
        private CoopLobbyClient.Room room;
        private CoopLobbyClient.Eligibility encounter;
        private string petId, instanceId, mapId;
        private Wave1Pet[] pets = Array.Empty<Wave1Pet>();
        private Action returnToHub;
        private Arena8NativeTrust trust;
        private bool busy;
        private TextField joinField;
        private string notice = "";

        // Scene bootstrap may create the component before assigning the document.
        public void Attach(UIDocument target) { document = target; }

        public void Enter(PlatformSession authenticated, string ownedPetId)
        {
            platform = authenticated ?? throw new ArgumentNullException(nameof(authenticated));
            lobby = new CoopLobbyClient(platform);
            petId = ownedPetId;
            room = null;
            notice = "";
            RenderLobby();
        }

        public void Enter(Wave1LocalApi authenticated, Wave1Pet[] ownedPets, string selectedMap, Action returnAction, CoopLobbyClient.Eligibility eligibility)
        {
            lobby = new CoopLobbyClient(authenticated);
            pets = (ownedPets ?? Array.Empty<Wave1Pet>()).Where(pet => Guid.TryParse(pet.ownedPetInstanceId, out _)).ToArray();
            SetPet(pets.FirstOrDefault());
            mapId = selectedMap;
            encounter = eligibility;
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
            var selection = new DropdownField("Owned Pet", labels, Math.Max(0, index));
            selection.RegisterValueChangedCallback(change =>
            {
                SetPet(pets[selection.index]);
                if (room != null && room.status == "OPEN") _ = RunAsync(SelectAsync);
            });
            root.Add(selection);
        }

        private VisualElement Root => document != null ? document.rootVisualElement : null;

        private void RenderLobby()
        {
            var root = Root;
            if (root == null) return;
            root.Clear();
            root.Add(new Label("Cooperative Arena8") { name = "coop-lobby-title" });
            if (notice.Length > 0) root.Add(new Label(notice) { name = "coop-lobby-notice" });
            if (room == null || room.status == "OPEN") RenderCollection(root);
            if (returnToHub != null)
                root.Add(new Button(returnToHub) { text = "Return to Central Plaza", name = "coop-return" });
            if (room == null)
            {
                if (encounter != null)
                    root.Add(new Label(encounter.bossId + " · Achievement Points " + encounter.points + " / " + encounter.requiredPoints));
                var create = new Button(() => _ = RunAsync(CreateAsync)) { text = "Create room", name = "coop-create" };
                create.SetEnabled(lobby != null && !string.IsNullOrEmpty(petId) && (encounter == null || encounter.eligible));
                root.Add(create);
                joinField = new TextField("Room id") { name = "coop-room-id" };
                root.Add(joinField);
                var join = new Button(() => _ = RunAsync(JoinAsync)) { text = "Join room", name = "coop-join" };
                join.SetEnabled(lobby != null);
                root.Add(join);
                if (lobby?.CanRefreshRoom == true)
                    root.Add(new Button(() => _ = RunAsync(ResumeAsync)) { text = "Resume room", name = "coop-resume" });
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
            var ready = new Button(() => _ = RunAsync(ReadyAsync)) { text = "Ready", name = "coop-ready" };
            ready.SetEnabled(room.status == "OPEN" && room.seats.Any(seat => seat.you && !string.IsNullOrEmpty(seat.petId)));
            root.Add(ready);
            var start = new Button(() => _ = RunAsync(StartAsync)) { text = "Start match", name = "coop-start" };
            start.SetEnabled(room.canStart && room.you != null && room.you.isHost);
            root.Add(start);
            if (lobby.CanRefreshRoom)
                root.Add(new Button(() => _ = RunAsync(RefreshRoomAsync)) { text = "Refresh room", name = "coop-refresh" });
            if (room.status == "STARTED")
                root.Add(new Button(() => _ = RunAsync(AdmitAsync)) { text = "Enter match", name = "coop-enter" });
            var leave = new Button(() => { room = null; RenderLobby(); }) { text = "Back", name = "coop-back" };
            root.Add(leave);
        }

        private async Task CreateAsync()
        {
            room = await lobby.CreateAsync(petId, instanceId, mapId, Guid.NewGuid(), bossId: encounter?.bossId);
            notice = "";
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
            room = await lobby.JoinAsync(roomId, Guid.NewGuid());
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
            room = loaded;
            if (room.status == "STARTED") await AdmitAsync();
            else RenderLobby();
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
            var transportPlatform = platform ?? new PlatformSession(admission.HttpsOrigin);
            trust = Arena8NativeTrust.FromEnvironment(admission.HttpsOrigin);
            var admitted = new CoopNativePlaySession(transportPlatform, connection, admission.MatchId);
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
            session?.Dispose();
            session = null;
            trust?.Dispose();
        }
    }
}
