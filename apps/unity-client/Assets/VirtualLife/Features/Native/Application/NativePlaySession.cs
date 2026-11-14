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
        public PetArenaView Arena { get; }
        public string ReceiptId { get; internal set; }
        internal PlayState(ulong version, long epoch, int turns, int roll, string reward, PetArenaView arena = null)
        { Version = version; Epoch = epoch; Turns = turns; OwnRoll = roll; Reward = reward; Arena = arena; }
    }

    /// <summary>Scene use cases over the existing adapter. Only server receipts update state.</summary>
    public abstract class NativePlaySession : IDisposable
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
            if (disposed) throw new ObjectDisposedException(nameof(NativePlaySession));
            if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            try { return await connection.MoveAsync(x, z, cancellation).ConfigureAwait(false); }
            finally { operation.Release(); }
        }

        // The caller owns no credentials; both adapters are disposed with this use case.
        protected NativePlaySession(PlatformSession platform, NativeConnection connection, Guid match)
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
            if (disposed) throw new ObjectDisposedException(nameof(NativePlaySession));
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

        protected abstract string ViewKind { get; }
        protected abstract PlayState Decode(ulong version, byte[] bytes);
        public abstract Task<PlayState> AdvanceAsync(CancellationToken cancellation = default);
        protected Task<PlayState> SubmitPending(Func<PlayState, Guid, GameCommand> create, CancellationToken cancellation) =>
            Exclusive(async token => {
                if (pending != null) throw new NativeFailure(Failure.Busy);
                if (state == null) throw new NativeFailure(Failure.Rejected);
                pending = create(state, match);
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
                result.ReceiptId = Convert.ToBase64String(receipt.CommandId.ToByteArray());
                token.ThrowIfCancellationRequested();
                pending = null; return result;
            } catch (NativeFailure e) when (e.Reason == Failure.Rejected && e.Code != VirtualLife.Native.Public.V1.ErrorCode.TemporarilyUnavailable && e.Code != VirtualLife.Native.Public.V1.ErrorCode.Backpressure) {
                // A definite server rejection has no ambiguous effect to retry.
                pending = null; throw;
            }
        }
        private async Task<PlayState> Read(CancellationToken token)
        {
            var receipt = await connection.SubmitAsync(new GameCommand(Guid.NewGuid(), match, 0, ViewKind, Array.Empty<byte>()), token).ConfigureAwait(false);
            if (receipt.Receipt.Committed) throw new NativeFailure(Failure.Protocol);
            return Decode(receipt.CanonicalVersion, receipt.Receipt.AuthorizedProjection.ToByteArray());
        }
        private async Task<PlayState> Exclusive(Func<CancellationToken, Task<PlayState>> work, CancellationToken cancellation)
        {
            if (disposed) throw new ObjectDisposedException(nameof(NativePlaySession));
            if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            using (var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token)) {
                try {
                    var result = await work(linked.Token).ConfigureAwait(false);
                    linked.Token.ThrowIfCancellationRequested(); state = result; return result;
                } finally { operation.Release(); }
            }
        }
        public void Dispose() { if (disposed) return; disposed = true; lifetime.Cancel(); connection.Dispose(); platform.Dispose(); state = null; pending = null; }
        public override string ToString() => "NativePlaySession[redacted]";
    }
}
