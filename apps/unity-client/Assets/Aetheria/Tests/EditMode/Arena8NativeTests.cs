using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using NUnit.Framework;

namespace Aetheria.Tests
{
    // Strict contract tests for the canonical `arena8.view.v1` consumer and the
    // `arena8.intent.v1` writer. They never start a socket or a Nest process.
    public sealed class Arena8NativeTests
    {
        private const string ContentHash = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        private const string BindingDigest = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
        private const string RulesDigest = "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff0";
        private const string SnapshotDigest = "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f";
        private static readonly int[] Fallback = BuildFallback();

        [Test]
        public void ReadyProjectionDecodesCanonicalFields()
        {
            var view = Decode(0, Projection());
            Assert.That(view.Version, Is.Zero);
            Assert.That(view.Epoch, Is.EqualTo(1));
            Assert.That(view.Phase, Is.EqualTo("ready"));
            Assert.That(view.Turn, Is.Zero);
            Assert.That(view.Terminal, Is.False);
            Assert.That(view.Reward, Is.Null);
            Assert.That(view.Board.Count, Is.EqualTo(64));
            Assert.That(view.Board, Is.EqualTo(Fallback));
            Assert.That(view.Health, Is.EqualTo(220));
            Assert.That(view.EnemyHealth, Is.EqualTo(160));
            Assert.That(view.PetId, Is.EqualTo("icarus"));
            Assert.That(view.PetLevel, Is.EqualTo(20));
            Assert.That(view.EncounterId, Is.EqualTo("cinder-terraces-regular"));
            Assert.That(view.EncounterBoss, Is.False);
            Assert.That(view.Skills, Is.EqualTo(new[] { "shared-skill", "signature", "ultimate", "guard" }));
            Assert.That(view.TelegraphKind, Is.Null);
            Assert.That(view.HasSkill("shared-skill"), Is.True);
            Assert.That(view.HasSkill("fire-zone"), Is.False);
        }

        [Test]
        public void PlayingProjectionCarriesTheCommittedTelegraph()
        {
            var view = Decode(1, Projection(phase: "playing", health: 200, telegraph: Telegraph(0)));
            Assert.That(view.Phase, Is.EqualTo("playing"));
            Assert.That(view.Turn, Is.Zero);
            Assert.That(view.TelegraphKind, Is.EqualTo("assault"));
            Assert.That(view.TelegraphAxis, Is.EqualTo("row"));
            Assert.That(view.TelegraphTarget, Is.Zero);
            Assert.That(view.TelegraphAnnouncedTurn, Is.Zero);
            Assert.That(view.TelegraphResolvesTurn, Is.EqualTo(1));
            Assert.That(view.TelegraphCells, Is.EqualTo(Enumerable.Range(0, 8).ToArray()));
        }

        [Test]
        public void TerminalProjectionRequiresARewardStateAndNoTelegraph()
        {
            var view = Decode(2, Projection(phase: "won", turn: 1, health: 180, enemyHealth: 0, reward: "\"REWARD_PENDING\""));
            Assert.That(view.Terminal, Is.True);
            Assert.That(view.Reward, Is.EqualTo("REWARD_PENDING"));
            Assert.That(view.TelegraphKind, Is.Null);
        }

