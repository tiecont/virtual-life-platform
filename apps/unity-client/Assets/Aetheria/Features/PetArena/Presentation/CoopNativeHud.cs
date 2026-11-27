using System;
using Aetheria.Networking;
using Aetheria.PetArena.Vfx;
using Aetheria.PetArena.Infrastructure;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Scene adapter for the cooperative HUD. A lobby supplies the admitted
    // CoopNativePlaySession; this component renders only committed projections
    // and forwards intents. It never computes damage, rewards or turn order.
    [RequireComponent(typeof(UIDocument))]
    public sealed class CoopNativeHud : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private CoopNativePlaySession session;
        private int selected = -1;
        private Action returnToHub;
        private float nextRefresh;
        private bool reading, renderedReconnect, renderedRecovery, loadingReward;
        private bool recovering, leaving, submitting;
        private Func<Task<string>> loadReward;
        private string reward, rewardNotice, feedback;
        private bool terminalExitOnly;
        private string exitLabel;
        private CoopNativeView previous;
        private ArenaAudioDirector battleAudio;
        public void SetRewardLoader(Func<Task<CoopLobbyClient.Reward>> loader) =>
            SetSettlementLoader(loader == null ? null : async () => (await loader()).Summary);

        public void SetSettlementLoader(Func<Task<string>> loader)
        {
            loadReward = loader;
            Refresh();
        }

        private ulong renderedVersion = ulong.MaxValue;

        // Scene bootstrap may create the component before assigning the document.
        public void Attach(UIDocument target) { document = target; }

        public void Bind(CoopNativePlaySession admitted, Action returnAction = null,
            string returnLabel = "Return to Central Plaza", bool requireSettlement = false)
        {
            reward = null; rewardNotice = null; loadReward = null;
            loadingReward = false;
            submitting = false;
            previous = null;
            feedback = null;
            recovering = false;
            leaving = false;
            if (admitted != null && Application.isPlaying)
            {
                if (battleAudio == null)
                {
                    var prefab = Resources.Load<GameObject>("ArenaPresentation");
                    if (prefab != null)
                        battleAudio = Instantiate(prefab, transform).GetComponent<ArenaAudioDirector>();
                }
                battleAudio?.StopAll();
            }
            else if (battleAudio != null) battleAudio.StopAll();
            session = admitted;
            returnToHub = returnAction;
            exitLabel = returnLabel;
            terminalExitOnly = requireSettlement;
            selected = -1;
            renderedVersion = ulong.MaxValue;
            Refresh();
        }

        private void OnDestroy()
        {
            if (battleAudio != null) Destroy(battleAudio.gameObject);
        }

        private void Update()
        {
            var view = session?.State?.Coop;
            if (view == null || recovering || leaving || submitting) return;
            if (!view.Terminal && session.NeedsRefresh && !session.HasPendingCommand && !reading)
            {
                _ = RecoverAsync(renewal: true);
                return;
            }
            if (view.Version != renderedVersion || session.RequiresReconnect != renderedReconnect) Refresh();
            if (view.Terminal || reading || !CanSubmit ||
                view.ActiveSeat == view.You || Time.unscaledTime < nextRefresh) return;
            nextRefresh = Time.unscaledTime + 1f;
            _ = ReadSharedBoardAsync();
        }

        private async System.Threading.Tasks.Task ReadSharedBoardAsync()
        {
            reading = true;
            try { await session.RefreshAsync(); }
            catch (NativeFailure failure) when (failure.Reason == Failure.Busy) { }
            catch (NativeFailure)
            {
                Refresh();
            }
            catch (OperationCanceledException) { }
            finally { reading = false; }
        }

        internal void Refresh()
        {
            var view = session?.State?.Coop;
            if (view == null) return;
            if (previous != null && view.Version > previous.Version)
            {
                selected = -1;
                feedback = null;
                if (view.Terminal)
                {
                    feedback = view.Phase == "won" ? "Victory" : "Defeat";
                    battleAudio?.SetCombatScore(ArenaCombatScore.None);
                    battleAudio?.Play(view.Phase == "won" ? ArenaAudioCue.Victory : ArenaAudioCue.Defeat);
                }
                else if (view.BossState.Phase > previous.BossState.Phase)
                {
                    feedback = "The Boss transformed";
                    battleAudio?.Play(ArenaAudioCue.BossWarning);
                }
                else
                {
                    for (var seat = 0; seat < view.Participants.Count; seat++)
                    {
                        var now = view.Participants[seat];
                        var prior = previous.Participants[seat];
                        var healed = now.Contribution.Healing - Math.Min(now.Contribution.Healing, prior.Contribution.Healing);
                        var shielded = now.Contribution.Shielding - Math.Min(now.Contribution.Shielding, prior.Contribution.Shielding);
                        if (healed > 0) feedback = now.PetId + " restored " + healed + " HP";
                        else if (shielded > 0) feedback = now.PetId + " granted " + shielded + " shield";
                    }
                    if (BoardChanged(previous, view)) battleAudio?.Play(ArenaAudioCue.TileMatch);
                    if (!PlayBossAudio(previous, view))
                    {
                        if (feedback != null) battleAudio?.Play(ArenaAudioCue.UiConfirm);
                        else if (view.BossState.Health < previous.BossState.Health) battleAudio?.Play(ArenaAudioCue.Attack);
                    }
                }
            }
            if (previous == null && !view.Terminal && battleAudio != null)
            {
                var regular = view.BossId?.EndsWith("-regular", StringComparison.Ordinal) == true;
                battleAudio.SetCombatScore(regular ? ArenaCombatScore.Regular : ArenaCombatScore.Boss);
                if (view.BossId?.StartsWith("cinder-terraces-", StringComparison.Ordinal) == true)
                    battleAudio.SetAmbience(ArenaAmbience.Fire);
                else if (view.BossId?.StartsWith("tideglass-lagoon-", StringComparison.Ordinal) == true)
                    battleAudio.SetAmbience(ArenaAmbience.Water);
            }
            previous = view;
            renderedReconnect = session.RequiresReconnect;
            renderedRecovery = recovering;
            renderedVersion = view.Version;
            Render(view);
        }

        private bool PlayBossAudio(CoopNativeView before, CoopNativeView after)
        {
            // The projection has no event stream. Use observable deltas for
            // a single committed step, including attacks without a telegraph.
            if (battleAudio == null || after.Version != before.Version + 1) return false;
            var impact = false;
            for (var seat = 0; seat < after.Participants.Count; seat++)
            {
                var prior = before.Participants[seat];
                var current = after.Participants[seat];
                // An expired shield alone does not establish an impact.
                if (current.Health < prior.Health || (current.ShieldTurns > 0 && current.Shield < prior.Shield))
                {
                    impact = true;
                    break;
                }
            }
            if (impact) battleAudio.Play(ArenaAudioCue.Impact);

            var priorAttack = before.PendingAttack;
            var nextAttack = after.PendingAttack;
            // An attack can resolve and a fresh warning appear in the same step.
            var warning = nextAttack != null &&
                (priorAttack == null || (priorAttack.Remaining == 1 && after.Round > before.Round));
            if (warning) battleAudio.Play(ArenaAudioCue.BossWarning);
            return impact || warning;
        }

        private static bool BoardChanged(CoopNativeView before, CoopNativeView after)
        {
            for (int index = 0; index < after.Board.Count; index++)
            {
                var oldTile = before.Board[index];
                var newTile = after.Board[index];
                if (oldTile?.Identity != newTile?.Identity || oldTile?.Multiplier != newTile?.Multiplier)
                    return true;
            }
            return false;
        }

        public void Render(CoopNativeView view)
        {
            if (view == null) return;
            var target = document != null ? document.rootVisualElement : null;
            if (target == null) return;
            var body = target.Q<ScrollView>("coop-hud-scroll");
            if (body == null)
            {
                target.Clear();
                body = new ScrollView { name = "coop-hud-scroll" };
                body.AddToClassList("coop-hud-scroll");
                body.contentViewport.RegisterCallback<GeometryChangedEvent>(change =>
                    BattleScreenLayout.Size(body, change.newRect.size));
                target.Add(body);
            }
            else
            {
                body.Clear();
                for (var index = target.childCount - 1; index >= 0; index--)
                    if (target[index] != body) target.RemoveAt(index);
            }

            var presentation = CoopNativePresentation.Build(view, Select, Cast, selected,
                inputAvailable: session == null || CanSubmit);
            var turn = presentation.Q<Label>(CoopNativePresentation.TurnName);
            turn.AddToClassList("battle-turn");
            target.Insert(0, turn);
            body.Add(presentation);
            BattleScreenLayout.Size(body, body.contentViewport.contentRect.size);
            if (submitting) target.Add(new Label("Sending action…") { name = "coop-network" });
            else if (!string.IsNullOrEmpty(feedback)) target.Add(new Label(feedback) { name = "coop-feedback" });
            if (view.Terminal && loadReward != null)
            {
                if (reward != null)
                    target.Add(new Label("Rewards received · " + reward) { name = "coop-reward" });
                else if (rewardNotice == null && !loadingReward) _ = ReadRewardAsync();
                else if (rewardNotice != null)
                    target.Add(new Button(() => _ = ReadRewardAsync()) { text = rewardNotice });
            }
            if (session != null && view.Phase == "ready" && view.ActiveSeat == view.You)
            {
                var start = new Button(() => Cast("start")) { name = "coop-battle-start", text = "Start battle" };
                start.SetEnabled(CanSubmit);
                start.AddToClassList("battle-primary-action");
                target.Add(start);
            }
            if (returnToHub != null || session != null) target.Add(BuildFooter(view));
        }

        private bool CanSubmit => session != null && !recovering && !leaving && !submitting &&
            !session.RequiresReconnect && !session.HasPendingCommand;

        private VisualElement BuildFooter(CoopNativeView view)
        {
            var footer = new VisualElement { name = "coop-footer" };
            footer.AddToClassList("coop-footer");
            var leave = new Button(Leave) { name = "coop-return", text = exitLabel };
            leave.AddToClassList("coop-footer-button");
            leave.SetEnabled(!recovering && !leaving && (!terminalExitOnly || reward != null));
            if (returnToHub == null || terminalExitOnly && !view.Terminal)
                leave.AddToClassList("coop-footer-hidden");
            footer.Add(leave);

            var retry = session?.HasPendingCommand == true;
            var needsRecovery = !submitting && (retry || session?.RequiresReconnect == true);
            var recover = new Button(() => _ = RecoverAsync())
            {
                name = retry ? "coop-retry" : "coop-reconnect",
                text = retry ? "Retry pending command" : "Reconnect",
            };
            recover.AddToClassList("coop-footer-button");
            recover.SetEnabled(needsRecovery && !recovering && !leaving);
            if (!needsRecovery && !recovering) recover.AddToClassList("coop-footer-hidden");
            footer.Add(recover);
            return footer;
        }

        private void Leave()
        {
            var exit = returnToHub;
            if (exit == null || recovering || leaving) return;
            leaving = true;
            Refresh();
            exit();
        }

        private async Task ReadRewardAsync()
        {
            if (loadingReward || loadReward == null) return;
            loadingReward = true;
            var loader = loadReward;
            try
            {
                var receipt = await loader();
                if (loadReward == loader) reward = receipt;
            }
            catch (Exception)
            {
                if (loadReward == loader) rewardNotice = "Check settlement receipt";
            }
            finally
            {
                if (this != null && loadReward == loader)
                {
                    loadingReward = false;
                    Refresh();
                }
            }
        }

        private async Task RecoverAsync(bool renewal = false)
        {
            var current = session;
            var retry = current?.HasPendingCommand == true;
            if (current == null || recovering || leaving || (!retry && !current.RequiresReconnect)) return;
            recovering = true;
            if (!renewal)
            {
                selected = -1;
                Refresh();
            }

            try
            {
                if (retry) await current.RetryAsync();
                else await current.ReconnectAsync();
            }
            catch (NativeFailure failure)
            {
                Debug.LogWarning("Coop recovery failed: " + failure.Reason);
            }
            catch (OperationCanceledException) { }
            finally
            {
                if (this != null && session == current)
                {
                    recovering = false;
                    // A render during renewal can disable controls even if the
                    // replacement socket resumes the same committed version.
                    if (!renewal || renderedRecovery || current.RequiresReconnect || current.State?.Coop?.Version != renderedVersion)
                        Refresh();
                }
            }
        }

        private void Select(int cell)
        {
            if (!CanSubmit) return;
            var view = session?.State?.Coop;
            if (view == null || view.Terminal || !CoopNativePresenter.CanAct(view)) return;
            if (selected < 0)
            {
                selected = cell;
                Render(view);
                return;
            }
            if (selected == cell) { selected = -1; Render(view); return; }
            if (!view.CanSwap(selected, cell))
            {
                selected = cell;
                Render(view);
                return;
            }
            var first = selected;
            selected = -1;
            Submit(current => current.SwapAsync(first, cell));
        }

        private void Cast(string kind)
        {
            switch (kind)
            {
                case "start": Submit(current => current.StartAsync()); break;
                case "guard": Submit(current => current.GuardAsync()); break;
                case "skill": Submit(current => current.SkillAsync()); break;
                case "signature": Submit(current => current.SignatureAsync()); break;
                case "fire-zone": Submit(current => current.FireZoneAsync()); break;
                case "ultimate": Submit(current => current.UltimateAsync()); break;
            }
        }

        private async void Submit(Func<CoopNativePlaySession, Task<PlayState>> send)
        {
            if (!CanSubmit) return;
            var current = session;
            submitting = true;
            Refresh();
            try { await send(current); }
            catch (NativeFailure failure)
            {
                if (session == current)
                    feedback = current.HasPendingCommand ? "Confirmation interrupted. Retry the pending command." :
                        "Action was not committed · " + failure.Reason;
            }
            catch (OperationCanceledException) { }
            finally
            {
                if (this != null && session == current)
                {
                    submitting = false;
                    Refresh();
                }
            }
        }
    }
}
