using System;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;

namespace VirtualLife.Networking
{
    public sealed class PlayState
    {
        public ulong Version { get; }
        public long Epoch { get; }
        public int Turns { get; }
        public int OwnRoll { get; }
        public string Reward { get; }
        internal PlayState(ulong version, long epoch, int turns, int roll, string reward)
        { Version = version; Epoch = epoch; Turns = turns; OwnRoll = roll; Reward = reward; }
    }

    /// <summary>Scene use cases over the existing adapter. Only server receipts update state.</summary>
    public sealed class SyntheticPlaySession : IDisposable
    {
        private readonly PlatformSession platform;
        private readonly NativeConnection connection;
        private readonly Guid match;
        private readonly SemaphoreSlim operation = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private GameCommand pending;
        private volatile PlayState state;
        private volatile bool disposed;
        public PlayState State => state;
        public bool HasPendingCommand => pending != null;
        public VirtualLife.Native.Public.V1.WorldSnapshot MovementState => connection.Snapshot?.Clone();
        public bool NeedsRefresh => connection.NeedsRefresh;
        public async Task<VirtualLife.Native.Public.V1.WorldSnapshot> MoveAsync(int x, int z, CancellationToken cancellation = default)
        {
            if (disposed) throw new ObjectDisposedException(nameof(SyntheticPlaySession));
            if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            try { return await connection.MoveAsync(x, z, cancellation).ConfigureAwait(false); }
            finally { operation.Release(); }
        }

        // The caller owns no credentials; both adapters are disposed with this use case.
        public SyntheticPlaySession(PlatformSession platform, NativeConnection connection, Guid match)
        {
            if (platform == null || connection == null || match == Guid.Empty) throw new ArgumentException("Native play scope required");
            this.platform = platform; this.connection = connection; this.match = match;
        }
        public Task<PlayState> LoginAsync(string name, string password, CancellationToken cancellation = default) =>
            Exclusive(async token => {
                if (pending != null) throw new NativeFailure(Failure.Busy);
                await platform.LoginAsync(name, password, Guid.NewGuid(), token).ConfigureAwait(false);
                await connection.ConnectAsync(token).ConfigureAwait(false);
                await connection.ResyncAsync(token).ConfigureAwait(false);
                return await Read(token).ConfigureAwait(false);
            }, cancellation);

        public Task<PlayState> ReconnectAsync(CancellationToken cancellation = default) =>
            Exclusive(async token => {
                await connection.ReconnectAsync(token).ConfigureAwait(false);
                return await Read(token).ConfigureAwait(false);
            }, cancellation);

        public async Task LogoutAsync(Guid requestId, CancellationToken cancellation = default)
        {
            if (requestId == Guid.Empty) throw new ArgumentException("Logout request ID required");
            if (disposed) throw new ObjectDisposedException(nameof(SyntheticPlaySession));
            disposed = true;
            lifetime.Cancel(); connection.Dispose();
            var entered = false;
            try {
                // Abort any ambiguous game exchange before revoking this identity
                // session. Durable server effects remain available at next login.
                await operation.WaitAsync(cancellation).ConfigureAwait(false); entered = true;
                await platform.LogoutAsync(requestId, cancellation).ConfigureAwait(false);
            } finally {
                platform.Dispose(); state = null; pending = null;
                if (entered) operation.Release();
            }
        }

