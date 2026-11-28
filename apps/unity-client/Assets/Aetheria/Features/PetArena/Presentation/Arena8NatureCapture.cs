using System;
using System.Collections.Generic;
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
        private sealed class NatureFrame
        {
            public int version, turn, vulnerability, turns, pending;
            public uint health;
            public string phase;
            public string[] board;
        }

        [Serializable]
        private sealed class NatureCapture
        {
            public string matchId, receiptId, eventKind, configDigest, contentHash, hudLabel;
            public int rulesetVersion, first, second, firstWaveNature, eventSeat;
            public long eventValue;
            public NatureFrame before, after;
        }

        private async Task CaptureNaturalNatureCleanse()
        {
            const string map = "lantern-necropolis";
            if (!UsesFunctionalBoard)
                throw new InvalidOperationException("The Nature capture requires the shared functional board.");
            var token = lifetime.Token;
            var view = await StartGhostCapture(map, token);
            functionalHud.Refresh();
            await CaptureNative("nature-solo-01-started.png");

            var timeline = new List<NatureFrame>();
            try
            {
                for (var step = 0; step < 24 && !view.Terminal; step++)
                {
                    if (functionalSession.RequiresReconnect) view = (await functionalSession.ReconnectAsync(token)).Coop;
                    var before = SnapshotNature(view);
                    timeline.Add(before);
                    if (before.board.Any(kind => kind == null))
                        throw new InvalidOperationException("An active Ghost board has an empty cell.");
                    var identities = before.board.Distinct().ToList();
                    var board = before.board.Select(kind => identities.IndexOf(kind)).ToArray();
                    var moves = FindNativeSwaps(board).Where(move => board[move.first] != board[move.second])
                        .Select(move => (move.first, move.second,
                            nature: MatchedKind(before.board, move, "nature"),
                            sword: MatchedKind(before.board, move, "sword"),
                            shield: MatchedKind(before.board, move, "shield"),
                            heart: MatchedKind(before.board, move, "heart")))
                        .OrderBy(move => move.sword).ThenByDescending(move => move.heart + move.shield).ToArray();
                    if (moves.Length == 0)
                        throw new InvalidOperationException("The committed Ghost board has no legal swap.");

                    var canCleanse = before.vulnerability > 0;
                    var move = canCleanse && moves.Any(candidate => candidate.nature > 0)
                        ? moves.First(candidate => candidate.nature > 0) : moves[0];
                    bool guard = !canCleanse && moves.Any(candidate => candidate.nature > 0);
                    if (!guard && move.nature > 0 && canCleanse)
                        await CaptureNative("nature-solo-02-before.png");
                    var result = guard
                        ? await functionalSession.GuardAsync(token)
                        : await functionalSession.SwapAsync(move.first, move.second, token);
                    view = result.Coop;
                    var after = SnapshotNature(view);
                    var cleanse = view.JewelFeedback.FirstOrDefault(effect => effect.Kind == "nature-cleanse");
                    functionalHud.Refresh();
                    if (guard || move.nature < 3 || cleanse == null || before.vulnerability == 0)
                        continue;

                    const string label = "−1";
                    var overlay = GetComponent<UIDocument>().rootVisualElement.Q("coop-jewel-feedback");
                    if (string.IsNullOrEmpty(result.ReceiptId) || after.version != before.version + 1 ||
                        overlay == null || !overlay.Query<Label>().ToList().Any(candidate => candidate.text == label))
                        throw new InvalidOperationException("Expected the exact committed Nature swap receipt.");
                    var details = new NatureCapture {
                        matchId = matchId, receiptId = result.ReceiptId, eventKind = cleanse.Kind, eventValue = cleanse.Value,
                        eventSeat = cleanse.Seat ?? -1, configDigest = view.ConfigDigest, contentHash = view.ContentHash,
                        rulesetVersion = view.RulesetVersion, first = move.first, second = move.second,
                        firstWaveNature = move.nature, before = before, after = after, hudLabel = label,
                    };
                    timeline.Add(after);
                    functionalHud.enabled = true;
                    await CaptureNative("nature-solo-03-cleanse.png");
                    File.WriteAllText(Path.Combine(nativeCaptureDirectory, "nature-capture.json"), JsonUtility.ToJson(details, true));
                    nativeFacts.status = "ok";
                    nativeFacts.matchId = matchId;
                    nativeFacts.phase = view.Phase;
                    nativeFacts.version = after.version;
                    nativeFacts.ruleset = view.RulesetId;
                    nativeFacts.participantCount = view.Participants.Count;
                    nativeFacts.boardTiles = view.Board.Count;
                    return;
                }
                timeline.Add(SnapshotNature(view));
                throw new InvalidOperationException("No Nature cleanse was observed in the bounded natural Ghost battle.");
            }
            finally
            {
                File.WriteAllLines(Path.Combine(nativeCaptureDirectory, "nature-timeline.jsonl"),
                    timeline.Select(frame => JsonUtility.ToJson(frame)));
            }
        }

        private async Task<CoopNativeView> StartGhostCapture(string map, System.Threading.CancellationToken token)
        {
            string proof = Path.Combine(nativeCaptureDirectory, "nature-map-access-ready");
            File.WriteAllText(Path.Combine(nativeCaptureDirectory, "nature-guest-ready"), "ordinary starter initialized\n");
            for (var wait = 0; !File.Exists(proof); wait++)
            {
                if (wait >= 120) throw new InvalidOperationException("The disposable map-access fixture did not become ready.");
                await Task.Delay(250, token);
            }

            await AllocateFunctional(map, map + "-regular", automated: true);
            if (functionalSession.RequiresReconnect) await functionalSession.ReconnectAsync(token);
            var view = (await functionalSession.StartAsync(token)).Coop;
            if (view.RulesetVersion != 4 || view.BossId != map + "-regular" || view.Participants.Count != 1)
                throw new InvalidOperationException("Expected the shared schema 6 Ghost regular solo projection.");
            return view;
        }

        private static NatureFrame SnapshotNature(CoopNativeView view)
        {
            var status = view.Own.Statuses.FirstOrDefault(active => active.Kind == "vulnerability");
            return new NatureFrame {
                version = checked((int)view.Version), turn = view.Turn, health = view.Own.Health,
                vulnerability = status?.Value ?? 0, turns = status?.Turns ?? 0, pending = view.PendingAttack?.Remaining ?? 0,
                phase = view.Phase, board = view.Board.Select(tile => tile?.Kind).ToArray(),
            };
        }

        private static int MatchedKind(string[] board, (int first, int second) move, string kind)
        {
            var swapped = (string[])board.Clone();
            (swapped[move.first], swapped[move.second]) = (swapped[move.second], swapped[move.first]);
            var matches = new HashSet<int>();
            for (int cell = 0; cell < swapped.Length; cell++)
            {
                if (swapped[cell] != kind) continue;
                if (cell % 8 < 6 && swapped[cell + 1] == kind && swapped[cell + 2] == kind)
                {
                    matches.Add(cell); matches.Add(cell + 1); matches.Add(cell + 2);
                }
                if (cell < 48 && swapped[cell + 8] == kind && swapped[cell + 16] == kind)
                {
                    matches.Add(cell); matches.Add(cell + 8); matches.Add(cell + 16);
                }
            }
            return matches.Count;
        }
    }
}
