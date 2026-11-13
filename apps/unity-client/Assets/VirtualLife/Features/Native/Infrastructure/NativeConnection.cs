using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using VirtualLife.Native.Public.V1;

namespace VirtualLife.Networking
{
    public enum ConnectionState { Disconnected, Connecting, Ready, Faulted, Disposed }
    public enum Failure { Busy, Transport, Timeout, Authentication, Protocol, Scope, Rejected }

    public sealed class NativeFailure : Exception
    {
        public Failure Reason { get; }
        public ErrorCode Code { get; }
        public NativeFailure(Failure reason, ErrorCode code = ErrorCode.ErrorUnspecified)
            : base("Native connection: " + reason) { Reason = reason; Code = code; }
    }

    // Credentials intentionally have neither public fields nor a useful ToString.
    public sealed class AdmissionTicket
    {
        internal readonly string Value;
        internal readonly string Principal;
        internal readonly DateTimeOffset Expires;
        public AdmissionTicket(string value, string principal, DateTimeOffset expires)
        { Value = value; Principal = principal; Expires = expires; }
        public override string ToString() { return "AdmissionTicket[redacted]"; }
    }

    public sealed class GameCommand
    {
        internal readonly ByteString Id, Match, Action;
        internal readonly ulong Version;
        internal readonly string Kind;
        public GameCommand(Guid id, Guid match, ulong expectedVersion, string kind, byte[] action)
        {
            if (id == Guid.Empty || match == Guid.Empty || string.IsNullOrEmpty(kind) || kind.Length > 64 ||
                action == null || action.Length > 16384) throw new ArgumentException("Invalid native command");
            Id = WireUuid(id); Match = WireUuid(match); Version = expectedVersion;
            Kind = kind; Action = ByteString.CopyFrom(action);
        }
        internal static ByteString WireUuid(Guid id)
        {
            var hex = id.ToString("N"); var bytes = new byte[16];
            for (var i = 0; i < 16; i++) bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            return ByteString.CopyFrom(bytes);
        }
        public override string ToString() { return "GameCommand[redacted]"; }
    }

    /// <summary>One outstanding exchange; no detached reader, unbounded queue or automatic mutation retry.</summary>
    public sealed class NativeConnection : IDisposable
    {
        public const int MaxFrameBytes = 65536;
        private readonly Uri endpoint;
        private readonly string origin;
        private readonly ByteString content, boot;
        private readonly Func<CancellationToken, Task<AdmissionTicket>> tickets;
        private readonly Func<ClientWebSocket> sockets;
        private readonly TimeSpan timeout;
        private readonly SemaphoreSlim operation = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private ClientWebSocket socket;
        private string principal;
        private ulong sequence;
        private DateTimeOffset refreshAfter;
        private DateTimeOffset snapshotReceivedAt;
        private readonly Dictionary<ByteString, ClientEnvelope> sent = new Dictionary<ByteString, ClientEnvelope>();
        private readonly Queue<ByteString> order = new Queue<ByteString>();
        private volatile bool disposed;
        public ConnectionState State { get; private set; } = ConnectionState.Disconnected;
        public WorldSnapshot Snapshot { get; private set; }
        public bool NeedsRefresh => State == ConnectionState.Ready && DateTimeOffset.UtcNow >= refreshAfter;

