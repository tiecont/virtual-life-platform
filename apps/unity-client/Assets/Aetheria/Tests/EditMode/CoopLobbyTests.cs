using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using NUnit.Framework;

namespace Aetheria.Tests
{
    // The lobby sends exactly the room-scoped commands and parses the admission
    // scope without inventing seats, tickets or content hashes.
    public sealed class CoopLobbyTests
    {
        private const string RoomId = "11111111-1111-4111-8111-111111111111";
        private const string AccountId = "44444444-4444-4444-8444-444444444444";

        [Test]
        public async Task CreatesARoomAndParsesTheAdmissionScope()
        {
            var handler = new StubHandler(request =>
            {
                var path = request.RequestUri.AbsolutePath;
                if (path == "/v1/session/login") return Json("{\"profile\":{\"id\":\"" + AccountId + "\"},\"csrfToken\":\"" + new string('c', 64) + "\",\"expiresAt\":\"2027-01-01T00:00:00Z\"}");
                if (path == "/v1/coop/rooms") return Json(RoomJson());
                if (path == "/v1/coop/rooms/" + RoomId + "/admission") return Json(AdmissionJson());
                return new HttpResponseMessage(HttpStatusCode.NotFound);
            });
            using var platform = new PlatformSession(new Uri("https://fixture.invalid"), handler);
            await platform.LoginAsync("lobby_fixture", "synthetic-lobby-password", Guid.NewGuid());
            var lobby = new CoopLobbyClient(platform);
            var requestId = Guid.NewGuid();
            var room = await lobby.CreateAsync("icarus", requestId);
            Assert.That(room.roomId, Is.EqualTo(RoomId));
            Assert.That(room.you.isHost, Is.True);
            Assert.That(room.canStart, Is.False);
            var admission = await lobby.AdmissionAsync(Guid.Parse(RoomId), Guid.NewGuid());
            Assert.That(admission.AccountId, Is.EqualTo(Guid.Parse(AccountId)));
            Assert.That(admission.Seat, Is.EqualTo(2));
            Assert.That(handler.Requests.Count, Is.EqualTo(3));
            Assert.That(handler.Requests[1].Path, Is.EqualTo("/v1/coop/rooms"));
            StringAssert.Contains("\"petId\":\"icarus\"", handler.Requests[1].Body);
            Assert.That(handler.Requests[1].Csrf, Is.EqualTo(new string('c', 64)));
            Assert.That(handler.Requests[1].Idempotency, Is.EqualTo(requestId.ToString()));
            Assert.That(handler.Requests[2].Path, Is.EqualTo("/v1/coop/rooms/" + RoomId + "/admission"));
        }

        [Test]
        public void RejectsMalformedAdmissionScope()
        {
            Assert.Throws<FormatException>(() => CoopNativeAdmission.Decode(AdmissionJson().Replace("\"seat\":2", "\"seat\":4")));
        }

        [Test]
        public void RequiresAnExplicitSeatIncludingForTheHost()
        {
            Assert.That(CoopNativeAdmission.Decode(AdmissionJson().Replace("\"seat\":2", "\"seat\":0")).Seat, Is.Zero);
            Assert.Throws<FormatException>(() => CoopNativeAdmission.Decode(AdmissionJson().Replace("\"seat\":2,", "")));
        }

        private static string RoomJson() => "{\"roomId\":\"" + RoomId + "\",\"ruleset\":\"arena8-coop-pve\"," +
            "\"bossId\":\"cinder-terraces-warden\",\"status\":\"OPEN\",\"revision\":1,\"configVersion\":2," +
            "\"requiredPoints\":5000,\"createdAt\":\"2026-01-01T00:00:00Z\",\"you\":{\"seat\":0,\"isHost\":true}," +
            "\"seats\":[{\"seat\":0,\"petId\":\"icarus\",\"petLevel\":1,\"ready\":false,\"you\":true}]," +
            "\"canJoin\":true,\"canStart\":false}";

        private static string AdmissionJson(string room = RoomId) => "{\"roomId\":\"" + room + "\"," +
            "\"bossId\":\"cinder-terraces-warden\",\"matchId\":\"22222222-2222-4222-8222-222222222222\",\"bootId\":\"33333333-3333-4333-8333-333333333333\"," +
            "\"accountId\":\"" + AccountId + "\",\"seat\":2,\"wssUrl\":\"wss://127.0.0.1:4443/rt/v1\"," +
            "\"httpsOrigin\":\"https://127.0.0.1:4443\",\"ticket\":\"ticket.payload.signature\"," +
            "\"expiresAt\":\"" + DateTimeOffset.UtcNow.AddSeconds(10).ToString("O") + "\",\"contentHash\":\"" + new string('a', 64) + "\"}";

        private static HttpResponseMessage Json(string json) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

        private sealed class StubHandler : HttpClientHandler
        {
            private readonly Func<HttpRequestMessage, HttpResponseMessage> respond;
            public List<Record> Requests { get; } = new List<Record>();
            public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
            { this.respond = respond; AllowAutoRedirect = false; UseCookies = true; }
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                var body = request.Content == null ? "" : await request.Content.ReadAsStringAsync();
                request.Headers.TryGetValues("X-CSRF-Token", out var csrf);
                request.Headers.TryGetValues("Idempotency-Key", out var idempotency);
                Requests.Add(new Record(request.RequestUri.AbsolutePath, body,
                    csrf == null ? null : string.Join(",", csrf), idempotency == null ? null : string.Join(",", idempotency)));
                return respond(request);
            }
            public sealed class Record
            {
                public string Path { get; }
                public string Body { get; }
                public string Csrf { get; }
                public string Idempotency { get; }
                public Record(string path, string body, string csrf, string idempotency)
                { Path = path; Body = body; Csrf = csrf; Idempotency = idempotency; }
            }
        }
    }
}
