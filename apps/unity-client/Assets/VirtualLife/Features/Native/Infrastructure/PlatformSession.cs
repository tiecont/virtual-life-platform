using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace VirtualLife.Networking
{
    /// <summary>In-memory scoped cookie session. No redirects, disk credentials or caller-selected ticket scope.</summary>
    public sealed class PlatformSession : IDisposable
    {
        private readonly HttpClient http;
        private readonly Uri origin;
        private readonly SemaphoreSlim operation = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private string principal, csrf, logoutCsrf;
        private bool disposed;

        public PlatformSession(Uri origin) : this(origin, new HttpClientHandler {
            AllowAutoRedirect = false, UseCookies = true, CookieContainer = new CookieContainer()
        }) { }

        // A custom handler is useful for isolated TLS fixtures; production uses system trust.
        public PlatformSession(Uri origin, HttpClientHandler handler)
        {
            if (origin == null || origin.Scheme != "https" || origin.UserInfo.Length != 0 ||
                origin.AbsoluteUri.TrimEnd('/') != origin.GetLeftPart(UriPartial.Authority) || handler == null ||
                handler.AllowAutoRedirect || !handler.UseCookies) throw new ArgumentException("Explicit HTTPS cookie scope required");
            this.origin = origin;
            http = new HttpClient(handler, true) { Timeout = System.Threading.Timeout.InfiniteTimeSpan };
        }

        public Task LoginAsync(string loginName, string password, Guid requestId, CancellationToken cancellation = default)
        {
            if (loginName == null || !Regex.IsMatch(loginName, "^[a-z][a-z0-9_]{2,31}$") ||
                password == null || password.Length < 12 || password.Length > 128 || requestId == Guid.Empty)
                throw new ArgumentException("Invalid login input");
            return Exclusive(async token => {
                principal = null; csrf = null; logoutCsrf = null;
                var me = await Send<Login, Me>("/v1/session/login", new Login {
                    Name = loginName, Password = password, RequestId = requestId.ToString()
                }, token).ConfigureAwait(false);
                if (me?.Profile == null || !Guid.TryParse(me.Profile.Id, out var id) || id == Guid.Empty ||
                    me.Csrf == null || !Regex.IsMatch(me.Csrf, "^[a-f0-9]{64}$") || ParseDate(me.Expires) <= DateTimeOffset.UtcNow)
                    throw new NativeFailure(Failure.Authentication);
                principal = id.ToString(); csrf = me.Csrf; logoutCsrf = me.Csrf; return true;
            }, cancellation);
        }

        public Task<AdmissionTicket> TicketAsync(CancellationToken cancellation = default)
        {
            return Exclusive(async token => {
                if (principal == null || csrf == null) throw new NativeFailure(Failure.Authentication);
                var result = await Send<Empty, Ticket>("/v1/runtime-ticket", new Empty(), token).ConfigureAwait(false);
                var expiry = ParseDate(result?.Expires);
                if (string.IsNullOrEmpty(result?.Value) || result.Value.Length > 4096 || expiry <= DateTimeOffset.UtcNow ||
                    expiry > DateTimeOffset.UtcNow.AddSeconds(31)) throw new NativeFailure(Failure.Authentication);
                return new AdmissionTicket(result.Value, principal, expiry);
            }, cancellation);
        }

        public Task LogoutAsync(Guid requestId, CancellationToken cancellation = default)
        {
            if (requestId == Guid.Empty) throw new ArgumentException("Logout request ID required");
            return Exclusive(async token => {
                // Cancellation invalidates ticket authority, but must retain the
                // last authenticated CSRF solely for attempting server revocation.
                if (logoutCsrf == null) throw new NativeFailure(Failure.Authentication);
                var result = await Send<Empty, LoggedOut>("/v1/session/logout", new Empty(), token, requestId).ConfigureAwait(false);
                if (result == null || !result.Value) throw new NativeFailure(Failure.Protocol);
                principal = null; csrf = null; logoutCsrf = null; return true;
            }, cancellation, waitForOperation: true);
        }

        private async Task<TResponse> Send<TRequest, TResponse>(string path, TRequest body, CancellationToken token, Guid? requestId = null)
        {
            using (var data = new MemoryStream())
            using (var request = new HttpRequestMessage(HttpMethod.Post, new Uri(origin, path)))
            {
                new DataContractJsonSerializer(typeof(TRequest)).WriteObject(data, body);
                request.Content = new ByteArrayContent(data.ToArray());
                request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                request.Headers.Add("Origin", origin.GetLeftPart(UriPartial.Authority));
                if (path == "/v1/runtime-ticket") request.Headers.Add("X-CSRF-Token", csrf);
                if (path == "/v1/session/logout") request.Headers.Add("X-CSRF-Token", logoutCsrf);
                if (requestId.HasValue) request.Headers.Add("Idempotency-Key", requestId.Value.ToString());
                using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false))
                {
                    if (!response.IsSuccessStatusCode) throw new NativeFailure(Failure.Authentication);
                    if (response.Content.Headers.ContentType?.MediaType != "application/json" ||
                        response.Content.Headers.ContentLength > 16384) throw new NativeFailure(Failure.Protocol);
                    using (var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using (var bounded = new MemoryStream())
                    {
                        var buffer = new byte[2048]; int count;
                        while ((count = await stream.ReadAsync(buffer, 0, buffer.Length, token).ConfigureAwait(false)) > 0) {
                            if (bounded.Length + count > 16384) throw new NativeFailure(Failure.Protocol);
                            bounded.Write(buffer, 0, count);
                        }
                        bounded.Position = 0;
                        try { return (TResponse)new DataContractJsonSerializer(typeof(TResponse)).ReadObject(bounded); }
                        catch (SerializationException) { throw new NativeFailure(Failure.Protocol); }
                    }
                }
            }
        }

        private async Task<T> Exclusive<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellation, bool waitForOperation = false)
        {
            if (disposed) throw new ObjectDisposedException(nameof(PlatformSession));
            // BoundedTicket can finish cancellation before its HTTP provider has
            // unwound. Logout must drain that provider before revoking the cookie.
            if (waitForOperation) await operation.WaitAsync(cancellation).ConfigureAwait(false);
            else if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            using (var bounded = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token))
            {
                bounded.CancelAfter(TimeSpan.FromSeconds(5));
                try { return await action(bounded.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) {
                    principal = null; csrf = null;
                    if (cancellation.IsCancellationRequested || lifetime.IsCancellationRequested) throw;
                    throw new NativeFailure(Failure.Timeout);
                }
                catch (NativeFailure) { principal = null; csrf = null; throw; }
                catch (Exception) { principal = null; csrf = null; throw new NativeFailure(Failure.Transport); }
                finally { operation.Release(); }
            }
        }

        private static DateTimeOffset ParseDate(string value)
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date))
                throw new NativeFailure(Failure.Protocol);
            return date;
        }
        public void Dispose() { if (disposed) return; disposed = true; lifetime.Cancel(); http.Dispose(); principal = null; csrf = null; logoutCsrf = null; }
        public override string ToString() { return "PlatformSession[redacted]"; }

        [DataContract] private sealed class Empty { }
        [DataContract] private sealed class LoggedOut { [DataMember(Name = "loggedOut", IsRequired = true)] public bool Value { get; set; } }
        [DataContract] private sealed class Login {
            [DataMember(Name = "loginName")] public string Name { get; set; }
            [DataMember(Name = "password")] public string Password { get; set; }
            [DataMember(Name = "requestId")] public string RequestId { get; set; }
        }
        [DataContract] private sealed class Profile { [DataMember(Name = "id")] public string Id { get; set; } }
        [DataContract] private sealed class Me {
            [DataMember(Name = "profile")] public Profile Profile { get; set; }
            [DataMember(Name = "csrfToken")] public string Csrf { get; set; }
            [DataMember(Name = "expiresAt")] public string Expires { get; set; }
        }
        [DataContract] private sealed class Ticket {
            [DataMember(Name = "ticket")] public string Value { get; set; }
            [DataMember(Name = "expiresAt")] public string Expires { get; set; }
        }
    }
}