        public NativeConnection(Uri endpoint, Uri origin, byte[] contentHash, Guid bootId,
            Func<CancellationToken, Task<AdmissionTicket>> ticketProvider,
            Func<ClientWebSocket> socketFactory = null, TimeSpan? requestTimeout = null)
        {
            if (endpoint == null || origin == null || endpoint.Scheme != "wss" || endpoint.AbsolutePath != "/rt/v1" ||
                endpoint.Query.Length != 0 || endpoint.Fragment.Length != 0 || endpoint.UserInfo.Length != 0 ||
                origin.Scheme != "https" || origin.AbsoluteUri.TrimEnd('/') != origin.GetLeftPart(UriPartial.Authority) ||
                origin.UserInfo.Length != 0 || endpoint.Authority != origin.Authority ||
                contentHash == null || contentHash.Length != 32 || contentHash.All(b => b == 0) || bootId == Guid.Empty || ticketProvider == null)
                throw new ArgumentException("Explicit native scope required");
            this.endpoint = endpoint; this.origin = origin.GetLeftPart(UriPartial.Authority);
            content = ByteString.CopyFrom(contentHash); boot = GameCommand.WireUuid(bootId);
            tickets = ticketProvider; sockets = socketFactory ?? (() => new ClientWebSocket());
            timeout = requestTimeout ?? TimeSpan.FromSeconds(5);
            if (timeout <= TimeSpan.Zero || timeout > TimeSpan.FromSeconds(30)) throw new ArgumentException("Invalid timeout");
        }

        public Task ConnectAsync(CancellationToken cancellation = default)
        {
            return Exclusive(async token => {
                Close(); State = ConnectionState.Connecting;
                var ticket = await BoundedTicket(token).ConfigureAwait(false);
                token.ThrowIfCancellationRequested();
                if (ticket == null || string.IsNullOrEmpty(ticket.Value) || ticket.Value.Length > 4096 ||
                    string.IsNullOrEmpty(ticket.Principal) || ticket.Expires <= DateTimeOffset.UtcNow ||
                    ticket.Expires > DateTimeOffset.UtcNow.AddSeconds(31)) throw new NativeFailure(Failure.Authentication);
                if (principal != null && principal != ticket.Principal) throw new NativeFailure(Failure.Scope);
                principal = ticket.Principal;
                socket = sockets(); socket.Options.AddSubProtocol("vl.native.v1");
                socket.Options.SetRequestHeader("Origin", origin);
                await socket.ConnectAsync(endpoint, token).ConfigureAwait(false);
                if (socket.SubProtocol != "vl.native.v1") throw new NativeFailure(Failure.Protocol);
                sequence = 0;
                var response = await Exchange(new ClientEnvelope { Hello = new Hello {
                    Ticket = ticket.Value, ClientBuild = "unity-native-v1", ContentHash = content
                } }, GameCommand.WireUuid(Guid.NewGuid()), token).ConfigureAwait(false);
                if (response.BodyCase != ServerEnvelope.BodyOneofCase.Hello || response.Hello.StateSchemaVersion != 1 ||
                    !response.Hello.ContentHash.Equals(content) || !response.Hello.RuntimeBootId.Equals(boot) ||
                    !ValidSnapshot(response.Hello.Snapshot)) throw new NativeFailure(Failure.Scope);
                Snapshot = response.Hello.Snapshot.Clone(); State = ConnectionState.Ready;
                snapshotReceivedAt = DateTimeOffset.UtcNow;
                var lifetimeLimit = DateTimeOffset.UtcNow.AddSeconds(25);
                refreshAfter = ticket.Expires.AddMilliseconds(-500) < lifetimeLimit ? ticket.Expires.AddMilliseconds(-500) : lifetimeLimit;
                return true;
            }, cancellation);
        }

        public async Task ReconnectAsync(CancellationToken cancellation = default)
        {
            for (var attempt = 0; ; attempt++)
            {
                try { await ConnectAsync(cancellation).ConfigureAwait(false); await ResyncAsync(cancellation).ConfigureAwait(false); return; }
                catch (NativeFailure e) when (attempt < 2 && (e.Reason == Failure.Transport || e.Reason == Failure.Timeout))
                { await Task.Delay(100 * (attempt + 1), cancellation).ConfigureAwait(false); }
            }
        }

