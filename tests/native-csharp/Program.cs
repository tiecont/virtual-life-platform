using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using VirtualLife.Native.Public.V1;
using VirtualLife.Networking;

static class Program
{
    static readonly Guid Boot = Guid.Parse("6c9d1651-2b58-4e46-873e-7e182910f621");
    static readonly Guid Match = Guid.Parse("287f1cb8-95c0-410e-870f-32dd9d609e30");
    static readonly Guid Principal = Guid.Parse("0296a73c-0c2b-4d7f-9e6b-3b145b00b014");
    static readonly byte[] Hash = Enumerable.Repeat((byte)0x53, 32).ToArray();
    static int passed;
    static string stage = "mock";
    static void Check(bool condition) { if (!condition) throw new Exception("Native client assertion failed"); }
    static async Task Denied(Func<Task> action, Failure failure)
    {
        try { await action(); throw new Exception("Expected native rejection"); }
        catch (NativeFailure e) { Check(e.Reason == failure); Check(!e.ToString().Contains("secret")); passed++; }
    }
    static byte[] Uuid(Guid id) => Convert.FromHexString(id.ToString("N"));
    static AdmissionTicket Ticket() => new AdmissionTicket("secret-ticket", Principal.ToString(), DateTimeOffset.UtcNow.AddSeconds(20));
    static ClientWebSocket Socket(string fingerprint)
    {
        var socket = new ClientWebSocket();
        socket.Options.RemoteCertificateValidationCallback = (_, cert, _, _) => cert != null && cert.GetCertHashString() == fingerprint;
        return socket;
    }
    static async Task Main(string[] args)
    {
        try {
            if (args.SequenceEqual(new[] { "--probe" })) { await Probe(); return; }
            Check(args.Length == 0);
            PetViewTests();
            await MockTests(); Console.WriteLine(JsonSerializer.Serialize(new { result = "PASS", assertions = passed, scope = "standalone C#; not Unity execution" }));
        } catch (Exception e) {
            // Never print exception bodies, input credentials or authorized projections.
            Console.Error.WriteLine("Native client tests failed at " + stage + ": " + e.GetType().Name +
                (e is NativeFailure native ? "/" + native.Reason + "/" + native.Code : "")); Environment.ExitCode = 1;
        }
    }

    static void PetViewTests()
    {
        stage = "pet-projection";
        var projection = JsonSerializer.Serialize(new { epoch = 1, reward = (string)null, state = new {
            phase = "playing", pet = 0, stage = 0, turn = 0, health = 100000, enemyHealth = 80000,
            shield = 0, enemyShield = 0, cooldown = 0, board = Enumerable.Range(0, 36).Select(i => (i + i / 6) % 4).ToArray(),
            telegraph = new { pattern = 0, cells = Enumerable.Range(0, 6).ToArray(), resolvesTurn = 1 },
            playerStatuses = Array.Empty<object>(), enemyStatuses = Array.Empty<object>()
        }});
        var view = PetArenaView.Decode(1, Encoding.UTF8.GetBytes(projection));
        Check(view.Phase == "playing" && view.Health == 100000 && view.Board.Count == 36 && view.WarningCells.Count == 6); passed++;
        Check(!view.CanSwap(-1, 0) && !view.CanSwap(0, 35) && !view.CanSwap(5, 6)); passed++;
        Check(!view.Terminal && view.Epoch == 1 && view.Cooldown == 0); passed++;
        foreach (var mutate in new Action<System.Text.Json.Nodes.JsonObject>[] {
            json => json["epoch"] = 0,
            json => json["state"]["board"] = new System.Text.Json.Nodes.JsonArray(1, 2),
            json => json["state"]["pet"] = 8,
            json => json["state"]["health"] = -1,
            json => json["state"]["cooldown"] = 4,
            json => json["state"]["phase"] = "claimed-win",
            json => json["state"]["telegraph"]["resolvesTurn"] = 3,
            json => json["state"]["telegraph"]["cells"] = new System.Text.Json.Nodes.JsonArray(0, 0, 0, 0, 0, 0),
            json => json["reward"] = "GRANTED",
            json => json["state"].AsObject().Remove("board")
        }) {
            var json = System.Text.Json.Nodes.JsonNode.Parse(projection).AsObject(); mutate(json);
            try { PetArenaView.Decode(1, Encoding.UTF8.GetBytes(json.ToJsonString())); throw new Exception("Accepted invalid Pet projection"); }
            catch (FormatException) { passed++; }
        }
        try { PetArenaView.Decode(2, Encoding.UTF8.GetBytes(projection)); throw new Exception("Accepted mismatched Pet version"); }
        catch (FormatException) { passed++; }
        stage = "mock";
    }

