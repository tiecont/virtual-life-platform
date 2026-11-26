using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Aetheria.PetArena.Infrastructure
{
    public sealed class Wave1LocalApi : IDisposable
    {
        public const string Prefix = "/v1/pets/wave1";
        public const string ArtifactPrefix = "/v1/pets/artifacts";
        public const string Arena8Prefix = "/v1/pets/wave-a/arena8";
        private const string CookieName = "city_session=";
        private readonly HttpClient http;
        private readonly string webOrigin;
        private readonly string sessionPath;
        private string cookie, csrf;

        public Wave1LocalApi(string apiOrigin, string requestOrigin, string persistentDataPath)
        {
            var origin = LoopbackOrigin(apiOrigin);
            webOrigin = LoopbackOrigin(requestOrigin).GetLeftPart(UriPartial.Authority);
            var family = origin.Host == "[::1]" ? "ipv6" : "ipv4";
            var scope = origin.Scheme + "-" + family + "-" + origin.Port;
            sessionPath = Path.Combine(persistentDataPath, "Wave1", scope + ".session");
            http = new HttpClient(new HttpClientHandler {
                AllowAutoRedirect = false, UseCookies = false, UseProxy = false
            }) { BaseAddress = origin, Timeout = TimeSpan.FromSeconds(8) };
        }

        public bool LoadSession()
        {
            if (!File.Exists(sessionPath)) return false;
            var saved = File.ReadAllLines(sessionPath);
            if (saved.Length != 2 || !ValidCookie(saved[0]) ||
                saved[1].Length != 64 || !saved[1].All(Uri.IsHexDigit)) return false;
            cookie = saved[0];
            csrf = saved[1];
            return true;
        }

        public void ForgetSession()
        {
            cookie = null;
            csrf = null;
            File.Delete(sessionPath);
        }

        public async Task CreateGuest(string displayName, string requestId, CancellationToken cancellation)
        {
            var body = new GuestInput { displayName = displayName, avatarKey = "mint", requestId = requestId };
            await Request<SessionView>("/v1/session/guest", body, cancellation, rememberSession: true);
        }

        public async Task Login(string loginName, string password, string requestId, CancellationToken cancellation)
        {
            var body = new LoginInput { loginName = loginName, password = password, requestId = requestId };
            await Request<SessionView>("/v1/session/login", body, cancellation,
                rememberSession: true);
        }

        public Task<T> Get<T>(string route, CancellationToken cancellation) where T : class =>
            Request<T>(Prefix + route, null, cancellation);

        public Task<T> Post<T>(string route, object body, CancellationToken cancellation) where T : class =>
            Request<T>(Prefix + route, body, cancellation);

        public Task<Wave1State> GetWave1State(CancellationToken cancellation) =>
            Request<Wave1State>(Prefix + "/state", null, cancellation);

        public Task<Arena8AllocateResponse> AllocateArena8(Arena8AllocateRequest body,
            CancellationToken cancellation) =>
            Request<Arena8AllocateResponse>(Arena8Prefix + "/allocate", body, cancellation);

        // Native transport allocation. The reply carries a match-scoped admission
        // ticket plus the WSS scope; every later command uses the native session,
        // never this HTTP compatibility bridge.
        public Task<Arena8NativeAllocation> AllocateArena8Native(Arena8AllocateRequest body,
            CancellationToken cancellation) =>
            Request<Arena8NativeAllocation>(Arena8Prefix + "/native/allocate", body, cancellation);

        public Task<Arena8CommandResponse> CommandArena8(Arena8StartCommandRequest body,
            CancellationToken cancellation) =>
            Request<Arena8CommandResponse>(Arena8Prefix + "/command", body, cancellation);

        public Task<Arena8CommandResponse> CommandArena8(Arena8GuardCommandRequest body,
            CancellationToken cancellation) =>
            Request<Arena8CommandResponse>(Arena8Prefix + "/command", body, cancellation);

        public Task<Arena8CommandResponse> CommandArena8(Arena8SwapCommandRequest body,
            CancellationToken cancellation) =>
            Request<Arena8CommandResponse>(Arena8Prefix + "/command", body, cancellation);

        public Task<Arena8CommandResponse> CommandArena8(Arena8SkillCommandRequest body,
            CancellationToken cancellation) =>
            Request<Arena8CommandResponse>(Arena8Prefix + "/command", body, cancellation);

        public Task<Arena8MatchResponse> GetArena8Match(string matchId, CancellationToken cancellation) =>
            Request<Arena8MatchResponse>(Arena8Prefix + "/matches/" + Uri.EscapeDataString(matchId), null, cancellation);

        public Task<Arena8Settlement> SettleArena8(string matchId, Arena8SettleRequest body,
            CancellationToken cancellation) =>
            Request<Arena8Settlement>(Arena8Prefix + "/matches/" + Uri.EscapeDataString(matchId) + "/settle",
                body, cancellation);

        public Task<Arena8Settlement> SettleArena8Native(string matchId, Arena8SettleRequest body,
            CancellationToken cancellation) =>
            Request<Arena8Settlement>(Arena8Prefix + "/native/matches/" + Uri.EscapeDataString(matchId) + "/settle",
                body, cancellation);

        public Task<WaveAArtifactState> GetArtifactState(CancellationToken cancellation) =>
            Request<WaveAArtifactState>(ArtifactPrefix + "/state", null, cancellation);

        public Task<WaveAArtifactMutation> EquipArtifact(WaveAArtifactEquipRequest body,
            CancellationToken cancellation) =>
            Request<WaveAArtifactMutation>(ArtifactPrefix + "/equip", body, cancellation);

        public Task<WaveAArtifactMutation> UnequipArtifact(WaveAArtifactUnequipRequest body,
            CancellationToken cancellation) =>
            Request<WaveAArtifactMutation>(ArtifactPrefix + "/unequip", body, cancellation);

        public Task<WaveAArtifactMutation> UpgradeArtifact(WaveAArtifactUpgradeRequest body,
            CancellationToken cancellation) =>
            Request<WaveAArtifactMutation>(ArtifactPrefix + "/upgrade", body, cancellation);

        public Task<WaveAArtifactMutation> ClaimArtifactReward(WaveAArtifactClaimRequest body,
            CancellationToken cancellation) =>
            Request<WaveAArtifactMutation>(ArtifactPrefix + "/pve/claim", body, cancellation);

        public void Dispose() => http.Dispose();

        public Task<CoopLobbyClient.Eligibility> GetCoopEligibility(string mapId, CancellationToken cancellation) =>
            Request<CoopLobbyClient.Eligibility>("/v1/coop/eligibility?mapId=" + Uri.EscapeDataString(mapId), null, cancellation);

        internal Task<string> CoopRequest(string route, string json, CancellationToken cancellation) =>
            Request<string>(route, json, cancellation);

        private async Task<T> Request<T>(string route, object body, CancellationToken cancellation,
            bool rememberSession = false, int retry = 0) where T : class
        {
            using var request = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, route);
            if (cookie != null) request.Headers.TryAddWithoutValidation("Cookie", cookie);
            if (body != null)
            {
                request.Headers.TryAddWithoutValidation("Origin", webOrigin);
                if (csrf != null) request.Headers.TryAddWithoutValidation("X-CSRF-Token", csrf);
                request.Content = new StringContent(body is string jsonBody ? jsonBody : JsonUtility.ToJson(body), Encoding.UTF8, "application/json");
            }

            using var response = await http.SendAsync(request, cancellation);
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                var status = (int)response.StatusCode;
                if (status == 429 && retry < 2)
                {
                    await Task.Delay(65_000, cancellation);
                    return await Request<T>(route, body, cancellation, rememberSession, retry + 1);
                }
                var message = "HTTP " + status;
                if (response.Content.Headers.ContentType?.MediaType == "application/json")
                {
                    try { message = JsonUtility.FromJson<ErrorEnvelope>(json)?.error?.message ?? message; }
                    catch (ArgumentException) { }
                }
                throw new Wave1ApiException(status, message);
            }

            if (typeof(T) == typeof(string)) return (T)(object)json;
            T value;
            try { value = JsonUtility.FromJson<T>(json); }
            catch (ArgumentException error) { throw new InvalidDataException("Invalid Wave 1 API response.", error); }
            if (rememberSession)
            {
                var session = value as SessionView;
                var signed = response.Headers.TryGetValues("Set-Cookie", out var setCookies)
                    ? setCookies.Select(header => header.Split(';')[0]).FirstOrDefault(ValidCookie)
                    : null;
                if (signed == null || session?.csrfToken == null || session.csrfToken.Length != 64 ||
                    !session.csrfToken.All(Uri.IsHexDigit))
                    throw new InvalidDataException("The API returned an invalid local session.");
                SaveSession(signed, session.csrfToken);
                cookie = signed;
                csrf = session.csrfToken;
            }
            return value ?? throw new InvalidDataException("The API returned an empty response.");
        }

        private void SaveSession(string signed, string token)
        {
            var directory = Path.GetDirectoryName(sessionPath);
            Directory.CreateDirectory(directory);
            if (Path.DirectorySeparatorChar == '/' && Chmod(directory, 448u) != 0)
                throw new IOException("Could not restrict the local session directory.");
            var temporary = sessionPath + "." + Guid.NewGuid().ToString("N");
            try
            {
                File.WriteAllLines(temporary, new[] { signed, token });
                if (File.Exists(sessionPath)) File.Replace(temporary, sessionPath, null);
                else File.Move(temporary, sessionPath);
            }
            finally { File.Delete(temporary); }
        }

        [DllImport("libc", EntryPoint = "chmod")] private static extern int Chmod(string path, uint mode);

        private static bool ValidCookie(string value) =>
            value != null && value.StartsWith(CookieName, StringComparison.Ordinal) &&
            value.Length > CookieName.Length && value.Length < 512 &&
            value.Skip(CookieName.Length).All(character =>
                character > ' ' && character < 127 && character != ';' && character != ',');

        private static Uri LoopbackOrigin(string input)
        {
            if (!Uri.TryCreate(input, UriKind.Absolute, out var uri) ||
                (uri.Host != "127.0.0.1" && uri.Host != "[::1]") ||
                (uri.Scheme != "http" && uri.Scheme != "https") ||
                uri.AbsolutePath != "/" || uri.Query != "" || uri.Fragment != "" || uri.UserInfo != "")
                throw new ArgumentException("Pet Arena requires an explicit loopback HTTP origin.");
            return uri;
        }

        [Serializable] private sealed class GuestInput { public string requestId, displayName, avatarKey; }
        [Serializable] private sealed class LoginInput { public string loginName, password, requestId; }
        [Serializable] private sealed class SessionView { public string csrfToken = null; }
        [Serializable] private sealed class ErrorEnvelope { public ErrorView error = null; }
        [Serializable] private sealed class ErrorView { public string message = null; }
    }

    public sealed class Wave1ApiException : Exception
    {
        public int Status { get; }

        public Wave1ApiException(int status, string message) : base(message) => Status = status;
    }
}