        public Task<ServerEnvelope> SubmitAsync(GameCommand command, CancellationToken cancellation = default)
        {
            if (command == null) throw new ArgumentNullException(nameof(command));
            return Exclusive(async token => {
                RequireReady();
                var result = await Exchange(new ClientEnvelope { GameIntent = new GameIntent {
                    GameSessionId = command.Match, ExpectedStateVersion = command.Version,
                    Kind = command.Kind, ActionPayload = command.Action
                } }, command.Id, token).ConfigureAwait(false);
                if (result.BodyCase != ServerEnvelope.BodyOneofCase.Receipt || result.Receipt.AuthorizedProjection.Length > 16384)
                    throw new NativeFailure(Failure.Protocol);
                return result;
            }, cancellation);
        }

        public Task<WorldSnapshot> ResyncAsync(CancellationToken cancellation = default)
        {
            return Exclusive(async token => {
                RequireReady();
                var result = await Exchange(new ClientEnvelope { Resync = new Resync {
                    LastSeenEpoch = Snapshot.AuthorityEpoch, LastSeenTick = Snapshot.Tick
                } }, GameCommand.WireUuid(Guid.NewGuid()), token).ConfigureAwait(false);
                if (result.BodyCase != ServerEnvelope.BodyOneofCase.Snapshot || !ValidSnapshot(result.Snapshot))
                    throw new NativeFailure(Failure.Protocol);
                Snapshot = result.Snapshot.Clone(); snapshotReceivedAt = DateTimeOffset.UtcNow; return Snapshot.Clone();
            }, cancellation);
        }

        public Task<WorldSnapshot> MoveAsync(int x, int z, CancellationToken cancellation = default)
        {
            if (x < -1000 || x > 1000 || z < -1000 || z > 1000) throw new ArgumentException("Invalid movement direction");
            return Exclusive(async token => {
                RequireReady();
                // An idle client must obtain the current tick before a new intent.
                if (DateTimeOffset.UtcNow - snapshotReceivedAt > TimeSpan.FromSeconds(1)) {
                    var fresh = await Exchange(new ClientEnvelope { Resync = new Resync {
                        LastSeenEpoch = Snapshot.AuthorityEpoch, LastSeenTick = Snapshot.Tick
                    } }, GameCommand.WireUuid(Guid.NewGuid()), token).ConfigureAwait(false);
                    if (fresh.BodyCase != ServerEnvelope.BodyOneofCase.Snapshot || !ValidSnapshot(fresh.Snapshot))
                        throw new NativeFailure(Failure.Protocol);
                    Snapshot = fresh.Snapshot.Clone(); snapshotReceivedAt = DateTimeOffset.UtcNow;
                }
                var epoch = Snapshot.AuthorityEpoch;
                var next = checked(Snapshot.OwnActor.LastInputSequence + 1);
                var result = await Exchange(new ClientEnvelope { MoveIntent = new MoveIntent {
                    InputSequence = next, DirectionX = x, DirectionZ = z, AuthorityEpoch = epoch,
                    ExpectedTick = Snapshot.Tick, SentAtUnixMs = (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                } }, GameCommand.WireUuid(Guid.NewGuid()), token).ConfigureAwait(false);
                if (result.BodyCase != ServerEnvelope.BodyOneofCase.Snapshot || !ValidSnapshot(result.Snapshot) ||
                    result.Snapshot.AuthorityEpoch != epoch || result.Snapshot.Tick < Snapshot.Tick ||
                    result.Snapshot.OwnActor.LastInputSequence != next) throw new NativeFailure(Failure.Protocol);
                Snapshot = result.Snapshot.Clone(); snapshotReceivedAt = DateTimeOffset.UtcNow; return Snapshot.Clone();
            }, cancellation);
        }

        private static bool ValidSnapshot(WorldSnapshot snapshot)
        { return snapshot != null && snapshot.AuthorityEpoch > 0 && snapshot.OwnActor != null; }

        private async Task<AdmissionTicket> BoundedTicket(CancellationToken token)
        {
            var task = tickets(token);
            var cancelled = new TaskCompletionSource<AdmissionTicket>(TaskCreationOptions.RunContinuationsAsynchronously);
            using (token.Register(() => cancelled.TrySetCanceled()))
            {
                var completed = await Task.WhenAny(task, cancelled.Task).ConfigureAwait(false);
                if (completed != task) {
                    // Observe a non-cooperative provider's late error without retaining its credential.
                    _ = task.ContinueWith(t => { _ = t.Exception; }, CancellationToken.None,
                        TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                }
                return await completed.ConfigureAwait(false);
            }
        }

        private void RequireReady()
        { if (State != ConnectionState.Ready || socket?.State != WebSocketState.Open) throw new NativeFailure(Failure.Transport); }

        private async Task<ServerEnvelope> Exchange(ClientEnvelope frame, ByteString id, CancellationToken token)
        {
            frame.ProtocolVersion = 1; frame.CommandId = id;
            if (sent.TryGetValue(id, out var previous)) {
                frame.Sequence = previous.Sequence;
                if (!frame.Equals(previous)) throw new NativeFailure(Failure.Protocol);
            } else {
                frame.Sequence = checked(++sequence);
                sent.Add(id, frame.Clone()); order.Enqueue(id);
                if (order.Count > 32) sent.Remove(order.Dequeue());
            }
            var bytes = frame.ToByteArray();
            if (bytes.Length > MaxFrameBytes) throw new NativeFailure(Failure.Protocol);
            await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Binary, true, token).ConfigureAwait(false);
            var buffer = new byte[MaxFrameBytes]; var count = 0;
            WebSocketReceiveResult received;
            do {
                if (count == buffer.Length) throw new NativeFailure(Failure.Protocol);
                received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer, count, buffer.Length - count), token).ConfigureAwait(false);
                if (received.MessageType != WebSocketMessageType.Binary) throw new NativeFailure(Failure.Transport);
                count += received.Count;
            } while (!received.EndOfMessage);
            ServerEnvelope result;
            try { result = ServerEnvelope.Parser.ParseFrom(buffer, 0, count); }
            catch (InvalidProtocolBufferException) { throw new NativeFailure(Failure.Protocol); }
            if (result.ProtocolVersion != 1 || !result.CommandId.Equals(id)) throw new NativeFailure(Failure.Protocol);
            if (result.BodyCase == ServerEnvelope.BodyOneofCase.Rejection)
                throw new NativeFailure(Failure.Rejected, result.Rejection.Code);
            return result;
        }

