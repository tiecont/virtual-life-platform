using System;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.Native.Public.V1;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;

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

        private Task AllocateMatch(string map, string encounter) =>
            nativeMode ? AllocateNative(map, encounter) : Allocate(map, encounter);

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
                matchId = admission.MatchIdText;
                selectedCell = -1;
                settlementText = "";
                notice = "";
                view = null;
                renderedReceipts.Clear();
            }
            catch
            {
                session.Dispose();
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
            var session = nativeSession;
            nativeSession = null;
            nativeView = null;
            if (session != null) session.Dispose();
        }

        private void DrawNativeCombat()
        {
            var current = nativeView;
            content.Add(Label("Native match " + matchId + " · v" + current.Version + " · " + current.Phase, "arena-meta"));
            content.Add(Label("Pet " + current.PetName + " · " + current.PetElement + " Lv" + current.PetLevel +
                " · opponent " + current.EncounterId + (current.EncounterBoss ? " (boss)" : ""), "arena-meta"));
            content.Add(Label("HP " + current.Health + " / enemy " + current.EnemyHealth +
                " · shield " + current.EnemyShield, "arena-title"));
            content.Add(Label("Mana " + current.Mana + "/" + Arena8NativeView.ManaCap +
                " · Rage " + current.Rage + "/" + Arena8NativeView.RageCap +
                " · Cooldown " + current.Cooldown + " · FireZone " + current.FireZoneTurns +
                " · Turn " + current.Turn + "/" + Arena8NativeView.MaxTurn));
            if (current.TelegraphKind != null)
                content.Add(Label("Telegraph: " + current.TelegraphKind + " " + current.TelegraphAxis + " " +
                    current.TelegraphTarget + " resolves turn " + current.TelegraphResolvesTurn + " · cells " +
                    string.Join(",", current.TelegraphCells), "arena-notice"));
            content.Add(Arena8NativePresentation.BuildBoard(current, selectedCell, SelectNativeCell));
            content.Add(Label(selectedCell < 0 ? "Select a tile, then an adjacent tile to swap."
                : "Selected " + selectedCell + ". Choose an adjacent tile."));
            if (current.Phase == "ready")
                Button("Start match", () => Run(() => Native((session, token) => session.StartAsync(token)),
                    "Starting match"), "start-match");
            else
                content.Add(Arena8NativePresentation.BuildSkills(current, CastNativeSkill));
            if (nativeSession != null && nativeSession.HasPendingCommand)
                Button("Retry pending command (same ID)", () => Run(RetryNative, "Retrying pending command"));
            if (nativeSession != null && nativeSession.NeedsRefresh)
                Button("Reconnect + resync", () => Run(ReconnectNative, "Reconnecting to the native match"));
        }

        private void DrawNativeTerminal()
        {
            content.Add(Label(nativeView.Phase == "won" ? "Victory" : "Defeat", "arena-title"));
            content.Add(Label("Committed native terminal receipt · match " + matchId +
                " · v" + nativeView.Version, "arena-meta"));
            content.Add(Label("Rewards and settlement are server-authored; this client never calculates an outcome."));
            Button("Return to roster / next match", () => Run(LoadLobby, "Loading roster"));
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