        public Task<PlayState> AdvanceAsync(CancellationToken cancellation = default) =>
            Exclusive(async token => {
                if (pending != null) throw new NativeFailure(Failure.Busy);
                var current = state;
                if (current == null || current.Turns >= 3) throw new NativeFailure(Failure.Rejected);
                pending = new GameCommand(Guid.NewGuid(), match, current.Version, "fixture.advance.v1",
                    Encoding.UTF8.GetBytes("{\"epoch\":" + current.Epoch.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}"));
                return await CommitPending(token).ConfigureAwait(false);
            }, cancellation);

        public Task<PlayState> RetryAsync(CancellationToken cancellation = default) =>
            Exclusive(async token => {
                if (pending == null) throw new NativeFailure(Failure.Rejected);
                // Reconnect gets a fresh ticket. Retain the same immutable command,
                // even if a view now shows that its original result was committed.
                await connection.ReconnectAsync(token).ConfigureAwait(false);
                return await CommitPending(token).ConfigureAwait(false);
            }, cancellation);

        private async Task<PlayState> CommitPending(CancellationToken token)
        {
            try {
                var receipt = await connection.SubmitAsync(pending, token).ConfigureAwait(false);
                if (!receipt.Receipt.Committed) throw new NativeFailure(Failure.Protocol);
                var result = Decode(receipt.CanonicalVersion, receipt.Receipt.AuthorizedProjection.ToByteArray());
                token.ThrowIfCancellationRequested();
                pending = null; return result;
            } catch (NativeFailure e) when (e.Reason == Failure.Rejected && e.Code != VirtualLife.Native.Public.V1.ErrorCode.TemporarilyUnavailable && e.Code != VirtualLife.Native.Public.V1.ErrorCode.Backpressure) {
                // A definite server rejection has no ambiguous effect to retry.
                pending = null; throw;
            }
        }
        private async Task<PlayState> Read(CancellationToken token)
        {
            var receipt = await connection.SubmitAsync(new GameCommand(Guid.NewGuid(), match, 0, "fixture.view.v1", Array.Empty<byte>()), token).ConfigureAwait(false);
            if (receipt.Receipt.Committed) throw new NativeFailure(Failure.Protocol);
            return Decode(receipt.CanonicalVersion, receipt.Receipt.AuthorizedProjection.ToByteArray());
        }
        private static PlayState Decode(ulong version, byte[] bytes)
        {
            XElement result;
            // Protobuf's existing JSON parser checks the complete document; the
            // XML infoset preserves duplicate keys that Struct's map would overwrite.
            try {
                new Google.Protobuf.JsonParser(new Google.Protobuf.JsonParser.Settings(8))
                    .Parse<Google.Protobuf.WellKnownTypes.Struct>(new UTF8Encoding(false, true).GetString(bytes));
                var quotas = new XmlDictionaryReaderQuotas { MaxDepth = 8, MaxStringContentLength = 4096, MaxArrayLength = 32 };
                using (var reader = JsonReaderWriterFactory.CreateJsonReader(bytes, quotas)) result = XDocument.Load(reader).Root;
            } catch (Exception error) when (error is XmlException || error is DecoderFallbackException ||
                error is Google.Protobuf.InvalidJsonException || error is Google.Protobuf.InvalidProtocolBufferException) {
                throw new NativeFailure(Failure.Protocol);
            }
            ObjectFields(result, "state", "epoch", "reward");
            var counter = result.Element("state");
            ObjectFields(counter, "turns", "ownRoll");
            var epoch = Integer(result.Element("epoch"));
            var turns = Integer(counter.Element("turns"));
            var roll = Integer(counter.Element("ownRoll"));
            var rewardField = result.Element("reward");
            var reward = rewardField == null ? null : Scalar(rewardField, Type(rewardField) == "null" ? "null" : "string");
            if (rewardField != null && Type(rewardField) == "null") {
                if (reward.Length != 0) throw new NativeFailure(Failure.Protocol);
                reward = null;
            }
            if (epoch < 1 || turns < 0 || turns > 3 || (ulong)turns != version || roll < 0 || roll >= 100 ||
                (reward != null && reward != "REWARD_PENDING" && reward != "GRANTED" && reward != "DECLINED"))
                throw new NativeFailure(Failure.Protocol);
            return new PlayState(version, epoch, (int)turns, (int)roll, reward);
        }
        private static string Type(XElement field)
        {
            if (field == null || field.Attributes().Count() != 1 || field.Attribute("type") == null)
                throw new NativeFailure(Failure.Protocol);
            return field.Attribute("type").Value;
        }
        private static void ObjectFields(XElement field, params string[] names)
        {
            if (Type(field) != "object" || field.Nodes().Any(node => !(node is XElement)) ||
                field.Elements().Any(child => child.Name.NamespaceName.Length != 0 || !names.Contains(child.Name.LocalName)) ||
                field.Elements().Select(child => child.Name).Distinct().Count() != field.Elements().Count())
                throw new NativeFailure(Failure.Protocol);
        }
        private static string Scalar(XElement field, string type)
        {
            if (Type(field) != type || field.HasElements) throw new NativeFailure(Failure.Protocol);
            return field.Value;
        }
        private static long Integer(XElement field)
        {
            if (!long.TryParse(Scalar(field, "number"), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value))
                throw new NativeFailure(Failure.Protocol);
            return value;
        }
        private async Task<PlayState> Exclusive(Func<CancellationToken, Task<PlayState>> work, CancellationToken cancellation)
        {
            if (disposed) throw new ObjectDisposedException(nameof(SyntheticPlaySession));
            if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            using (var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token)) {
                try {
                    var result = await work(linked.Token).ConfigureAwait(false);
                    linked.Token.ThrowIfCancellationRequested(); state = result; return result;
                } finally { operation.Release(); }
            }
        }
        public void Dispose() { if (disposed) return; disposed = true; lifetime.Cancel(); connection.Dispose(); platform.Dispose(); state = null; pending = null; }
        public override string ToString() => "SyntheticPlaySession[redacted]";
    }
}