    static async Task MockTests()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=127.0.0.1", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var san = new SubjectAlternativeNameBuilder(); san.AddIpAddress(IPAddress.Loopback); request.CertificateExtensions.Add(san.Build());
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        var builder = WebApplication.CreateBuilder(); builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0, endpoint => endpoint.UseHttps(certificate)));
        await using var app = builder.Build(); app.UseWebSockets();
        string mode = "valid"; int playTurns = 0; var playReceipts = new Dictionary<string, int>(); int hellos = 0; int logins = 0; int tickets = 0; int resyncs = 0;
        var logoutId = Guid.NewGuid(); int logouts = 0;
        TaskCompletionSource<bool> committed = null, releaseAck = null;
        TaskCompletionSource<bool> ticketRequested = null, releaseTicket = null;
        app.MapPost("/v1/session/login", async context => {
            var body = await JsonDocument.ParseAsync(context.Request.Body);
            Check(body.RootElement.GetProperty("loginName").GetString() == "fixture");
            Check(body.RootElement.GetProperty("password").GetString() == "secret-password-123"); logins++;
            context.Response.Cookies.Append("city_session", "secret-cookie", new CookieOptions { HttpOnly = true, Secure = true });
            await context.Response.WriteAsJsonAsync(new { profile = new { id = Principal }, csrfToken = new string('a', 64), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) });
        });
        app.MapPost("/v1/runtime-ticket", async context => {
            Check(context.Request.Headers.Origin.ToString().StartsWith("https://127.0.0.1:"));
            Check(context.Request.Headers["X-CSRF-Token"] == new string('a', 64));
            Check(context.Request.Cookies["city_session"] == "secret-cookie"); tickets++;
            if (mode == "ticket-hold") {
                ticketRequested.TrySetResult(true);
                await releaseTicket.Task.WaitAsync(context.RequestAborted);
            }
            if (mode == "unauthorized") { context.Response.StatusCode = 401; return; }
            if (mode == "redirect") { context.Response.Redirect("/v1/session/login"); return; }
            if (mode == "http-oversize") { await context.Response.WriteAsJsonAsync(new { ticket = new string('x', 17000) }); return; }
            await context.Response.WriteAsJsonAsync(new { ticket = "secret-ticket", expiresAt = DateTimeOffset.UtcNow.AddSeconds(mode == "expired-http" ? -1 : 20) });
        });
        app.MapPost("/v1/session/logout", async context => {
            Check(context.Request.Headers.Origin.ToString().StartsWith("https://127.0.0.1:"));
            Check(context.Request.Headers["X-CSRF-Token"] == new string('a', 64));
            Check(context.Request.Headers["Idempotency-Key"] == logoutId.ToString());
            Check(context.Request.Cookies["city_session"] == "secret-cookie");
            using var body = await JsonDocument.ParseAsync(context.Request.Body);
            Check(!body.RootElement.EnumerateObject().Any()); logouts++;
            if (mode == "logout-rejected") { context.Response.StatusCode = 403; return; }
            if (mode == "logout-missing") { await context.Response.WriteAsJsonAsync(new { }); return; }
            if (mode == "logout-malformed") { context.Response.ContentType = "application/json"; await context.Response.WriteAsync("{"); return; }
            await context.Response.WriteAsJsonAsync(new { loggedOut = mode != "logout-false" });
        });
        app.Map("/rt/v1", async context => {
            Check(context.WebSockets.WebSocketRequestedProtocols.Contains("vl.native.v1"));
            using var socket = await context.WebSockets.AcceptWebSocketAsync("vl.native.v1");
            var cache = new Dictionary<string, (byte[] input, byte[] output)>(); ulong sequence = 0;
            try {
                while (socket.State == WebSocketState.Open) {
                    var buffer = new byte[65536]; var count = 0; WebSocketReceiveResult part;
                    do { part = await socket.ReceiveAsync(new ArraySegment<byte>(buffer, count, buffer.Length - count), context.RequestAborted); count += part.Count; }
                    while (!part.EndOfMessage);
                    if (part.MessageType != WebSocketMessageType.Binary) return;
                    var input = buffer.Take(count).ToArray(); var frame = ClientEnvelope.Parser.ParseFrom(input);
                    var id = frame.CommandId.ToBase64(); byte[] output;
                    if (cache.TryGetValue(id, out var previous)) { Check(input.SequenceEqual(previous.input)); output = previous.output; }
                    else {
                        Check(frame.ProtocolVersion == 1 && frame.Sequence == ++sequence);
                        var response = new ServerEnvelope { ProtocolVersion = 1, CommandId = frame.CommandId };
                        var snapshot = new WorldSnapshot { AuthorityEpoch = 1, OwnActor = new OwnActor() };
                        if (frame.Hello != null) {
                            hellos++; Check(frame.Hello.Ticket == "secret-ticket"); Check(frame.Hello.ContentHash.ToByteArray().SequenceEqual(Hash));
                            response.Hello = new HelloAccepted { ContentHash = ByteString.CopyFrom(Hash), StateSchemaVersion = 1,
                                RuntimeBootId = ByteString.CopyFrom(Uuid(Boot)), Snapshot = snapshot };
                            if (mode == "mismatch") response.ProtocolVersion = 2;
                            if (mode == "boot") response.Hello.RuntimeBootId = ByteString.CopyFrom(Uuid(Guid.NewGuid()));
                            if (mode == "content") response.Hello.ContentHash = ByteString.CopyFrom(new byte[32]);
                            if (mode == "correlation") response.CommandId = ByteString.CopyFrom(new byte[16]);
                            if (mode == "no-own") response.Hello.Snapshot.OwnActor = null;
                            if (mode == "reject") response.Rejection = new Rejection { Code = ErrorCode.Unauthenticated };
                            if (mode == "delay") await Task.Delay(700);
                        } else if (frame.Resync != null) { resyncs++; response.Snapshot = snapshot; }
                        else if (frame.MoveIntent != null) {
                            Check(frame.MoveIntent.AuthorityEpoch == 1 && frame.MoveIntent.InputSequence == 1);
                            Check(frame.MoveIntent.DirectionX == 1000 && frame.MoveIntent.SentAtUnixMs > 0);
                            snapshot.Tick = 1; snapshot.OwnActor.XMm = 20; snapshot.OwnActor.LastInputSequence = 1;
                            response.Snapshot = snapshot;
                            if (mode == "move-wrong-epoch") snapshot.AuthorityEpoch = 2;
                            if (mode == "move-wrong-sequence") snapshot.OwnActor.LastInputSequence = 2;
                        }
                        else {
                            Check(frame.GameIntent.GameSessionId.ToByteArray().SequenceEqual(Uuid(Match)));
                            if (mode.StartsWith("play")) {
                                var view = frame.GameIntent.Kind == "fixture.view.v1";
                                if (!view && !playReceipts.ContainsKey(id)) {
                                    Check(frame.GameIntent.ExpectedStateVersion == (ulong)playTurns);
                                    Check(frame.GameIntent.Kind == "fixture.advance.v1");
                                    playReceipts[id] = ++playTurns;
                                    if (mode == "play-drop") { socket.Abort(); return; }
                                    if (mode == "play-hold") {
                                        committed.TrySetResult(true);
                                        await releaseAck.Task.WaitAsync(context.RequestAborted);
                                    }
                                }
                                var turns = view ? playTurns : playReceipts[id];
                                response.CanonicalVersion = (ulong)turns;
                                response.Receipt = new Receipt { Committed = !view, AuthorizedProjection = ByteString.CopyFromUtf8(
                                    JsonSerializer.Serialize(new {state = new {turns, ownRoll = 42}, epoch = 1, reward = turns == 3 ? "REWARD_PENDING" : null})) };
                                if (mode == "play-invalid") response.Receipt.AuthorizedProjection = ByteString.CopyFromUtf8("{}");
                            } else {
                                response.CanonicalVersion = 1;
                                response.Receipt = new Receipt { Committed = true, AuthorizedProjection = ByteString.CopyFromUtf8("{\"turn\":1}") };
                            }
                        }
                        output = response.ToByteArray(); cache.Add(id, (input, output));
                    }
                    if (mode == "oversize") output = new byte[65537];
                    if (mode == "malformed") output = new byte[] { 0xff };
                    var type = mode == "text" ? WebSocketMessageType.Text : WebSocketMessageType.Binary;
                    await socket.SendAsync(new ArraySegment<byte>(output, 0, output.Length / 2), type, false, context.RequestAborted);
                    await socket.SendAsync(new ArraySegment<byte>(output, output.Length / 2, output.Length - output.Length / 2), type, true, context.RequestAborted);
                }
            } catch (WebSocketException) { } catch (OperationCanceledException) { }
        });
        await app.StartAsync();
        var origin = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>().Addresses.Single());
        var endpoint = new Uri(origin.ToString().Replace("https:", "wss:") + "rt/v1");
        NativeConnection Client(Func<CancellationToken, Task<AdmissionTicket>> provider = null, TimeSpan? timeout = null) =>
            new NativeConnection(endpoint, origin, Hash, Boot, provider ?? (_ => Task.FromResult(Ticket())), () => Socket(certificate.Thumbprint), timeout);
        HttpClientHandler Handler() => new HttpClientHandler { AllowAutoRedirect = false, CookieContainer = new CookieContainer(),
            ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert?.Thumbprint == certificate.Thumbprint };

        using (var session = new PlatformSession(origin, Handler())) {
            await Denied(() => session.TicketAsync(), Failure.Authentication);
            await session.LoginAsync("fixture", "secret-password-123", Guid.NewGuid());
            using var client = Client(session.TicketAsync);
            await client.ConnectAsync(); Check(client.State == ConnectionState.Ready);
            var command = new GameCommand(Guid.NewGuid(), Match, 0, "fixture.advance.v1", Encoding.UTF8.GetBytes("{\"epoch\":1}"));
            var receipt = await client.SubmitAsync(command); Check(receipt.Receipt.Committed && receipt.CanonicalVersion == 1);
            Check((await client.SubmitAsync(command)).Equals(receipt));
            await client.ReconnectAsync(); Check((await client.SubmitAsync(command)).Equals(receipt));
            Check(logins == 1 && tickets == 2 && hellos == 2); passed += 5;
            await session.LogoutAsync(logoutId);
            Check(logouts == 1); passed++;
            await Denied(() => session.TicketAsync(), Failure.Authentication);
        }
        foreach (var logoutMode in new[] { "logout-rejected", "logout-missing", "logout-malformed", "logout-false" }) {
            mode = "valid"; using var session = new PlatformSession(origin, Handler());
            await session.LoginAsync("fixture", "secret-password-123", Guid.NewGuid()); mode = logoutMode;
            await Denied(() => session.LogoutAsync(logoutId), mode == "logout-rejected" ? Failure.Authentication : Failure.Protocol);
            await Denied(() => session.TicketAsync(), Failure.Authentication);
        }
        foreach (var test in new[] { ("mismatch", Failure.Protocol), ("boot", Failure.Scope), ("content", Failure.Scope),
            ("correlation", Failure.Protocol), ("no-own", Failure.Scope), ("reject", Failure.Rejected),
            ("oversize", Failure.Protocol), ("malformed", Failure.Protocol), ("text", Failure.Transport), ("delay", Failure.Timeout) }) {
            mode = test.Item1; using var client = Client(timeout: TimeSpan.FromMilliseconds(300));
            await Denied(() => client.ConnectAsync(), test.Item2); Check(client.State == ConnectionState.Faulted && client.Snapshot == null);
        }
        mode = "valid";
        foreach (var movementMode in new[] {"valid", "move-wrong-epoch", "move-wrong-sequence"}) {
            mode = movementMode; using var client = Client(); await client.ConnectAsync();
            if (mode == "valid") {
                var before = resyncs; await Task.Delay(1100);
                var moved = await client.MoveAsync(1000, 0);
                Check(moved.OwnActor.XMm == 20 && moved.OwnActor.LastInputSequence == 1);
                Check(resyncs == before + 1); passed += 2;
            }
            else await Denied(() => client.MoveAsync(1000, 0), Failure.Protocol);
        }
        mode = "valid";
        var never = new TaskCompletionSource<AdmissionTicket>();
        using (var expiring = Client(_ => Task.FromResult(new AdmissionTicket("secret-ticket", Principal.ToString(), DateTimeOffset.UtcNow.AddSeconds(1))))) {
            await expiring.ConnectAsync(); await Task.Delay(600); Check(expiring.NeedsRefresh); passed++;
        }
        using (var hung = Client(_ => never.Task, TimeSpan.FromMilliseconds(100)))
            await Denied(() => hung.ConnectAsync(), Failure.Timeout);
        using (var untrusted = new NativeConnection(endpoint, origin, Hash, Boot, _ => Task.FromResult(Ticket())))
            await Denied(() => untrusted.ConnectAsync(), Failure.Transport);
        using (var expired = Client(_ => Task.FromResult(new AdmissionTicket("secret-expired", Principal.ToString(), DateTimeOffset.UtcNow.AddSeconds(-1)))))
            await Denied(() => expired.ConnectAsync(), Failure.Authentication);
        var pending = new TaskCompletionSource<AdmissionTicket>();
        using (var busy = Client(async token => { pending.TrySetResult(Ticket()); await Task.Delay(5000, token); return Ticket(); })) {
            using var cancellation = new CancellationTokenSource(); var connect = busy.ConnectAsync(cancellation.Token); await pending.Task;
            await Denied(() => busy.ConnectAsync(), Failure.Busy); cancellation.Cancel();
            try { await connect; throw new Exception("Cancellation ignored"); } catch (OperationCanceledException) { passed++; }
        }
        var changed = false;
        using (var client = Client(_ => Task.FromResult(new AdmissionTicket("secret-ticket", changed ? Guid.NewGuid().ToString() : Principal.ToString(), DateTimeOffset.UtcNow.AddSeconds(20))))) {
            await client.ConnectAsync(); changed = true; await Denied(() => client.ReconnectAsync(), Failure.Scope);
        }
        foreach (var failure in new[] { ("unauthorized", Failure.Authentication), ("redirect", Failure.Authentication), ("http-oversize", Failure.Protocol), ("expired-http", Failure.Authentication) }) {
            mode = "valid"; using var session = new PlatformSession(origin, Handler());
            await session.LoginAsync("fixture", "secret-password-123", Guid.NewGuid()); mode = failure.Item1;
            await Denied(() => session.TicketAsync(), failure.Item2);
        }
        mode = "play"; stage = "scene-use-cases";
        using (var platform = new PlatformSession(origin, Handler()))
        using (var play = new SyntheticPlaySession(platform, Client(platform.TicketAsync), Match)) {
            var first = await play.LoginAsync("fixture", "secret-password-123"); Check(first.Turns == 0 && first.Version == 0); passed++;
            var advanced = await play.AdvanceAsync(); Check(advanced.Turns == 1 && advanced.Version == 1 && playTurns == 1); passed++;
            mode = "play-drop";
            await Denied(() => play.AdvanceAsync(), Failure.Transport); Check(play.HasPendingCommand && play.State.Turns == 1 && playTurns == 2); passed++;
            mode = "play";
            var seen = await play.ReconnectAsync(); Check(seen.Turns == 2 && play.HasPendingCommand); passed++;
            await Denied(() => play.AdvanceAsync(), Failure.Busy);
            var recovered = await play.RetryAsync(); Check(recovered.Turns == 2 && !play.HasPendingCommand && playTurns == 2); passed++;
            var completed = await play.AdvanceAsync(); Check(completed.Turns == 3 && completed.Reward == "REWARD_PENDING" && playReceipts.Count == 3); passed++;
            await Denied(() => play.AdvanceAsync(), Failure.Rejected);
            mode = "play-invalid";
            await Denied(() => play.ReconnectAsync(), Failure.Protocol); Check(play.State.Turns == 3); passed++;
            mode = "play"; Check((await play.ReconnectAsync()).Turns == 3); passed++;
            using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
            try { await play.ReconnectAsync(cancelled.Token); throw new Exception("Scene cancellation ignored"); }
            catch (OperationCanceledException) { passed++; }
            Check(!play.ToString().Contains("secret"));
        }
        stage = "logout-in-flight"; mode = "play"; playTurns = 0; playReceipts.Clear();
        committed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        releaseAck = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        using (var platform = new PlatformSession(origin, Handler()))
        using (var play = new SyntheticPlaySession(platform, Client(platform.TicketAsync), Match)) {
            await play.LoginAsync("fixture", "secret-password-123"); mode = "play-hold";
            var advance = play.AdvanceAsync();
            try {
                await committed.Task.WaitAsync(TimeSpan.FromSeconds(3));
                var before = logouts;
                await play.LogoutAsync(logoutId).WaitAsync(TimeSpan.FromSeconds(3));
                Check(logouts == before + 1 && play.State == null && !play.HasPendingCommand && play.MovementState == null); passed++;
                try { await advance; throw new Exception("Logout ignored in-flight exchange"); }
                catch (OperationCanceledException) { passed++; }
                try { await play.ReconnectAsync(); throw new Exception("Logged-out use case reused"); }
                catch (ObjectDisposedException) { passed++; }
            } finally { releaseAck.TrySetResult(true); }
            Check(playTurns == 1 && playReceipts.Count == 1 && play.State == null); passed++;
        }
        mode = "play";
        using (var platform = new PlatformSession(origin, Handler()))
        using (var play = new SyntheticPlaySession(platform, Client(platform.TicketAsync), Match)) {
            Check((await play.LoginAsync("fixture", "secret-password-123")).Turns == 1);
            Check(playReceipts.Count == 1); passed++;
        }
        stage = "logout-during-ticket";
        ticketRequested = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        releaseTicket = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        using (var platform = new PlatformSession(origin, Handler()))
        using (var play = new SyntheticPlaySession(platform, Client(platform.TicketAsync), Match)) {
            await play.LoginAsync("fixture", "secret-password-123"); mode = "ticket-hold";
            var reconnect = play.ReconnectAsync();
            try {
                await ticketRequested.Task.WaitAsync(TimeSpan.FromSeconds(3));
                var before = logouts;
                await play.LogoutAsync(logoutId).WaitAsync(TimeSpan.FromSeconds(3));
                Check(logouts == before + 1 && play.State == null && play.MovementState == null); passed++;
                try { await reconnect; throw new Exception("Logout ignored ticket request"); }
                catch (OperationCanceledException) { passed++; }
            } finally { releaseTicket.TrySetResult(true); }
        }
        await app.StopAsync();
    }

    static async Task Probe()
    {
        stage = "probe-input";
        // The disposable harness supplies private input via stdin, never process arguments or logs.
        using var input = JsonDocument.Parse(await Console.In.ReadToEndAsync()); var data = input.RootElement;
        var origin = new Uri(data.GetProperty("origin").GetString());
        using var certificate = X509Certificate2.CreateFromPem(await File.ReadAllTextAsync(data.GetProperty("certificate").GetString()));
        var handler = new HttpClientHandler { AllowAutoRedirect = false, CookieContainer = new CookieContainer(),
            ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert?.Thumbprint == certificate.Thumbprint };
        using var session = new PlatformSession(origin, handler);
        stage = "probe-login";
        await session.LoginAsync(data.GetProperty("loginName").GetString(), data.GetProperty("password").GetString(), Guid.NewGuid());
        using var client = new NativeConnection(new Uri(origin.ToString().Replace("https:", "wss:") + "rt/v1"), origin, Hash,
            Guid.Parse(data.GetProperty("boot").GetString()), session.TicketAsync, () => Socket(certificate.Thumbprint));
        stage = "probe-connect"; await client.ConnectAsync();
        var command = new GameCommand(Guid.Parse("03030303-0303-0303-0303-030303030303"), Guid.Parse(data.GetProperty("match").GetString()),
            0, "fixture.advance.v1", Encoding.UTF8.GetBytes("{\"epoch\":1}"));
        stage = "probe-command";
        var first = await client.SubmitAsync(command); Check(first.Receipt.Committed && first.CanonicalVersion == 1);
        Check((await client.SubmitAsync(command)).Equals(first));
        stage = "probe-reconnect";
        await client.ReconnectAsync(); Check((await client.SubmitAsync(command)).Equals(first));
        stage = "probe-view";
        var view = await client.SubmitAsync(new GameCommand(Guid.NewGuid(), Guid.Parse(data.GetProperty("match").GetString()), 0, "fixture.view.v1", Array.Empty<byte>()));
        Check(!view.Receipt.Committed && view.CanonicalVersion >= 2);
        stage = "probe-scene-use-cases";
        using (var play = new SyntheticPlaySession(session, client, Guid.Parse(data.GetProperty("match").GetString()))) {
            var entered = await play.LoginAsync(data.GetProperty("loginName").GetString(), data.GetProperty("password").GetString());
            Check(entered.Version == view.CanonicalVersion && entered.Turns == (int)view.CanonicalVersion);
            Check((await play.ReconnectAsync()).Version == entered.Version);
            Check(!play.HasPendingCommand);
        }
        Console.WriteLine("{\"result\":\"PASS\",\"checks\":8}");
    }
}