        [Test]
        public void NonCanonicalProjectionsFailClosed()
        {
            var baseline = Projection();
            var playing = Projection(phase: "playing", health: 200, telegraph: Telegraph(0));
            var cases = new List<(string Name, string Json, ulong Version)>
            {
                ("sixty three cells", baseline.Replace(Numbers(Fallback), Numbers(Fallback.Take(63).ToArray())), 0UL),
                ("sixty five cells", baseline.Replace(Numbers(Fallback), Numbers(Fallback.Concat(new[] { 0 }).ToArray())), 0UL),
                ("cell above element range", baseline.Replace(Numbers(Fallback), Numbers(Fallback.Select((value, at) => at == 0 ? 6 : value).ToArray())), 0UL),
                ("negative cell", baseline.Replace(Numbers(Fallback), Numbers(Fallback.Select((value, at) => at == 0 ? -1 : value).ToArray())), 0UL),
                ("turn above maximum", baseline.Replace("\"turn\":0", "\"turn\":25"), 0UL),
                ("ready with a turn", baseline.Replace("\"turn\":0", "\"turn\":1"), 1UL),
                ("version not bound to the turn", baseline, 1UL),
                ("playing without a telegraph", Projection(phase: "playing", health: 200), 1UL),
                ("telegraph announced for another turn", Projection(phase: "playing", health: 200, telegraph: Telegraph(1)), 1UL),
                ("won with enemy health", baseline.Replace("\"phase\":\"ready\"", "\"phase\":\"won\"").Replace("\"reward\":null", "\"reward\":\"REWARD_PENDING\""), 1UL),
                ("terminal without a reward", baseline.Replace("\"phase\":\"ready\"", "\"phase\":\"won\"").Replace("\"enemyHealth\":160", "\"enemyHealth\":0"), 1UL),
                ("non terminal with a reward", baseline.Replace("\"reward\":null", "\"reward\":\"GRANTED\""), 0UL),
                ("unknown reward", baseline.Replace("\"phase\":\"ready\"", "\"phase\":\"won\"").Replace("\"reward\":null", "\"reward\":\"LUCKY\"").Replace("\"enemyHealth\":160", "\"enemyHealth\":0"), 1UL),
                ("health above the effective maximum", baseline.Replace("\"health\":220,\"enemyHealth\"", "\"health\":221,\"enemyHealth\""), 0UL),
                ("mana above cap", baseline.Replace("\"mana\":0", "\"mana\":301"), 0UL),
                ("rage above cap", baseline.Replace("\"rage\":0", "\"rage\":201"), 0UL),
                ("cooldown above cap", baseline.Replace("\"cooldown\":0", "\"cooldown\":4"), 0UL),
                ("fire zone above cap", baseline.Replace("\"fireZoneTurns\":0", "\"fireZoneTurns\":3"), 0UL),
                ("shield above cap", baseline.Replace("\"enemyShield\":0", "\"enemyShield\":241"), 0UL),
                ("pet level above maximum", Projection(level: 61), 0UL),
                ("schema version two", Projection(schemaVersion: 2), 0UL),
                ("epoch zero", Projection(epoch: 0), 0UL),
                ("skills as supervisor objects", Projection(skills: "[{\"id\":\"shared-skill\",\"canCast\":true}]"), 0UL),
                ("unknown skill id", Projection(skills: "[\"shared-skill\",\"signature\",\"supervisor\"]"), 0UL),
                ("duplicate skill id", Projection(skills: "[\"shared-skill\",\"shared-skill\"]"), 0UL),
                ("one skill only", Projection(skills: "[\"shared-skill\"]"), 0UL),
                ("unknown state field", baseline.Replace("\"snapshotDigest\"", "\"supervisor\":{},\"snapshotDigest\""), 0UL),
                ("duplicate state field", baseline.Replace("\"turn\":0", "\"turn\":0,\"turn\":0"), 0UL),
                ("missing reward envelope", baseline.Substring(0, baseline.LastIndexOf(",\"reward\":null", StringComparison.Ordinal)) + "}", 0UL),
                ("unknown root field", baseline.Replace("\"epoch\":1", "\"epoch\":1,\"supervisor\":{}"), 0UL),
                ("telegraph short lane", playing.Replace(Numbers(Enumerable.Range(0, 8).ToArray()), Numbers(Enumerable.Range(0, 7).ToArray())), 1UL),
                ("telegraph wrong lane", playing.Replace("\"axis\":\"row\",\"target\":0", "\"axis\":\"column\",\"target\":0"), 1UL),
                ("telegraph wrong resolve", playing.Replace("\"resolvesTurn\":1", "\"resolvesTurn\":3"), 1UL),
                ("missing telegraph field", playing.Replace("\"announcedTurn\":0,", ""), 1UL),
                ("skill stats object drift", baseline.Replace("\"attack\":24", "\"attack\":\"24\""), 0UL),
                ("hidden account field", baseline.Replace("\"pet\":{\"id\"", "\"account\":\"secret\",\"pet\":{\"id\""), 0UL),
                ("board as string", baseline.Replace(Numbers(Fallback), "\"board\""), 0UL),
                ("missing board", baseline.Replace("\"board\":" + Numbers(Fallback) + ",", ""), 0UL),
            };
            foreach (var item in cases)
            {
                var error = Assert.Throws<FormatException>(() => Decode(item.Version, item.Json), item.Name);
                Assert.That(error, Is.Not.Null, item.Name);
            }
        }

