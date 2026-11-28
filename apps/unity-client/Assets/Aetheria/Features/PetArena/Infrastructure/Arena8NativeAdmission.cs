using System;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.Networking;

namespace Aetheria.PetArena.Infrastructure
{
    // Validated `arena8-pve` native allocation. The Nest route supplies the
    // admission ticket, the WSS endpoint, the content hash and the immutable boot
    // and match ids. Nothing here is client-selected scope: a re-issued ticket
    // must address the same match and boot or the session fails closed.
    public sealed class Arena8NativeAdmission
    {
        public const int MaxTicketLength = 4096;
        public const string WebSocketPath = "/rt/v1";
        // The allocation contract carries a ticket, not a lifetime. NativeConnection
        // requires an expiry inside the admission window, so an unlabelled ticket is
        // treated as a short lease and renewed before it can go stale.
        private static readonly TimeSpan AssumedTicketLifetime = TimeSpan.FromSeconds(25);
        private static readonly TimeSpan MaximumTicketLifetime = TimeSpan.FromSeconds(31);
        private readonly Func<CancellationToken, Task<Arena8NativeAllocation>> allocate;
        private readonly string expectedRuleset;

        public Uri WssOrigin { get; }
        public Uri HttpsOrigin { get; }
        public byte[] ContentHash { get; }
        public Guid BootId { get; }
        public Guid MatchId { get; }
        public string MatchIdText { get; }
        public string ClientBuild { get; }

        private Arena8NativeAdmission(Func<CancellationToken, Task<Arena8NativeAllocation>> allocate,
            Scope scope, string expectedRuleset)
        {
            this.allocate = allocate;
            this.expectedRuleset = expectedRuleset;
            WssOrigin = scope.WssOrigin; HttpsOrigin = scope.HttpsOrigin; ContentHash = (byte[])scope.ContentHash.Clone();
            BootId = scope.BootId; MatchId = scope.MatchId; MatchIdText = MatchId.ToString();
            ClientBuild = scope.ClientBuild;
        }

        public static async Task<Arena8NativeAdmission> OpenAsync(
            Func<CancellationToken, Task<Arena8NativeAllocation>> allocate, CancellationToken cancellation = default,
            string expectedRuleset = null)
        {
            if (allocate == null) throw new ArgumentNullException(nameof(allocate));
            var response = await allocate(cancellation).ConfigureAwait(false);
            return new Arena8NativeAdmission(allocate, Scope.Parse(response, DateTimeOffset.UtcNow, expectedRuleset),
                expectedRuleset);
        }

        // Re-admission for a reconnect. The same allocation request is replayed, so
        // a fresh ticket must still address the original match and boot incarnation.
        public async Task<AdmissionTicket> TicketAsync(CancellationToken cancellation = default)
        {
            var response = await allocate(cancellation).ConfigureAwait(false);
            var scope = Scope.Parse(response, DateTimeOffset.UtcNow, expectedRuleset);
            if (scope.WssOrigin != WssOrigin || scope.HttpsOrigin != HttpsOrigin ||
                scope.ClientBuild != ClientBuild || !scope.ContentHash.SequenceEqual(ContentHash) || scope.BootId != BootId || scope.MatchId != MatchId)
                throw new NativeFailure(Failure.Scope);
            return scope.Ticket;
        }

        private sealed class Scope
        {
            public Uri WssOrigin, HttpsOrigin;
            public byte[] ContentHash = Array.Empty<byte>();
            public Guid BootId, MatchId;
            public AdmissionTicket Ticket;
            public string ClientBuild;

            public static Scope Parse(Arena8NativeAllocation response, DateTimeOffset now, string expectedRuleset)
            {
                if (response == null || string.IsNullOrEmpty(response.ticket) || string.IsNullOrEmpty(response.wssUrl) ||
                    string.IsNullOrEmpty(response.httpsOrigin) || string.IsNullOrEmpty(response.contentHash) ||
                    string.IsNullOrEmpty(response.bootId) || string.IsNullOrEmpty(response.matchId))
                    throw new NativeFailure(Failure.Protocol);
                if (!string.Equals(response.ruleset ?? "", expectedRuleset ?? "", StringComparison.Ordinal))
                    throw new NativeFailure(Failure.Scope);
                if (response.clientBuild != null && (expectedRuleset != CoopNativeView.FunctionalSoloRuleset ||
                    response.clientBuild != NativeConnection.JewelFeedbackClientBuild))
                    throw new NativeFailure(Failure.Scope);
                var https = Canonical(response.httpsOrigin, "https");
                var wss = Canonical(response.wssUrl, "wss");
                // The platform origin is an authority only; the socket endpoint is
                // exactly "/rt/v1" on that same authority.
                if (https.AbsolutePath != "/" || https.Query.Length != 0 || https.Fragment.Length != 0 ||
                    https.AbsoluteUri.TrimEnd('/') != https.GetLeftPart(UriPartial.Authority) ||
                    wss.AbsolutePath != WebSocketPath || wss.Query.Length != 0 || wss.Fragment.Length != 0 ||
                    !string.Equals(wss.Authority, https.Authority, StringComparison.Ordinal))
                    throw new NativeFailure(Failure.Scope);
                var hash = Hash(response.contentHash);
                if (!Guid.TryParse(response.bootId, out var boot) || boot == Guid.Empty ||
                    !Guid.TryParse(response.matchId, out var match) || match == Guid.Empty)
                    throw new NativeFailure(Failure.Protocol);
                if (response.ticket.Length > MaxTicketLength) throw new NativeFailure(Failure.Protocol);
                var expiry = Expiry(response.expiresAt, now);
                var principal = Principal(response.principal) ?? match.ToString();
                return new Scope
                {
                    WssOrigin = wss, HttpsOrigin = https, ContentHash = hash, BootId = boot, MatchId = match,
                    ClientBuild = response.clientBuild ?? NativeConnection.LegacyClientBuild,
                    Ticket = new AdmissionTicket(response.ticket, principal, expiry),
                };
            }

            private static Uri Canonical(string value, string scheme)
            {
                if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != scheme ||
                    uri.UserInfo.Length != 0 || uri.Host.Length == 0)
                    throw new NativeFailure(Failure.Scope);
                return uri;
            }

            private static byte[] Hash(string value)
            {
                if (value.Length != 64 || !value.All(Uri.IsHexDigit)) throw new NativeFailure(Failure.Protocol);
                var hash = new byte[32];
                for (var at = 0; at < 32; at++) hash[at] = Convert.ToByte(value.Substring(at * 2, 2), 16);
                if (hash.All(octet => octet == 0)) throw new NativeFailure(Failure.Protocol);
                return hash;
            }

            private static DateTimeOffset Expiry(string value, DateTimeOffset now)
            {
                var assumed = now + AssumedTicketLifetime;
                if (string.IsNullOrEmpty(value)) return assumed;
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var expiry))
                    throw new NativeFailure(Failure.Protocol);
                if (expiry <= now || expiry > now + MaximumTicketLifetime) throw new NativeFailure(Failure.Authentication);
                return expiry;
            }

            private static string Principal(string value)
            {
                if (string.IsNullOrEmpty(value)) return null;
                if (value.Length > 128 || value.Any(character => character <= ' ' || character >= 127))
                    throw new NativeFailure(Failure.Protocol);
                return value;
            }
        }
    }
}
