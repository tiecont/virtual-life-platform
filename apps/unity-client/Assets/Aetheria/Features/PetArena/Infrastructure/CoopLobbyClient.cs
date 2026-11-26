using System;
using System.Linq;
using Aetheria.Networking;
using UnityEngine;

namespace Aetheria.PetArena.Infrastructure
{
    // Thin room-scoped lobby over the authenticated platform session. Every
    // response is parsed and bounded here; the scene only renders the returned
    // room or admitted native scope.
    public sealed class CoopLobbyClient
    {
        [Serializable] public sealed class Seat
        {
            public int seat;
            public string petId, ownedPetInstanceId;
            public int petLevel;
            public bool ready;
            public bool you;
        }

        [Serializable] public sealed class You
        {
            public int seat;
            public bool isHost;
        }

        [Serializable] public sealed class Room
        {
            public string roomId, ruleset, bossId, status, createdAt;
            public int revision, configVersion, requiredPoints;
            public bool canJoin, canStart;
            public You you;
            public Seat[] seats;
        }

        [Serializable] private sealed class CreateRequest { public string requestId, petId, ownedPetInstanceId, mapId; }
        [Serializable] private sealed class RequestId { public string requestId; }
        [Serializable] private sealed class LegacyPetRequest { public string requestId, petId; }
        [Serializable] private sealed class PetRequest { public string requestId, petId, ownedPetInstanceId; }
        [Serializable] private sealed class ReadyRequest { public string requestId; public bool ready; }

        private readonly Func<string, string, Guid, System.Threading.CancellationToken, System.Threading.Tasks.Task<string>> post;
        private readonly Wave1LocalApi local;
        public bool CanRefreshRoom => local != null;

        public CoopLobbyClient(PlatformSession authenticatedSession)
        {
            post = (authenticatedSession ?? throw new ArgumentNullException(nameof(authenticatedSession))).CoopPostAsync;
        }

        public CoopLobbyClient(Wave1LocalApi authenticatedSession)
        {
            local = authenticatedSession ?? throw new ArgumentNullException(nameof(authenticatedSession));
            post = (path, body, _, cancellation) => local.CoopRequest(path, body, cancellation);
        }

        public async System.Threading.Tasks.Task<Room> ReadAsync(Guid roomId,
            System.Threading.CancellationToken cancellation = default)
        {
            if (local == null) throw new InvalidOperationException("Room refresh requires the local lobby session.");
            return ParseRoom(await local.CoopRequest(RoomPath(roomId, null), null, cancellation), roomId);
        }

        public async System.Threading.Tasks.Task<Room> CreateAsync(string petId, Guid requestId,
            System.Threading.CancellationToken cancellation = default)
        {
            return await CreateAsync(petId, null, null, requestId, cancellation);
        }

        public async System.Threading.Tasks.Task<Room> CreateAsync(string petId, string instanceId, string mapId,
            Guid requestId, System.Threading.CancellationToken cancellation = default)
        {
            var body = instanceId == null && mapId == null
                ? JsonUtility.ToJson(new LegacyPetRequest { requestId = requestId.ToString(), petId = petId })
                : JsonUtility.ToJson(new CreateRequest { requestId = requestId.ToString(), petId = petId, ownedPetInstanceId = instanceId, mapId = mapId });
            return ParseRoom(await post("/v1/coop/rooms", body, requestId, cancellation));
        }

        public async System.Threading.Tasks.Task<Room> JoinAsync(Guid roomId, Guid requestId,
            System.Threading.CancellationToken cancellation = default)
        {
            var body = JsonUtility.ToJson(new RequestId { requestId = requestId.ToString() });
            return ParseRoom(await post(RoomPath(roomId, "join"), body, requestId, cancellation), roomId);
        }

        public async System.Threading.Tasks.Task<Room> SelectPetAsync(Guid roomId, string petId, Guid requestId,
            System.Threading.CancellationToken cancellation = default) =>
            await SelectPetAsync(roomId, petId, null, requestId, cancellation);

        public async System.Threading.Tasks.Task<Room> SelectPetAsync(Guid roomId, string petId, string instanceId,
            Guid requestId, System.Threading.CancellationToken cancellation = default)
        {
            var body = instanceId == null
                ? JsonUtility.ToJson(new LegacyPetRequest { requestId = requestId.ToString(), petId = petId })
                : JsonUtility.ToJson(new PetRequest { requestId = requestId.ToString(), petId = petId, ownedPetInstanceId = instanceId });
            return ParseRoom(await post(RoomPath(roomId, "pet"), body, requestId, cancellation), roomId);
        }

        public async System.Threading.Tasks.Task<Room> ReadyAsync(Guid roomId, bool ready, Guid requestId,
            System.Threading.CancellationToken cancellation = default)
        {
            var body = JsonUtility.ToJson(new ReadyRequest { requestId = requestId.ToString(), ready = ready });
            return ParseRoom(await post(RoomPath(roomId, "ready"), body, requestId, cancellation), roomId);
        }

        public async System.Threading.Tasks.Task<Room> StartAsync(Guid roomId, Guid requestId,
            System.Threading.CancellationToken cancellation = default)
        {
            var body = JsonUtility.ToJson(new RequestId { requestId = requestId.ToString() });
            return ParseRoom(await post(RoomPath(roomId, "start"), body, requestId, cancellation), roomId);
        }

        public async System.Threading.Tasks.Task<CoopNativeAdmission> AdmissionAsync(Guid roomId, Guid requestId,
            System.Threading.CancellationToken cancellation = default)
        {
            var json = await post(RoomPath(roomId, "admission"), "{}", requestId, cancellation);
            var admission = CoopNativeAdmission.Decode(json);
            if (admission.RoomId != roomId) throw new FormatException("Coop admission room mismatch");
            return admission;
        }

        private static string RoomPath(Guid roomId, string action)
        {
            if (roomId == Guid.Empty) throw new ArgumentException("Coop room id required");
            return "/v1/coop/rooms/" + roomId.ToString("D").ToLowerInvariant() + (action == null ? "" : "/" + action);
        }

        private static Room ParseRoom(string json, Guid? expected = null)
        {
            Room room;
            try { room = JsonUtility.FromJson<Room>(json); }
            catch (Exception error) { throw new FormatException("Invalid coop room", error); }
            if (room == null || !Guid.TryParse(room.roomId, out var id) || id == Guid.Empty ||
                (expected.HasValue && id != expected.Value) ||
                !new[] { "OPEN", "LOCKED", "STARTED", "CLOSED" }.Contains(room.status) ||
                room.revision < 0 || room.configVersion <= 0 ||
                room.you == null || room.seats == null || room.seats.Length > 4)
                throw new FormatException("Invalid coop room scope");
            return room;
        }
    }
}
