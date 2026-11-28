using System;
using System.Globalization;
using Aetheria.Networking;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Aetheria.PetArena.Infrastructure
{
    // Strict parser for the room-scoped cooperative admission response. It
    // carries the exact WSS scope (match, boot, account, content hash) and a
    // one-use ticket; a lobby must call the room admission route again to renew.
    public sealed class CoopNativeAdmission
    {
        public const int MaxTicketLength = 8192;
        private static readonly TimeSpan MaximumLifetime = TimeSpan.FromSeconds(31);

        [DataContract]
        private sealed class Payload
        {
            [DataMember(IsRequired = true)] public string roomId, bossId, matchId, bootId, accountId, wssUrl, httpsOrigin, ticket, expiresAt, contentHash;
            [DataMember(IsRequired = true)] public int seat;
            [DataMember] public string clientBuild;
        }

        public Guid RoomId { get; }
        public string BossId { get; }
        public Guid MatchId { get; }
        public Guid BootId { get; }
        public Guid AccountId { get; }
        public int Seat { get; }
        public Uri WssOrigin { get; }
        public Uri HttpsOrigin { get; }
        public string Ticket { get; }
        public DateTimeOffset ExpiresAt { get; }
        public byte[] ContentHash { get; }
        public string ClientBuild { get; }

        private CoopNativeAdmission(Payload payload)
        {
            RoomId = Guid.Parse(payload.roomId);
            BossId = payload.bossId;
            MatchId = Guid.Parse(payload.matchId);
            BootId = Guid.Parse(payload.bootId);
            AccountId = Guid.Parse(payload.accountId);
            Seat = payload.seat;
            WssOrigin = new Uri(payload.wssUrl, UriKind.Absolute);
            HttpsOrigin = new Uri(payload.httpsOrigin, UriKind.Absolute);
            Ticket = payload.ticket;
            ExpiresAt = DateTimeOffset.Parse(payload.expiresAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
            ContentHash = Hex(payload.contentHash);
            ClientBuild = payload.clientBuild ?? NativeConnection.LegacyClientBuild;
        }

        public static CoopNativeAdmission Decode(string json)
        {
            if (string.IsNullOrWhiteSpace(json) || json.Length > 16384) throw new FormatException("Invalid coop admission");
            Payload payload;
            try
            {
                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
                payload = (Payload)new DataContractJsonSerializer(typeof(Payload)).ReadObject(stream);
            }
            catch (SerializationException error) { throw new FormatException("Invalid coop admission", error); }
            if (payload == null || string.IsNullOrEmpty(payload.bossId) || !System.Text.RegularExpressions.Regex.IsMatch(payload.bossId, @"\A[a-z][a-z0-9-]{2,63}\z") || payload.seat < 0 || payload.seat > 3 ||
                !Guid.TryParse(payload.roomId, out var room) || room == Guid.Empty ||
                !Guid.TryParse(payload.matchId, out var match) || match == Guid.Empty ||
                !Guid.TryParse(payload.bootId, out var boot) || boot == Guid.Empty ||
                !Guid.TryParse(payload.accountId, out var account) || account == Guid.Empty ||
                !Uri.TryCreate(payload.wssUrl, UriKind.Absolute, out var wss) || wss.Scheme != "wss" ||
                wss.AbsolutePath != "/rt/v1" || wss.Query.Length != 0 || wss.Fragment.Length != 0 || wss.UserInfo.Length != 0 ||
                !Uri.TryCreate(payload.httpsOrigin, UriKind.Absolute, out var https) || https.Scheme != "https" ||
                https.AbsoluteUri.TrimEnd('/') != https.GetLeftPart(UriPartial.Authority) || https.UserInfo.Length != 0 ||
                wss.Authority != https.Authority ||
                payload.ticket == null || payload.ticket.Length < 20 || payload.ticket.Length > MaxTicketLength ||
                payload.contentHash == null || payload.contentHash.Length != 64 ||
                payload.clientBuild != null && !NativeConnection.SupportsJewelFeedback(payload.clientBuild))
                throw new FormatException("Invalid coop admission scope");
            var admission = new CoopNativeAdmission(payload);
            var lifetime = admission.ExpiresAt - DateTimeOffset.UtcNow;
            if (lifetime <= TimeSpan.Zero || lifetime > MaximumLifetime)
                throw new FormatException("Coop admission ticket is outside its window");
            return admission;
        }

        public NativeConnection CreateConnection(
            Func<System.Threading.CancellationToken, System.Threading.Tasks.Task<CoopNativeAdmission>> renew = null)
        {
            var used = 0;
            return new NativeConnection(WssOrigin, HttpsOrigin, ContentHash, BootId, async cancellation =>
            {
                if (System.Threading.Interlocked.Exchange(ref used, 1) == 0)
                    return new AdmissionTicket(Ticket, AccountId.ToString(), ExpiresAt);
                if (renew == null) throw new NativeFailure(Failure.Authentication);
                var next = await renew(cancellation).ConfigureAwait(false);
                if (next.RoomId != RoomId || next.BossId != BossId || next.WssOrigin != WssOrigin || next.HttpsOrigin != HttpsOrigin ||
                    next.MatchId != MatchId || next.BootId != BootId || next.AccountId != AccountId ||
                    next.Seat != Seat || next.ClientBuild != ClientBuild || next.ContentHash.Length != ContentHash.Length)
                    throw new NativeFailure(Failure.Scope);
                for (var index = 0; index < ContentHash.Length; index += 1)
                    if (next.ContentHash[index] != ContentHash[index]) throw new NativeFailure(Failure.Scope);
                return new AdmissionTicket(next.Ticket, next.AccountId.ToString(), next.ExpiresAt);
            }, clientBuild: ClientBuild);
        }

        private static byte[] Hex(string value)
        {
            if (value == null || value.Length != 64) throw new FormatException("Invalid coop content hash");
            var bytes = new byte[32];
            for (var index = 0; index < bytes.Length; index += 1)
            {
                if (!byte.TryParse(value.Substring(index * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out bytes[index]))
                    throw new FormatException("Invalid coop content hash");
            }
            return bytes;
        }
    }
}
