using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    // In-player native acceptance driver. Every match operation still goes
    // through authenticated allocation, native admission and committed WSS
    // receipts. It never synthesizes an outcome, board or reward.
    public sealed partial class Arena8CampaignScreen
    {
        [Serializable]
        private sealed class NativeFacts
        {
            public string status, matchId, phase, error, boardDigest, settlement, ruleset;
            public string regularSettlement, bossSettlement, artifactId;
            public int version, boardTiles, skills, coins, participantCount;
            public bool artifactEquipped, waterAllocated, waterStarted;
            public string[] skillIds;
        }

        private string nativeCaptureDirectory;
        private NativeFacts nativeFacts;
        private int lastGuardTurn = -1;

        private static string NativeCaptureDirectory()
        {
            var args = Environment.GetCommandLineArgs();
            for (var index = 0; index < args.Length - 1; index++)
                if (args[index] == "-aetheria-arena8-native-capture")
                    return args[index + 1];
            return null;
        }

        private static bool NativeArgument(string name) => Environment.GetCommandLineArgs().Contains(name);

        private async Task AutomatedNativeAcceptance()
        {
            nativeCaptureDirectory = NativeCaptureDirectory();
            nativeFacts = new NativeFacts { status = "running" };
            try
            {
                Directory.CreateDirectory(nativeCaptureDirectory);
                if (!loadedSession)
                {
                    await api.CreateGuest(displayName, NewRequestId(), lifetime.Token);
                    loadedSession = true;
                }
                await LoadLobby();
                if (NativeArgument("-aetheria-arena8-shared-frost-astral"))
                {
                    await CaptureNaturalFrostAndAstral();
                    return;
                }
                if (NativeArgument("-aetheria-arena8-shared-nature"))
                {
                    await CaptureNaturalNatureCleanse();
                    return;
                }
                if (NativeArgument("-aetheria-arena8-functional-turn"))
                {
                    await CaptureFunctionalBattleTurn();
                    return;
                }
                if (NativeArgument("-aetheria-arena8-native-turn"))
                {
                    await AllocateNative("cinder-terraces", "cinder-terraces-regular");
                    Draw();
                    await CaptureNative("native-turn-01-allocated.png");
                    await Native((session, token) => session.StartAsync(token));
                    Draw();
                    await CaptureNative("native-turn-02-started.png");
                    var swaps = FindNativeSwaps(nativeView.Board);
                    if (swaps.Count == 0) throw new InvalidOperationException("No legal native swap");
                    await Native((session, token) => session.SwapAsync(swaps[0].first, swaps[0].second, token));
                    Draw();
                    await CaptureNative("native-turn-03-swap.png");
                    nativeFacts.status = "ok";
                    nativeFacts.matchId = matchId;
                    nativeFacts.phase = nativeView.Phase;
                    nativeFacts.version = checked((int)nativeView.Version);
                    nativeFacts.boardTiles = nativeView.Board.Count;
                    nativeFacts.skills = nativeView.Skills.Count;
                    nativeFacts.skillIds = nativeView.Skills.ToArray();
                    nativeFacts.boardDigest = nativeView.SnapshotDigest;
                    return;
                }
                if (NativeArgument("-aetheria-arena8-native-one"))
                {
                    var one = await RunNativeMatch("cinder-terraces", "cinder-terraces-regular", "native-one");
                    nativeFacts.status = "ok";
                    nativeFacts.matchId = matchId;
                    nativeFacts.phase = one.won ? "won" : "lost";
                    nativeFacts.version = 0;
                    nativeFacts.boardTiles = 64;
                    nativeFacts.settlement = DescribeNative(one);
                    nativeFacts.coins = state.wallet.coins;
                    return;
                }
                if (NativeArgument("-aetheria-arena8-native-water"))
                {
                    await AllocateNative("tideglass-lagoon", "tideglass-lagoon-regular");
                    Draw();
                    await CaptureNative("native-water-01-allocated.png");
                    await Native((session, token) => session.StartAsync(token));
                    Draw();
                    await CaptureNative("native-water-02-started.png");
                    var swaps = FindNativeSwaps(nativeView.Board);
                    if (swaps.Count > 0)
                        await Native((session, token) => session.SwapAsync(swaps[0].first, swaps[0].second, token));
                    Draw();
                    await CaptureNative("native-water-03-swap.png");
                    nativeFacts.status = "ok";
                    nativeFacts.matchId = matchId;
                    nativeFacts.phase = nativeView.Phase;
                    nativeFacts.version = checked((int)nativeView.Version);
                    nativeFacts.boardTiles = nativeView.Board.Count;
                    nativeFacts.skills = nativeView.Skills.Count;
                    nativeFacts.skillIds = nativeView.Skills.ToArray();
                    nativeFacts.boardDigest = nativeView.SnapshotDigest;
                    nativeFacts.waterStarted = true;
                    return;
                }

                Arena8Settlement regular = null;
                for (var attempt = 0; attempt < 6 && regular?.won != true; attempt++)
                {
                    regular = await RunNativeMatch("cinder-terraces", "cinder-terraces-regular",
                        "native-regular-" + attempt);
                    nativeFacts.regularSettlement = DescribeNative(regular);
                }
                if (regular?.won != true)
                    throw new InvalidOperationException("Native Fire regular did not clear in six attempts");

                artifacts = await api.GetArtifactState(lifetime.Token);
                var reward = artifacts.inventory?.FirstOrDefault(item => item.acquiredMapId == "cinder-terraces")
                    ?? artifacts.inventory?.FirstOrDefault(item => item.Equipment == null);
                if (reward != null)
                {
                    await api.EquipArtifact(new WaveAArtifactEquipRequest
                    {
                        requestId = NewRequestId(), petId = selectedPet, artifactId = reward.artifactId,
                    }, lifetime.Token);
                    artifacts = await api.GetArtifactState(lifetime.Token);
                    nativeFacts.artifactId = reward.artifactId;
                    var equipped = artifacts.FindPet(selectedPet);
                    nativeFacts.artifactEquipped = equipped?.slots != null &&
                        (equipped.slots.core == reward.artifactId || equipped.slots.aegis == reward.artifactId ||
                         equipped.slots.rune == reward.artifactId);
                    Draw();
                    await CaptureNative("native-05-artifact.png");
                }

                // Bounded legitimate regular progression raises the Pet level
                // before the boss attempt; no stats or rewards are seeded.
                for (var extra = 0; extra < 20 &&
                    (state.FindPet(selectedPet)?.level ?? 60) < 30; extra++)
                {
                    var win = await RunNativeMatch("cinder-terraces", "cinder-terraces-regular",
                        "native-regular-extra-" + extra);
                    nativeFacts.regularSettlement = DescribeNative(win);
                }

                Arena8Settlement boss = null;
                for (var attempt = 0; attempt < 8 && boss?.won != true; attempt++)
                {
                    boss = await RunNativeMatch("cinder-terraces", "cinder-terraces-boss",
                        "native-boss-" + attempt);
                    nativeFacts.bossSettlement = DescribeNative(boss);
                }
                if (boss?.won != true)
                    throw new InvalidOperationException("Native Fire boss did not clear in six attempts");

                state = await api.GetWave1State(lifetime.Token);
                await AllocateNative("tideglass-lagoon", "tideglass-lagoon-regular");
                nativeFacts.waterAllocated = nativeView != null && nativeView.Phase != null;
                Draw();
                await CaptureNative("native-07-water.png");

                nativeFacts.status = "ok";
                nativeFacts.matchId = matchId;
                nativeFacts.phase = nativeView?.Phase ?? "";
                nativeFacts.version = nativeView == null ? 0 : checked((int)nativeView.Version);
                nativeFacts.boardTiles = nativeView?.Board.Count ?? 0;
                nativeFacts.skills = nativeView?.Skills.Count ?? 0;
                nativeFacts.skillIds = nativeView?.Skills.ToArray() ?? Array.Empty<string>();
                nativeFacts.boardDigest = nativeView?.SnapshotDigest ?? "";
                nativeFacts.settlement = DescribeNative(regular) + " | " + DescribeNative(boss);
                nativeFacts.coins = state.wallet.coins;
            }
            catch (Exception exception)
            {
                nativeFacts.status = "failed";
                nativeFacts.error = exception.Message;
                try { await CaptureNative("native-99-failed.png"); } catch { }
            }
            finally
            {
                File.WriteAllText(Path.Combine(nativeCaptureDirectory ?? ".", "native-facts.json"),
                    JsonUtility.ToJson(nativeFacts, true));
                Application.Quit(nativeFacts.status == "ok" ? 0 : 2);
            }
        }

        private async Task CaptureFunctionalBattleTurn()
        {
            var map = NativeArgument("-aetheria-arena8-functional-water") ? "tideglass-lagoon" : "cinder-terraces";
            var encounter = map + (NativeArgument("-aetheria-arena8-functional-regular") ? "-regular" : "-boss");
            if (!UsesFunctionalBoard)
                throw new InvalidOperationException("Enable the functional native campaign for this capture.");
            var token = lifetime.Token;
            await AllocateFunctional(map, encounter, automated: true);
            await CaptureNative("functional-solo-01-admitted.png");

            if (functionalSession.RequiresReconnect) await functionalSession.ReconnectAsync(token);
            await functionalSession.StartAsync(token);
            functionalHud.Refresh();
            await CaptureNative("functional-solo-02-playing.png");

            if (functionalSession.RequiresReconnect) await functionalSession.ReconnectAsync(token);
            var started = functionalSession.State.Coop;
            if (started.Board.Any(tile => tile?.Kind == null))
                throw new InvalidOperationException("Expected a full committed functional board.");
            var identities = started.Board.Select(tile => tile.Kind).Distinct().ToList();
            var board = started.Board.Select(tile => identities.IndexOf(tile.Kind)).ToArray();
            var moves = FindNativeSwaps(board);
            if (moves.Count == 0) throw new InvalidOperationException("No legal swap on the committed board.");
            var move = moves[0];
            var swapped = (await functionalSession.SwapAsync(move.first, move.second, token)).Coop;
            if (swapped.Version <= started.Version)
                throw new InvalidOperationException("The native swap did not advance the committed version.");
            functionalHud.Refresh();
            await CaptureNative("functional-solo-03-committed-swap.png");

            nativeFacts.status = "ok";
            nativeFacts.matchId = matchId;
            nativeFacts.phase = swapped.Phase;
            nativeFacts.ruleset = swapped.RulesetId;
            nativeFacts.participantCount = swapped.Participants.Count;
            nativeFacts.version = checked((int)swapped.Version);
            nativeFacts.boardTiles = swapped.Board.Count;
            nativeFacts.skillIds = swapped.Abilities.Select(ability => ability.Id).ToArray();
            nativeFacts.skills = nativeFacts.skillIds.Length;
        }

        private async Task<Arena8Settlement> RunNativeMatch(string map, string encounter, string prefix)
        {
            lastGuardTurn = -1;
            await AllocateNative(map, encounter);
            Draw();
            await CaptureNative(prefix + "-allocated.png");
            await Native((session, token) => session.StartAsync(token));
            Draw();
            await CaptureNative(prefix + "-started.png");
            for (var turn = 0; turn < 60 && nativeView != null && !nativeView.Terminal; turn++)
                await NativeTurn();
            Draw();
            await CaptureNative(prefix + "-terminal.png");
            if (nativeView == null || !nativeView.Terminal)
                throw new InvalidOperationException("Native match did not terminate");
            var settlement = await SettleNativeBattle();
            state = await api.GetWave1State(lifetime.Token);
            artifacts = await api.GetArtifactState(lifetime.Token);
            DisposeNative();
            // The native runtime and its TLS bridge close asynchronously after
            // settlement; wait for the bounded teardown before a new allocation.
            await Task.Delay(5000);
            Draw();
            await CaptureNative(prefix + "-settled.png");
            return settlement;
        }

        private async Task NativeTurn()
        {
            // A transport/lost-ACK failure leaves the immutable command pending.
            // Replay that exact command; never replace it with a new decision.
            if (nativeSession != null && nativeSession.HasPendingCommand)
            {
                await RetryNative();
                return;
            }
            var view = nativeView;
            // Telegraph is public. Guard once when a heavy lane is about to
            // resolve and health is genuinely threatened; never guard twice in
            // a row and never let Guard replace available offense.
            if (view.TelegraphKind == "heavy" && view.Health <= 80 &&
                view.TelegraphResolvesTurn == view.Turn + 1 && lastGuardTurn != view.Turn &&
                await TryNative((session, token) => session.GuardAsync(token)))
            {
                lastGuardTurn = view.Turn;
                return;
            }
            if (view.Affords(Arena8NativeView.Ultimate) &&
                await TryNative((session, token) => session.UltimateAsync(token))) { lastGuardTurn = -1; return; }
            if (view.Affords(Arena8NativeView.Signature) &&
                await TryNative((session, token) => session.SignatureAsync(token))) { lastGuardTurn = -1; return; }
            if (view.Affords(Arena8NativeView.SharedSkill) &&
                await TryNative((session, token) => session.SkillAsync(token))) { lastGuardTurn = -1; return; }
            var best = BestNativeSwap(view);
            if (best != null && await TryNative((session, token) =>
                session.SwapAsync(best.Value.first, best.Value.second, token))) { lastGuardTurn = -1; return; }
            if (lastGuardTurn != view.Turn &&
                await TryNative((session, token) => session.GuardAsync(token)))
            {
                lastGuardTurn = view.Turn;
                return;
            }
            throw new InvalidOperationException("Native match has no accepted action");
        }

        private static (int first, int second)? BestNativeSwap(Arena8NativeView view)
        {
            var own = ElementId(view.PetElement);
            (int first, int second)? best = null;
            var bestScore = -1;
            foreach (var swap in FindNativeSwaps(view.Board))
            {
                var score = NativeSwapScore(view.Board, swap.first, swap.second, own);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = swap;
                }
            }
            return best;
        }

        // Scores only committed public tiles: longer runs and own-element runs
        // are better. It never predicts refills, damage or hidden entropy.
        private static int NativeSwapScore(System.Collections.Generic.IReadOnlyList<int> board,
            int first, int second, int own)
        {
            var next = board.ToArray();
            (next[first], next[second]) = (next[second], next[first]);
            var score = 0;
            for (var at = 0; at < 64; at++)
            {
                var x = at % 8;
                var y = at / 8;
                if (x <= 5)
                {
                    var length = RunLength(next, at, 1);
                    if (length >= 3) score += length * 10 + (next[at] == own ? length * 6 : 0);
                }
                if (y <= 5)
                {
                    var length = RunLength(next, at, 8);
                    if (length >= 3) score += length * 10 + (next[at] == own ? length * 6 : 0);
                }
            }
            return score;
        }

        private static int RunLength(int[] board, int start, int step)
        {
            var value = board[start];
            var length = 1;
            for (var at = start + step; at < 64 && at / 8 == (at - step) / 8 + (step == 8 ? 1 : 0) &&
                board[at] == value; at += step) length++;
            return length;
        }

        private static int ElementId(string element)
        {
            switch (element)
            {
                case "fire": return 0;
                case "water": return 1;
                case "electric": return 2;
                case "ghost": return 3;
                case "ground": return 4;
                case "light": return 5;
                default: return -1;
            }
        }

        private static string DescribeNative(Arena8Settlement settlement) =>
            (settlement.won ? "victory" : "defeat") + " +" + settlement.coins + "c +" +
            settlement.exp + "xp mat=" + settlement.materials;

        private async Task<bool> TryNative(Func<Arena8NativePlaySession, System.Threading.CancellationToken, Task<PlayState>> command)
        {
            try { await Native(command); return true; }
            catch (InvalidOperationException error)
            {
                Console.Error.WriteLine("Native action rejected: " + error.Message + " · " +
                    (error.InnerException?.Message ?? "no-inner"));
                return false;
            }
        }

        private async Task CaptureNative(string name)
        {
            await Task.Yield();
            ScreenCapture.CaptureScreenshot(Path.Combine(nativeCaptureDirectory, name));
            await Task.Delay(250);
        }

        private static System.Collections.Generic.List<(int first, int second)> FindNativeSwaps(
            System.Collections.Generic.IReadOnlyList<int> board)
        {
            var result = new System.Collections.Generic.List<(int first, int second)>();
            for (var index = 0; index < 64; index++)
            {
                var row = index / 8;
                var column = index % 8;
                if (column < 7 && NativeSwapMatches(board, index, index + 1))
                    result.Add((index, index + 1));
                if (row < 7 && NativeSwapMatches(board, index, index + 8))
                    result.Add((index, index + 8));
            }
            return result;
        }

        private static bool NativeSwapMatches(System.Collections.Generic.IReadOnlyList<int> board, int first, int second)
        {
            var next = board.ToArray();
            (next[first], next[second]) = (next[second], next[first]);
            for (var at = 0; at < 64; at++)
            {
                var x = at % 8;
                var y = at / 8;
                if (x < 6 && next[at] == next[at + 1] && next[at] == next[at + 2]) return true;
                if (y < 6 && next[at] == next[at + 8] && next[at] == next[at + 16]) return true;
            }
            return false;
        }
    }
}
