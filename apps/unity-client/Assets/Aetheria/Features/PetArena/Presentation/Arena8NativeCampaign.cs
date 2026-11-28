using System;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.Native.Public.V1;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Native `arena8-pve` transport for the campaign screen. The allocation route
    // is the only source of the WSS scope and the match id; every command then
    // travels through Arena8NativePlaySession over the native connection. The
    // frozen HTTP bridge remains available only when explicitly requested.
    public sealed partial class Arena8CampaignScreen
    {
        public const string NativeOriginVariable = "AETHERIA_ARENA8_NATIVE";
        public const string HttpBridgeVariable = "AETHERIA_ARENA8_HTTP_BRIDGE";
        private Arena8NativePlaySession nativeSession;
        private Arena8NativeView nativeView;
        private string nativeSettlementRequest;
        private Arena8NativeTrust nativeTrust;
        private bool nativeMode, nativeUnavailable;

        // Selection is explicit: AETHERIA_ARENA8_NATIVE selects native transport,
        // the compatibility bridge needs AETHERIA_ARENA8_HTTP_BRIDGE=1, and an
        // unconfigured player reports the missing scope instead of falling back.
        private void ConfigureTransport()
        {
            if (string.Equals(Environment.GetEnvironmentVariable(HttpBridgeVariable), "1", StringComparison.Ordinal))
            {
                nativeMode = false;
                return;
            }
            var origin = Environment.GetEnvironmentVariable(NativeOriginVariable);
            if (string.IsNullOrWhiteSpace(origin))
            {
                nativeUnavailable = true;
                return;
            }
            nativeMode = true;
        }

        private string TransportOrigin(string bridgeOrigin)
        {
            var origin = Environment.GetEnvironmentVariable(NativeOriginVariable);
            return nativeMode && !string.IsNullOrWhiteSpace(origin) ? origin.Trim() : bridgeOrigin;
        }

        private string UnconfiguredTransportNotice() =>
            "Arena8 native transport is not configured. Set " + NativeOriginVariable +
            " to the HTTPS platform origin, or opt in to the frozen HTTP compatibility bridge with " +
            HttpBridgeVariable + "=1.";

        private Task AllocateMatch(string map, string encounter)
        {
            if (!nativeMode) return Allocate(map, encounter);
            return UsesFunctionalBoard ? AllocateFunctional(map, encounter) : AllocateNative(map, encounter);
        }

        private async Task AllocateNative(string map, string encounter)
        {
            if (api == null) throw new InvalidOperationException("The native allocation transport is unavailable.");
            if (state == null || state.FindPet(selectedPet) == null)
                throw new InvalidOperationException("Choose an owned Pet first.");
            DisposeNative();
            var request = new Arena8AllocateRequest
            {
                requestId = NewRequestId(), petId = selectedPet, mapId = map, encounterId = encounter,
            };
            var admission = await Arena8NativeAdmission.OpenAsync(
                token => api.AllocateArena8Native(request, token), lifetime.Token);
            nativeTrust ??= Arena8NativeTrust.FromEnvironment(admission.HttpsOrigin);
            var platform = new PlatformSession(admission.HttpsOrigin);
            NativeConnection connection;
            try
            {
                connection = new NativeConnection(admission.WssOrigin, admission.HttpsOrigin,
                    admission.ContentHash, admission.BootId, admission.TicketAsync);
            }
            catch
            {
                platform.Dispose();
                throw;
            }
            var session = new Arena8NativePlaySession(platform, connection, admission.MatchId);
            try
            {
                var admitted = await session.ConnectAsync(lifetime.Token);
                nativeSession = session;
                nativeView = admitted.Arena8;
                stage?.PresentFixedNativeBattle(map, nativeView.PetId, nativeView.EncounterId);
                matchId = admission.MatchIdText;
                selectedCell = -1;
                nativeSettlementRequest = NewRequestId();
                settlementText = "";
                notice = "";
                view = null;
                renderedReceipts.Clear();
            }
            catch
            {
                if (nativeSession == session) DisposeNative();
                else session.Dispose();
                throw;
            }
        }

        private async Task Native(Func<Arena8NativePlaySession, CancellationToken, Task<PlayState>> command)
        {
            var session = nativeSession;
            if (session == null) throw new InvalidOperationException("No native Arena8 match is admitted.");
            PlayState result;
            try
            {
                result = await command(session, lifetime.Token);
            }
            catch (NativeFailure failure)
            {
                throw new InvalidOperationException("Native " + failure.Reason +
                    (failure.Code == ErrorCode.ErrorUnspecified ? "" : " / " + failure.Code), failure);
            }
            if (session != nativeSession) return;
            nativeView = result.Arena8;
            selectedCell = -1;
        }

        private async Task RetryNative()
        {
            var session = nativeSession;
            if (session == null) throw new InvalidOperationException("No native Arena8 match is admitted.");
            PlayState result;
            try { result = await session.RetryAsync(lifetime.Token); }
            catch (NativeFailure failure)
            {
                throw new InvalidOperationException("Native " + failure.Reason +
                    (failure.Code == ErrorCode.ErrorUnspecified ? "" : " / " + failure.Code), failure);
            }
            if (session != nativeSession) return;
            nativeView = result.Arena8;
            selectedCell = -1;
        }

        private async Task ReconnectNative()
        {
            var session = nativeSession;
            if (session == null) throw new InvalidOperationException("No native Arena8 match is admitted.");
            PlayState result;
            try { result = await session.ReconnectAsync(lifetime.Token); }
            catch (NativeFailure failure)
            {
                throw new InvalidOperationException("Native " + failure.Reason +
                    (failure.Code == ErrorCode.ErrorUnspecified ? "" : " / " + failure.Code), failure);
            }
            if (session != nativeSession) return;
            nativeView = result.Arena8;
            selectedCell = -1;
        }

        private void DisposeNative()
        {
            DisposeFunctional();
            stage?.ClearNativeBattlePreview();
            var session = nativeSession;
            nativeSession = null;
            nativeView = null;
            if (session != null) session.Dispose();
            nativeTrust?.Dispose();
            nativeTrust = null;
        }

        private void DrawNativeCombat()
        {
            var current = nativeView;
            var turn = Label("Turn " + current.Turn + "/" + Arena8NativeView.MaxTurn +
                " · " + (current.Phase == "ready" ? "Ready" : "Your turn"), "battle-turn");
            root.Add(turn);
            var stageView = BattleScreenLayout.Stage();
            var battleScroll = new ScrollView { name = "arena8-battle-scroll" };
            battleScroll.AddToClassList("coop-hud-scroll");
            battleScroll.contentViewport.RegisterCallback<GeometryChangedEvent>(change =>
                BattleScreenLayout.Size(battleScroll, change.newRect.size));
            content = battleScroll;
            root.Add(content);
            content.Add(stageView);

            var player = BattleScreenLayout.Side("arena8-player", "battle-player-side");
            var pet = new VisualElement();
            pet.AddToClassList("battle-combatant");
            WaveD4BattlePreview.AddIdentity(pet,
                Label(current.PetName + " · Lv " + current.PetLevel + " · " + current.PetElement), current.PetId);
            pet.Add(Label("HP " + current.Health + "/" + current.EffectiveHealth));
            pet.Add(Label("Mana " + current.Mana + "/" + Arena8NativeView.ManaCap +
                " · Rage " + current.Rage + "/" + Arena8NativeView.RageCap));
            if (current.FireZoneTurns > 0) pet.Add(Label("Fire Zone · " + current.FireZoneTurns + " turns"));
            player.Add(pet);
            stageView.Add(player);

            var opponents = BattleScreenLayout.Side("arena8-opponents", "battle-enemy-side");
            var enemy = new VisualElement();
            enemy.AddToClassList("battle-combatant");
            WaveD4BattlePreview.AddIdentity(enemy,
                Label(current.EncounterId.Replace('-', ' ') + (current.EncounterBoss ? " · Boss" : "")),
                current.EncounterId, opponent: true);
            enemy.Add(Label("HP " + current.EnemyHealth + " · Shield " + current.EnemyShield));
            if (current.TelegraphKind != null)
                enemy.Add(Label(current.TelegraphKind + " · " + current.TelegraphAxis + " " +
                    (current.TelegraphTarget + 1) + " · resolves on turn " + current.TelegraphResolvesTurn));
            opponents.Add(enemy);
            stageView.Add(opponents);

            var board = Arena8NativePresentation.BuildBoard(current, selectedCell, SelectNativeCell);
            var center = BattleScreenLayout.Center(board);
            board.SetEnabled(!busy);
            stageView.Insert(0, center);
            if (current.Phase == "ready")
            {
                var start = new Button(() => Run(() => Native((session, token) => session.StartAsync(token)),
                    "Starting match")) { text = "Start match" };
                start.AddToClassList("battle-primary-action");
                start.AddToClassList("start-match");
                start.SetEnabled(!busy);
                center.Add(start);
            }
            else
            {
                var skills = Arena8NativePresentation.BuildSkills(current, CastNativeSkill);
                skills.SetEnabled(!busy);
                center.Add(skills);
            }
            if (!string.IsNullOrEmpty(notice)) center.Add(Label(notice, "battle-turn"));
            if (nativeSession != null && nativeSession.HasPendingCommand)
                Button("Retry pending command (same ID)", () => Run(RetryNative, "Retrying pending command"), enabled: !busy);
            if (nativeSession != null && nativeSession.NeedsRefresh)
                Button("Reconnect + resync", () => Run(ReconnectNative, "Reconnecting to the native match"), enabled: !busy);
        }

        private void DrawNativeTerminal()
        {
            content.Add(Label(nativeView.Phase == "won" ? "Victory" : "Defeat", "arena-title"));
            content.Add(Label("Committed native terminal receipt · match " + matchId +
                " · v" + nativeView.Version, "arena-meta"));
            if (string.IsNullOrEmpty(settlementText))
                Button("Collect battle results", () => Run(async () => { await SettleNativeBattle(); }, "Collecting battle results"));
            else
                content.Add(Label(settlementText, "arena-notice"));
            Button("Return to roster / next match", () => Run(async () =>
            {
                if (string.IsNullOrEmpty(settlementText)) await SettleNativeBattle();
                await LoadLobby();
            }, "Returning to roster"));
        }

        private async Task<Arena8Settlement> SettleNativeBattle()
        {
            var receipt = await api.SettleArena8Native(matchId, new Arena8SettleRequest
            {
                requestId = nativeSettlementRequest,
            }, lifetime.Token);
            settlementText = receipt.coins + " coins · " + receipt.exp + " Pet EXP · " + receipt.materials + " materials" +
                (string.IsNullOrEmpty(receipt.recruitedPetId) ? "" : " · recruited " + receipt.recruitedPetId) +
                (string.IsNullOrEmpty(receipt.artifactId) ? "" : " · Artifact " + receipt.artifactId);
            return receipt;
        }

        private void SelectNativeCell(int cell)
        {
            if (nativeView == null || nativeView.Terminal || busy) return;
            if (selectedCell < 0)
            {
                selectedCell = cell;
                Draw();
                return;
            }
            if (!Arena8NativeView.Adjacent(selectedCell, cell))
            {
                notice = "Choose an adjacent tile.";
                selectedCell = cell;
                Draw();
                return;
            }
            if (!nativeView.CanSwap(selectedCell, cell))
            {
                notice = "That swap does not match three tiles.";
                selectedCell = -1;
                Draw();
                return;
            }
            var first = selectedCell;
            selectedCell = -1;
            Run(() => Native((session, token) => session.SwapAsync(first, cell, token)), "Swapping tiles");
        }

        private void CastNativeSkill(string id)
        {
            if (nativeView == null) return;
            switch (id)
            {
                case Arena8NativeView.SharedSkill:
                    Run(() => Native((session, token) => session.SkillAsync(token)), "Casting shared skill");
                    break;
                case Arena8NativeView.Signature:
                    Run(() => Native((session, token) => session.SignatureAsync(token)), "Casting signature");
                    break;
                case Arena8NativeView.FireZone:
                    Run(() => Native((session, token) => session.FireZoneAsync(token)), "Casting fire zone");
                    break;
                case Arena8NativeView.Ultimate:
                    Run(() => Native((session, token) => session.UltimateAsync(token)), "Casting ultimate");
                    break;
                case Arena8NativeView.Guard:
                    Run(() => Native((session, token) => session.GuardAsync(token)), "Guarding");
                    break;
                default:
                    notice = "Unsupported native skill " + id;
                    Draw();
                    break;
            }
        }
    }
}
