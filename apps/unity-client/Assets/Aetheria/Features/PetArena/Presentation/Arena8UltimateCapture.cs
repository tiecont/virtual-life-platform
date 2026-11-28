using System;
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
        private sealed class UltimateEvidence
        {
            public string matchId, configDigest, contentHash, pet, ability, receiptId, hudLabel;
            public int beforeVersion, version, refreshedVersion, guardTurns, rageBefore, rageAfter, cooldownBefore, cooldownAfter;
            public uint bossHealthBefore, bossHealthAfter;
            public int turnTimeoutMilliseconds;
            public long committedDeadlineUnixMs, refreshedDeadlineUnixMs;
            public bool refreshSuppressed;
        }

        private async Task CaptureCommittedUltimate()
        {
            if (!UsesFunctionalBoard)
                throw new InvalidOperationException("The Ultimate capture requires the shared functional board.");
            const string cue = "coop-ultimate-cue";
            var token = lifetime.Token;
            var view = await StartGhostCapture("lantern-necropolis", token);
            functionalHud.Refresh();
            var root = GetComponent<UIDocument>().rootVisualElement;
            int guards = 0;
            while (guards < 12 && !view.Terminal && !view.Own.UltimateReady)
            {
                if (functionalSession.RequiresReconnect) view = (await functionalSession.ReconnectAsync(token)).Coop;
                view = (await functionalSession.GuardAsync(token)).Coop;
                functionalHud.Refresh();
                if (root.Q(cue) != null) throw new InvalidOperationException("An ordinary Guard mounted the Ultimate cue.");
                guards++;
            }
            if (view.Terminal || !view.Own.UltimateReady)
                throw new InvalidOperationException("Ordinary Guard actions did not naturally charge the Ultimate.");
            var prior = view;
            Debug.developerConsoleVisible = false;
            await CaptureNative("ultimate-solo-01-ready.png");
            var timeScale = Time.timeScale;
            var receipt = await functionalSession.UltimateAsync(token);
            view = receipt.Coop;
            functionalHud.Refresh();
            var label = root.Q<Label>(cue);
            if (!receipt.HasCommittedUltimate || string.IsNullOrEmpty(receipt.ReceiptId) ||
                view.Version != prior.Version + 1 || label == null ||
                label.text != CampaignLocale.Text("battle.ultimate_skill", "Ultimate Skill") ||
                label.pickingMode != PickingMode.Ignore || Time.timeScale != timeScale)
                throw new InvalidOperationException("The committed Ultimate was not presented with the expected HUD and deadline behavior.");
            functionalHud.enabled = true;
            Debug.developerConsoleVisible = false;
            await CaptureNative("ultimate-solo-02-committed.png");
            functionalHud.enabled = false;

            // Open a fresh scoped connection after the effect lifetime. The
            // original transport may close after admitting the Ultimate.
            await Task.Delay(1550, token);
            var refreshed = await functionalSession.ReconnectAsync(token);
            var restored = refreshed.Coop;
            functionalHud.Refresh();
            if (refreshed.Version != receipt.Version || refreshed.Epoch != receipt.Epoch ||
                refreshed.HasCommittedUltimate || refreshed.ReceiptId != null || root.Q(cue) != null ||
                restored.ConfigDigest != view.ConfigDigest || restored.ContentHash != view.ContentHash ||
                restored.TurnDeadlineUnixMs != view.TurnDeadlineUnixMs || restored.BossState.Health != view.BossState.Health ||
                restored.Own.Rage != view.Own.Rage || restored.Own.Cooldowns[3] != view.Own.Cooldowns[3] ||
                !restored.Board.Select(tile => (tile?.Kind, tile?.Multiplier))
                    .SequenceEqual(view.Board.Select(tile => (tile?.Kind, tile?.Multiplier))))
                throw new InvalidOperationException("The refreshed native view must preserve the committed Ultimate state and deadline without a new cue.");
            Debug.developerConsoleVisible = false;
            await CaptureNative("ultimate-solo-03-readmitted.png");
            var evidence = new UltimateEvidence {
                matchId = matchId, configDigest = view.ConfigDigest, contentHash = view.ContentHash,
                pet = prior.Own.PetId, ability = prior.Abilities.Single(skill => skill.Kind == "ultimate").Id,
                receiptId = receipt.ReceiptId, hudLabel = label.text, guardTurns = guards,
                beforeVersion = checked((int)prior.Version), version = checked((int)view.Version),
                refreshedVersion = checked((int)restored.Version),
                rageBefore = prior.Own.Rage, rageAfter = view.Own.Rage,
                cooldownBefore = prior.Own.Cooldowns[3], cooldownAfter = view.Own.Cooldowns[3],
                bossHealthBefore = prior.BossState.Health, bossHealthAfter = view.BossState.Health,
                turnTimeoutMilliseconds = prior.TurnTimeoutMs ?? 0,
                committedDeadlineUnixMs = checked((long)(view.TurnDeadlineUnixMs ?? 0)),
                refreshedDeadlineUnixMs = checked((long)(restored.TurnDeadlineUnixMs ?? 0)),
                refreshSuppressed = true,
            };
            File.WriteAllText(Path.Combine(nativeCaptureDirectory, "ultimate-receipt.json"), JsonUtility.ToJson(evidence, true));
            nativeFacts.status = "ok";
            nativeFacts.matchId = matchId;
            nativeFacts.phase = view.Phase;
            nativeFacts.version = evidence.version;
            nativeFacts.ruleset = view.RulesetId;
            nativeFacts.participantCount = view.Participants.Count;
            nativeFacts.boardTiles = view.Board.Count;
        }
    }
}
