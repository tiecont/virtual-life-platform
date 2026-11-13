using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

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
            Result result;
            try { using (var stream = new MemoryStream(bytes)) result = (Result)new DataContractJsonSerializer(typeof(Result)).ReadObject(stream); }
            catch (Exception e) when (e is SerializationException || e is System.Xml.XmlException) { throw new NativeFailure(Failure.Protocol); }
            if (result?.State == null || result.Epoch < 1 || result.State.Turns < 0 || result.State.Turns > 3 ||
                (ulong)result.State.Turns != version || result.State.Roll < 0 || result.State.Roll >= 100 ||
                (result.Reward != null && result.Reward != "REWARD_PENDING" && result.Reward != "GRANTED" && result.Reward != "DECLINED"))
                throw new NativeFailure(Failure.Protocol);
            return new PlayState(version, result.Epoch, result.State.Turns, result.State.Roll, result.Reward);
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
        [DataContract] private sealed class Result {
            [DataMember(Name = "state", IsRequired = true)] public Counter State { get; set; }
            [DataMember(Name = "epoch", IsRequired = true)] public long Epoch { get; set; }
            [DataMember(Name = "reward")] public string Reward { get; set; }
        }
        [DataContract] private sealed class Counter {
            [DataMember(Name = "turns", IsRequired = true)] public int Turns { get; set; }
            [DataMember(Name = "ownRoll", IsRequired = true)] public int Roll { get; set; }
        }
    }
}