        private async Task<T> Exclusive<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellation)
        {
            if (disposed) throw new ObjectDisposedException(nameof(NativeConnection));
            if (!await operation.WaitAsync(0, cancellation).ConfigureAwait(false)) throw new NativeFailure(Failure.Busy);
            using (var bounded = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token))
            {
                bounded.CancelAfter(timeout);
                try {
                    var result = await action(bounded.Token).ConfigureAwait(false);
                    bounded.Token.ThrowIfCancellationRequested(); return result;
                }
                catch (OperationCanceledException) {
                    Close(); if (!disposed) State = ConnectionState.Faulted;
                    if (cancellation.IsCancellationRequested || lifetime.IsCancellationRequested) throw;
                    throw new NativeFailure(Failure.Timeout);
                }
                catch (NativeFailure) { Close(); if (!disposed) State = ConnectionState.Faulted; throw; }
                catch (Exception) { Close(); if (!disposed) State = ConnectionState.Faulted; throw new NativeFailure(Failure.Transport); }
                finally { if (disposed) { Close(); principal = null; State = ConnectionState.Disposed; } operation.Release(); }
            }
        }

        private void Close() { socket?.Abort(); socket?.Dispose(); socket = null; Snapshot = null; sent.Clear(); order.Clear(); }
        public void Dispose() {
            if (disposed) return;
            disposed = true; State = ConnectionState.Disposed; lifetime.Cancel(); socket?.Abort();
            if (operation.Wait(0)) { try { Close(); } finally { operation.Release(); } }
            principal = null;
        }
    }
}
