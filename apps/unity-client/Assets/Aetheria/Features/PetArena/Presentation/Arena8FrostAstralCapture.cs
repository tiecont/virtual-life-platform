using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Aetheria.Networking;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    public sealed partial class Arena8CampaignScreen
    {
        private const int FirstSharedMultiplierTurn = 12;

        [Serializable]
        private sealed class AdvancedSample
        {
            public string matchId, receiptId, configDigest, contentHash, kind, hudLabel;
            public int beforeVersion, version, beforeTurn, beforeChill, afterChill, cell, first, second;
            public long value;
            public int[] beforeMultipliers, afterMultipliers;
            public string phase;
            public string[] beforeKinds, afterKinds;
        }

        private async Task CaptureNaturalFrostAndAstral()
        {
            if (!UsesFunctionalBoard)
                throw new InvalidOperationException("The Frost and Astral capture requires the shared functional board.");
            var token = lifetime.Token;
            var view = await StartGhostCapture("lantern-necropolis", token);
            var encounterMaxHp = view.BossState.MaxHealth;
            functionalHud.Refresh();
            var samples = new List<AdvancedSample>();
            var timeline = new List<NatureFrame>();
            var previousGuard = false;
            try
            {
                for (var step = 0; step < 36 && !view.Terminal; step++)
                {
                    if (functionalSession.RequiresReconnect) view = (await functionalSession.ReconnectAsync(token)).Coop;
                    var before = view;
                    var frame = SnapshotNature(before);
                    timeline.Add(frame);
                    var collectArmed = samples.All(sample => sample.kind != "chill-armed");
                    var collectConsumed = !collectArmed && samples.All(sample => sample.kind != "chill-consumed");
                    var target = collectArmed ? "frost" : "astral";
                    var pending = before.PendingAttack;
                    var inDanger = pending?.Remaining == 1 &&
                        (long)before.Own.Health + before.Own.Shield <= 3L * pending.Damage;
                    var ids = frame.board.Distinct().ToList();
                    var board = frame.board.Select(kind => ids.IndexOf(kind)).ToArray();
                    var moves = FindNativeSwaps(board).Where(move => board[move.first] != board[move.second])
                        .Select(pair => (pair, score: ScoreAdvancedSwap(frame.board, pair, target)))
                        .OrderByDescending(move => move.score.hits > 0)
                        .ThenByDescending(move => inDanger && move.score.protection > 0)
                        .ThenBy(move => move.score.swords > 0)
                        .ThenByDescending(move => move.score.reach)
                        .ThenByDescending(move => move.score.removed)
                        .ThenByDescending(move => move.score.protection)
                        .ThenBy(move => move.score.swords).ToArray();
                    if (moves.Length == 0) throw new InvalidOperationException("The committed Ghost board has no legal swap.");
                    var move = moves[0];
                    var keepAstral = !collectArmed && before.Turn < FirstSharedMultiplierTurn &&
                        (move.score.hits > 0 || move.score.swords > 0);
                    var needsDefense = inDanger && move.score.hits == 0 && move.score.protection == 0;
                    bool guard = collectConsumed || keepAstral || (needsDefense && !previousGuard);

                    var result = guard
                        ? await functionalSession.GuardAsync(token)
                        : await functionalSession.SwapAsync(move.pair.first, move.pair.second, token);
                    previousGuard = guard;
                    view = result.Coop;
                    functionalHud.Refresh();
                    var wanted = collectArmed ? new[] { "chill-armed", "chill-consumed" } :
                        new[] { collectConsumed ? "chill-consumed" : "astral-upgrade" };
                    foreach (var desired in wanted)
                    {
                        var effect = view.JewelFeedback.Where(row => row.Kind == desired)
                            .OrderByDescending(row => row.Value).FirstOrDefault();
                        if (effect == null) continue;
                        if (desired == "chill-armed" && guard) break;
                        if (desired == "chill-consumed" &&
                            (samples.Count == 0 || samples[0].value != effect.Value || view.ChillReductionPm != 0))
                            continue;
                        if (desired == "astral-upgrade" && guard)
                            continue;
                        string label = desired == "astral-upgrade" ? "×" + effect.Value :
                            "−" + (effect.Value / 1000d).ToString("0.#%", CultureInfo.InvariantCulture);
                        var overlay = GetComponent<UIDocument>().rootVisualElement.Q("coop-jewel-feedback");
                        if (string.IsNullOrEmpty(result.ReceiptId) || view.Version <= before.Version ||
                            view.Version - before.Version != 1 || overlay == null ||
                            !overlay.Query<Label>().ToList().Any(candidate => candidate.text == label))
                            throw new InvalidOperationException("The exact committed advanced jewel label was not mounted.");
                        samples.Add(new AdvancedSample {
                            matchId = matchId, receiptId = result.ReceiptId, configDigest = view.ConfigDigest, contentHash = view.ContentHash,
                            kind = effect.Kind, hudLabel = label, value = effect.Value, cell = effect.Cell ?? -1,
                            beforeVersion = frame.version, version = checked((int)view.Version), beforeTurn = before.Turn,
                            beforeChill = before.ChillReductionPm, afterChill = view.ChillReductionPm,
                            first = guard ? -1 : move.pair.first, second = guard ? -1 : move.pair.second,
                            beforeKinds = frame.board, afterKinds = view.Board.Select(tile => tile?.Kind).ToArray(),
                            beforeMultipliers = before.Board.Select(tile => tile?.Multiplier ?? 0).ToArray(),
                            afterMultipliers = view.Board.Select(tile => tile?.Multiplier ?? 0).ToArray(),
                            phase = view.Phase,
                        });
                        functionalHud.enabled = true;
                        await CaptureNative("advanced-solo-" + desired + ".png");
                        functionalHud.enabled = false;
                    }
                    if (samples.Count == 3) break;
                }
                if (samples.Count == 0)
                    throw new InvalidOperationException("The natural Ghost battle did not expose any Frost or Astral checks.");
                File.WriteAllText(Path.Combine(nativeCaptureDirectory, "advanced-samples.json"),
                    JsonUtility.ToJson(new AdvancedEvidence { encounterMaxHp = encounterMaxHp, samples = samples.ToArray() }, true));
                nativeFacts.status = samples.Count == 3 ? "ok" : "partial";
                nativeFacts.matchId = matchId;
                nativeFacts.phase = view.Phase;
                nativeFacts.version = checked((int)view.Version);
                nativeFacts.ruleset = view.RulesetId;
                nativeFacts.participantCount = view.Participants.Count;
                nativeFacts.boardTiles = view.Board.Count;
            }
            finally
            {
                timeline.Add(SnapshotNature(view));
                File.WriteAllLines(Path.Combine(nativeCaptureDirectory, "advanced-timeline.jsonl"),
                    timeline.Select(frame => JsonUtility.ToJson(frame)));
            }
        }

        private static (int hits, int swords, int protection, int reach, int removed) ScoreAdvancedSwap(
            string[] board, (int first, int second) move, string target)
        {
            var remaining = (string[])board.Clone();
            (remaining[move.first], remaining[move.second]) = (remaining[move.second], remaining[move.first]);
            var matched = FindNativeMatches(remaining);
            var hits = matched.Count(cell => remaining[cell] == target);
            var swords = matched.Count(cell => remaining[cell] == "sword");
            var protection = matched.Count(cell => remaining[cell] == "heart" || remaining[cell] == "shield");

            // Only gravity for already visible jewels is knowable. Leave all
            // refill cells unknown instead of simulating the server's RNG.
            for (var column = 0; column < 8; column++)
            {
                var destination = 56 + column;
                for (var cell = destination; cell >= 0; cell -= 8)
                {
                    if (matched.Contains(cell)) continue;
                    remaining[destination] = remaining[cell];
                    destination -= 8;
                }
                for (; destination >= 0; destination -= 8) remaining[destination] = null;
            }

            var reach = 0;
            for (var cell = 0; cell < remaining.Length; cell++)
            {
                if (cell % 8 < 6) reach += TargetReach(remaining, target, cell, cell + 1, cell + 2);
                if (cell < 48) reach += TargetReach(remaining, target, cell, cell + 8, cell + 16);
            }
            return (hits, swords, protection, reach, matched.Count);
        }

        private static int TargetReach(string[] board, string target, int first, int second, int third)
        {
            var count = (board[first] == target ? 1 : 0) + (board[second] == target ? 1 : 0) +
                (board[third] == target ? 1 : 0);
            if (count == 3) return 3;
            if (count < 2) return 0;
            var gap = board[first] != target ? first : board[second] != target ? second : third;
            if (board[gap] == null) return 1;
            bool CanFill(int cell) => cell != first && cell != second && cell != third && board[cell] == target;
            return (gap % 8 > 0 && CanFill(gap - 1)) || (gap % 8 < 7 && CanFill(gap + 1)) ||
                (gap >= 8 && CanFill(gap - 8)) || (gap < 56 && CanFill(gap + 8)) ? 2 : 0;
        }

        [Serializable]
        private sealed class AdvancedEvidence
        {
            public uint encounterMaxHp;
            public AdvancedSample[] samples;
        }
    }
}
