using System;
using System.Threading.Tasks;
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
        private string petId;
        private TextField joinField;
        private string notice = "";

        public void Enter(PlatformSession authenticated, string ownedPetId)
        {
            platform = authenticated ?? throw new ArgumentNullException(nameof(authenticated));
            lobby = new CoopLobbyClient(platform);
            petId = ownedPetId;
            room = null;
            notice = "";
            RenderLobby();
        }

        private VisualElement Root => document != null ? document.rootVisualElement : null;

        private void RenderLobby()
        {
            var root = Root;
            if (root == null) return;
            root.Clear();
            root.Add(new Label("Cooperative Arena8") { name = "coop-lobby-title" });
            if (notice.Length > 0) root.Add(new Label(notice) { name = "coop-lobby-notice" });
            if (room == null)
            {
                var create = new Button(() => _ = RunAsync(CreateAsync)) { text = "Create room", name = "coop-create" };
                create.SetEnabled(platform != null && !string.IsNullOrEmpty(petId));
                root.Add(create);
                joinField = new TextField("Room id") { name = "coop-room-id" };
                root.Add(joinField);
                var join = new Button(() => _ = RunAsync(JoinAsync)) { text = "Join room", name = "coop-join" };
                join.SetEnabled(platform != null);
                root.Add(join);
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
            ready.SetEnabled(room.status == "OPEN" || room.status == "LOCKED");
            root.Add(ready);
            var start = new Button(() => _ = RunAsync(StartAsync)) { text = "Start match", name = "coop-start" };
            start.SetEnabled(room.canStart && room.you != null && room.you.isHost);
            root.Add(start);
            var leave = new Button(() => { room = null; RenderLobby(); }) { text = "Back", name = "coop-back" };
            root.Add(leave);
        }

        private async Task CreateAsync()
        {
            room = await lobby.CreateAsync(petId, Guid.NewGuid());
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
            notice = "";
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
            var admission = await lobby.AdmissionAsync(Guid.Parse(room.roomId), Guid.NewGuid());
            var connection = admission.CreateConnection();
            var admitted = new CoopNativePlaySession(platform, connection, admission.MatchId);
            try
            {
                await admitted.ConnectAsync();
            }
            catch
            {
                admitted.Dispose();
                throw;
            }
            session = admitted;
            var hud = GetComponent<CoopNativeHud>();
            if (hud == null) hud = gameObject.AddComponent<CoopNativeHud>();
            hud.Attach(document);
            hud.Bind(session);
        }

        private async Task RunAsync(Func<Task> action)
        {
            try { await action(); }
            catch (Exception error)
            {
                notice = error is NativeFailure failure ? "Native " + failure.Reason : error.Message;
                RenderLobby();
            }
        }

        private void OnDestroy()
        {
            session?.Dispose();
            session = null;
        }
    }
}
