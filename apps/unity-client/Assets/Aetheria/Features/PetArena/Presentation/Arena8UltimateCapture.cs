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
            public int beforeVersion, version, guardTurns, rageBefore, rageAfter, cooldownBefore, cooldownAfter;
            public uint bossHealthBefore, bossHealthAfter;
            public int turnTimeoutMilliseconds;
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
            await CaptureNative("ultimate-solo-02-committed.png");

            // Read again after the effect lifetime. The committed view remains
            // renderable and the historical cut-in must stay suppressed.
            await Task.Delay(1550, token);
            var refreshed = await functionalSession.RefreshAsync(token);
            functionalHud.Refresh();
            if (refreshed.Version != receipt.Version || refreshed.HasCommittedUltimate || root.Q(cue) != null)
                throw new InvalidOperationException("A read-only refresh replayed the Ultimate cut-in.");
            var evidence = new UltimateEvidence {
                matchId = matchId, configDigest = view.ConfigDigest, contentHash = view.ContentHash,
                pet = prior.Own.PetId, ability = prior.Abilities.Single(skill => skill.Kind == "ultimate").Id,
                receiptId = receipt.ReceiptId, hudLabel = label.text, guardTurns = guards,
                beforeVersion = checked((int)prior.Version), version = checked((int)view.Version),
                rageBefore = prior.Own.Rage, rageAfter = view.Own.Rage,
                cooldownBefore = prior.Own.Cooldowns[3], cooldownAfter = view.Own.Cooldowns[3],
                bossHealthBefore = prior.BossState.Health, bossHealthAfter = view.BossState.Health,
                turnTimeoutMilliseconds = prior.TurnTimeoutMs ?? 0, refreshSuppressed = true,
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
