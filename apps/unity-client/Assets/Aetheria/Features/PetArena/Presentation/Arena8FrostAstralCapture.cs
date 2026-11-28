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
            functionalHud.Refresh();
            var samples = new List<AdvancedSample>();
            var timeline = new List<NatureFrame>();
            try
            {
                for (var step = 0; step < 36 && !view.Terminal; step++)
                {
                    if (functionalSession.RequiresReconnect) view = (await functionalSession.ReconnectAsync(token)).Coop;
                    var before = view;
                    var frame = SnapshotNature(before);
                    timeline.Add(frame);
                    var ids = frame.board.Distinct().ToList();
                    var board = frame.board.Select(kind => ids.IndexOf(kind)).ToArray();
                    var moves = FindNativeSwaps(board).Where(move => board[move.first] != board[move.second])
                        .Select(pair => (pair, frost: MatchedKind(frame.board, pair, "frost"),
                            astral: MatchedKind(frame.board, pair, "astral"), sword: MatchedKind(frame.board, pair, "sword"),
                            protection: MatchedKind(frame.board, pair, "heart") + MatchedKind(frame.board, pair, "shield")))
                        .OrderBy(move => move.sword).ThenByDescending(move => move.protection).ToArray();
                    if (moves.Length == 0) throw new InvalidOperationException("The committed Ghost board has no legal swap.");
                    var collectArmed = samples.All(sample => sample.kind != "chill-armed");
                    var collectConsumed = !collectArmed && samples.All(sample => sample.kind != "chill-consumed");
                    var move = moves[0];
                    bool guard = collectConsumed;
                    if (collectArmed && moves.Any(candidate => candidate.frost > 0))
                        move = moves.First(candidate => candidate.frost > 0);
                    else if (!collectArmed && !collectConsumed && moves.Any(candidate => candidate.astral > 0))
                    {
                        guard = before.Turn < 12;
                        if (!guard) move = moves.First(candidate => candidate.astral > 0);
                    }

                    var result = guard
                        ? await functionalSession.GuardAsync(token)
                        : await functionalSession.SwapAsync(move.pair.first, move.pair.second, token);
                    view = result.Coop;
                    functionalHud.Refresh();
                    var pending = collectArmed ? new[] { "chill-armed", "chill-consumed" } :
                        new[] { collectConsumed ? "chill-consumed" : "astral-upgrade" };
                    foreach (var desired in pending)
                    {
                        var effect = view.JewelFeedback.Where(row => row.Kind == desired)
                            .OrderByDescending(row => row.Value).FirstOrDefault();
                        if (effect == null) continue;
                        if (desired == "chill-armed" && (guard || move.frost < 3)) break;
                        if (desired == "chill-consumed" &&
                            (samples.Count == 0 || samples[0].value != effect.Value || view.ChillReductionPm != 0))
                            continue;
                        if (desired == "astral-upgrade" && (guard || before.Turn < 12 || move.astral < 3))
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
                    if (samples.Count == 3)
                    {
                        File.WriteAllText(Path.Combine(nativeCaptureDirectory, "advanced-samples.json"),
                            JsonUtility.ToJson(new AdvancedEvidence { samples = samples.ToArray() }, true));
                        nativeFacts.status = "ok";
                        nativeFacts.matchId = matchId;
                        nativeFacts.phase = view.Phase;
                        nativeFacts.version = checked((int)view.Version);
                        nativeFacts.ruleset = view.RulesetId;
                        nativeFacts.participantCount = view.Participants.Count;
                        nativeFacts.boardTiles = view.Board.Count;
                        return;
                    }
                }
                throw new InvalidOperationException("The natural Ghost battle did not expose all Frost and Astral checks. Observed: " +
                    string.Join(", ", samples.Select(sample => sample.kind)));
            }
            finally
            {
                timeline.Add(SnapshotNature(view));
                File.WriteAllLines(Path.Combine(nativeCaptureDirectory, "advanced-timeline.jsonl"),
                    timeline.Select(frame => JsonUtility.ToJson(frame)));
            }
        }

        [Serializable]
        private sealed class AdvancedEvidence { public AdvancedSample[] samples; }
    }
}