        [Test]
        public void IntentPayloadsMatchTheRustContract()
        {
            Assert.That(Text(Arena8NativeIntent.StartAction(1)), Is.EqualTo("{\"epoch\":1,\"action\":{\"kind\":\"start\"}}"));
            Assert.That(Text(Arena8NativeIntent.SkillAction(7)), Is.EqualTo("{\"epoch\":7,\"action\":{\"kind\":\"skill\"}}"));
            Assert.That(Text(Arena8NativeIntent.SignatureAction(7)), Is.EqualTo("{\"epoch\":7,\"action\":{\"kind\":\"signature\"}}"));
            Assert.That(Text(Arena8NativeIntent.FireZoneAction(7)), Is.EqualTo("{\"epoch\":7,\"action\":{\"kind\":\"fireZone\"}}"));
            Assert.That(Text(Arena8NativeIntent.UltimateAction(7)), Is.EqualTo("{\"epoch\":7,\"action\":{\"kind\":\"ultimate\"}}"));
            Assert.That(Text(Arena8NativeIntent.GuardAction(7)), Is.EqualTo("{\"epoch\":7,\"action\":{\"kind\":\"guard\"}}"));
            Assert.That(Text(Arena8NativeIntent.SwapAction(3, 2, 3)),
                Is.EqualTo("{\"epoch\":3,\"action\":{\"kind\":\"swap\",\"first\":2,\"second\":3}}"));
            Assert.That(Arena8NativeIntent.Kind, Is.EqualTo("arena8.intent.v1"));
        }

        [Test]
        public void IntentWriterRejectsOutOfScopeInput()
        {
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.StartAction(0));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.StartAction(-1));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.SwapAction(1, -1, 2));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.SwapAction(1, 0, 64));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.SwapAction(1, 4, 4));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.Create(1, "runaway"));
            Assert.Throws<ArgumentException>(() => Arena8NativeIntent.Create(1, "swap"));
        }

        [Test]
        public void BoardHintsStayLocalAndNeverInventAResult()
        {
            var values = (int[])Fallback.Clone();
            values[0] = 1; values[1] = 1; values[2] = 2; values[3] = 1;
            var view = Decode(1, Projection(phase: "playing", health: 200, telegraph: Telegraph(0), board: Numbers(values)));
            Assert.That(Arena8NativeView.Adjacent(2, 3), Is.True);
            Assert.That(Arena8NativeView.Adjacent(7, 8), Is.False);
            Assert.That(Arena8NativeView.Adjacent(0, 8), Is.True);
            Assert.That(view.CanSwap(2, 3), Is.True);
            Assert.That(view.CanSwap(3, 4), Is.False);
            Assert.That(view.CanSwap(0, 20), Is.False);
            Assert.That(Decode(0, Projection()).CanSwap(2, 3), Is.False, "A ready match has no legal swap");
        }

        [Test]
        public async Task NativeSessionSubmitsOneCanonicalCommandAndRetainsIt()
        {
            using var platform = new PlatformSession(new Uri("https://localhost"));
            using var connection = new NativeConnection(new Uri("wss://localhost/rt/v1"), new Uri("https://localhost"),
                Enumerable.Repeat((byte)0x53, 32).ToArray(), Guid.NewGuid(),
                _ => Task.FromResult(new AdmissionTicket("ticket-value", "principal", DateTimeOffset.UtcNow.AddSeconds(20))));
            using var session = new Arena8NativePlaySession(platform, connection, Guid.NewGuid());
            SetState(session, DecodeState(session, 1, Projection(phase: "playing", health: 200, telegraph: Telegraph(0))));
            var failure = Assert.ThrowsAsync<NativeFailure>(() => session.SignatureAsync());
            Assert.That(failure.Reason, Is.EqualTo(Failure.Transport), "An offline connection must fail closed");
            var pending = (GameCommand)typeof(NativePlaySession)
                .GetField("pending", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(session);
            Assert.That(pending, Is.Not.Null);
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            Assert.That((string)typeof(GameCommand).GetField("Kind", flags).GetValue(pending), Is.EqualTo("arena8.intent.v1"));
            Assert.That((ulong)typeof(GameCommand).GetField("Version", flags).GetValue(pending), Is.EqualTo(1UL));
            var action = typeof(GameCommand).GetField("Action", flags).GetValue(pending);
            var payload = (byte[])action.GetType().GetMethod("ToByteArray").Invoke(action, null);
            Assert.That(Text(payload), Is.EqualTo("{\"epoch\":1,\"action\":{\"kind\":\"signature\"}}"));
            Assert.That(session.HasPendingCommand, Is.True);
            var busy = Assert.ThrowsAsync<NativeFailure>(() => session.GuardAsync());
            Assert.That(busy.Reason, Is.EqualTo(Failure.Busy), "A second command cannot displace the pending intent");
        }

        [Test]
        public async Task NativeAdmissionValidatesTheAllocationScope()
        {
            var response = Allocation();
            var admission = await Arena8NativeAdmission.OpenAsync(_ => Task.FromResult(response));
            Assert.That(admission.HttpsOrigin, Is.EqualTo(new Uri("https://127.0.0.1:8443")));
            Assert.That(admission.WssOrigin, Is.EqualTo(new Uri("wss://127.0.0.1:8443/rt/v1")));
            Assert.That(admission.ContentHash.Length, Is.EqualTo(32));
            Assert.That(admission.BootId, Is.Not.EqualTo(Guid.Empty));
            Assert.That(admission.MatchId, Is.Not.EqualTo(Guid.Empty));
            var ticket = await admission.TicketAsync();
            Assert.That(ticket.ToString(), Is.EqualTo("AdmissionTicket[redacted]"));
            Assert.That(ticket.ToString(), Does.Not.Contain("ticket-value"));
            var expires = (DateTimeOffset)typeof(AdmissionTicket)
                .GetField("Expires", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(ticket);
            Assert.That(expires, Is.GreaterThan(DateTimeOffset.UtcNow).And.LessThanOrEqualTo(DateTimeOffset.UtcNow.AddSeconds(31)));

            Assert.That(await Rejects(Allocation(httpsOrigin: "http://127.0.0.1:8443")), Is.True, "cleartext platform origin");
            Assert.That(await Rejects(Allocation(wssUrl: "ws://127.0.0.1:8443/rt/v1")), Is.True, "cleartext socket origin");
            Assert.That(await Rejects(Allocation(wssUrl: "wss://127.0.0.1:8443/other")), Is.True, "unexpected socket path");
            Assert.That(await Rejects(Allocation(wssUrl: "wss://127.0.0.1:9443/rt/v1")), Is.True, "cross-origin socket");
            Assert.That(await Rejects(Allocation(contentHash: "00")), Is.True, "short content hash");
            Assert.That(await Rejects(Allocation(matchId: Guid.Empty.ToString())), Is.True, "empty match id");
            Assert.That(await Rejects(Allocation(expiresAt: DateTimeOffset.UtcNow.AddMinutes(-1).ToString("O"))), Is.True, "stale ticket");
            Assert.That(await Rejects(Allocation(expiresAt: DateTimeOffset.UtcNow.AddMinutes(5).ToString("O"))), Is.True, "unbounded ticket");
            Assert.That(await Rejects(Allocation(principal: "bad principal")), Is.True, "malformed principal");

            response = Allocation(matchId: Guid.NewGuid().ToString());
            var scope = Assert.ThrowsAsync<NativeFailure>(() => admission.TicketAsync());
            Assert.That(scope.Reason, Is.EqualTo(Failure.Scope));
        }

        [Test]
        public async Task FunctionalAdmissionRejectsMixedRulesetAllocationAndRenewal()
        {
            var reply = Allocation();
            Assert.ThrowsAsync<NativeFailure>(async () => await Arena8NativeAdmission.OpenAsync(
                _ => Task.FromResult(reply), expectedRuleset: CoopNativeView.FunctionalSoloRuleset));

            reply.ruleset = CoopNativeView.FunctionalSoloRuleset;
            Assert.ThrowsAsync<NativeFailure>(async () => await Arena8NativeAdmission.OpenAsync(
                _ => Task.FromResult(reply)));
            var admission = await Arena8NativeAdmission.OpenAsync(_ => Task.FromResult(reply),
                expectedRuleset: CoopNativeView.FunctionalSoloRuleset);
            Assert.That(await admission.TicketAsync(), Is.Not.Null);
            reply.ruleset = null;
            Assert.ThrowsAsync<NativeFailure>(async () => await admission.TicketAsync());
        }

        private static Arena8NativeAllocation Allocation(string httpsOrigin = "https://127.0.0.1:8443",
            string wssUrl = "wss://127.0.0.1:8443/rt/v1", string contentHash = "abababababababababababababababababababababababababababababababab",
            string matchId = "11111111-1111-4111-8111-111111111111", string expiresAt = null, string principal = "principal")
        {
            return new Arena8NativeAllocation
            {
                ticket = "ticket-value", wssUrl = wssUrl, httpsOrigin = httpsOrigin, contentHash = contentHash,
                bootId = "22222222-2222-4222-8222-222222222222", matchId = matchId, expiresAt = expiresAt,
                principal = principal,
            };
        }

        private static async Task<bool> Rejects(Arena8NativeAllocation response)
        {
            try
            {
                var admission = await Arena8NativeAdmission.OpenAsync(_ => Task.FromResult(response));
                await admission.TicketAsync();
                return false;
            }
            catch (NativeFailure) { return true; }
        }

        private static Arena8NativeView Decode(ulong version, string json) =>
            Arena8NativeView.Decode(version, Encoding.UTF8.GetBytes(json));

        private static PlayState DecodeState(Arena8NativePlaySession session, ulong version, string json) =>
            (PlayState)typeof(Arena8NativePlaySession)
                .GetMethod("Decode", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(session, new object[] { version, Encoding.UTF8.GetBytes(json) });

        private static void SetState(Arena8NativePlaySession session, PlayState state) =>
            typeof(NativePlaySession).GetField("state", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(session, state);

        private static string Text(byte[] payload) => Encoding.UTF8.GetString(payload);

        private static string Projection(
            string phase = "ready", int turn = 0, int health = 220, int effectiveHealth = 220, int enemyHealth = 160,
            int enemyShield = 0, int mana = 0, int rage = 0, int cooldown = 0, int fireZoneTurns = 0,
            string telegraph = "null", string skills = null, string board = null, string reward = "null",
            int schemaVersion = 1, int level = 20, long epoch = 1, string extraState = "", string extraRoot = "")
        {
            board = board ?? Numbers(Fallback);
            skills = skills ?? "[\"shared-skill\",\"signature\",\"ultimate\",\"guard\"]";
            return "{\"state\":{"
                + "\"schemaVersion\":" + schemaVersion + ","
                + "\"ruleset\":{\"id\":\"arena8-pve\",\"version\":1,\"reducerId\":\"aetheria-pet-arena-arena8\","
                + "\"contentHash\":\"" + ContentHash + "\",\"bindingId\":\"arena8-content-binding\","
                + "\"bindingVersion\":1,\"bindingDigest\":\"" + BindingDigest + "\","
                + "\"rosterVersion\":\"arena8-roster-v1\",\"rulesDigest\":\"" + RulesDigest + "\"},"
                + "\"pet\":{\"id\":\"icarus\",\"name\":\"Icarus\",\"family\":\"emberling\","
                + "\"element\":\"fire\",\"level\":" + level + ",\"ownedPetId\":\"33333333-3333-4333-8333-333333333333\"},"
                + "\"stats\":{\"base\":{\"health\":180,\"attack\":20,\"defense\":10},"
                + "\"grown\":{\"health\":200,\"attack\":22,\"defense\":12},"
                + "\"effective\":{\"health\":" + effectiveHealth + ",\"attack\":24,\"defense\":14}},"
                + "\"artifacts\":[{\"slot\":\"core\",\"definitionId\":\"core-emberglass\",\"rank\":\"D\","
                + "\"upgradeLevel\":1,\"modifiers\":{\"hp\":4,\"attack\":2,\"defense\":1,\"speed\":1}}],"
                + "\"modifiers\":{"
                + "\"hp\":{\"value\":4,\"active\":true,\"effect\":\"health\",\"reason\":\"adds to maximum and starting health\"},"
                + "\"attack\":{\"value\":2,\"active\":true,\"effect\":\"attack\",\"reason\":\"adds to attack\"},"
                + "\"defense\":{\"value\":1,\"active\":true,\"effect\":\"defense\",\"reason\":\"adds to defense\"},"
                + "\"speed\":{\"value\":1,\"active\":false,\"effect\":\"inactive\",\"reason\":\"arena8 has no initiative\"}},"
                + "\"skills\":" + skills + ","
                + "\"encounter\":{\"index\":0,\"id\":\"cinder-terraces-regular\",\"revision\":1,"
                + "\"boss\":false,\"element\":\"fire\"},"
                + "\"phase\":\"" + phase + "\",\"turn\":" + turn + ",\"board\":" + board + ","
                + "\"health\":" + health + ",\"enemyHealth\":" + enemyHealth + ",\"enemyShield\":" + enemyShield + ","
                + "\"mana\":" + mana + ",\"rage\":" + rage + ",\"cooldown\":" + cooldown + ","
                + "\"fireZoneTurns\":" + fireZoneTurns + ",\"telegraph\":" + telegraph + ","
                + "\"snapshotDigest\":\"" + SnapshotDigest + "\"" + extraState + "},"
                + "\"epoch\":" + epoch + ",\"reward\":" + reward + extraRoot + "}";
        }

        private static string Telegraph(int announcedTurn, string axis = "row", int target = 0, string kind = "assault") =>
            "{\"kind\":\"" + kind + "\",\"axis\":\"" + axis + "\",\"target\":" + target +
            ",\"announcedTurn\":" + announcedTurn + ",\"resolvesTurn\":" + (announcedTurn + 1) +
            ",\"cells\":[" + string.Join(",", Lane(axis, target)) + "]}";

        private static int[] Lane(string axis, int target)
        {
            var cells = new int[8];
            for (var offset = 0; offset < 8; offset++)
                cells[offset] = axis == "row" ? target * 8 + offset : offset * 8 + target;
            return cells;
        }

        private static string Numbers(int[] values) => "[" + string.Join(",", values) + "]";

        private static int[] BuildFallback()
        {
            var cells = new int[64];
            for (var y = 0; y < 8; y++)
                for (var x = 0; x < 8; x++)
                    cells[y * 8 + x] = (x + 2 * y) % 6;
            cells[0] = 0; cells[1] = 0; cells[2] = 1; cells[3] = 0; cells[9] = 0;
            return cells;
        }
    }
}
