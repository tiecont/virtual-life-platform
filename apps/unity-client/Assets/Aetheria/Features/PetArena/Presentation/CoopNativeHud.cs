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
        private bool reading, renderedReconnect, loadingReward;
        private bool recovering, leaving;
        private Func<Task<CoopLobbyClient.Reward>> loadReward;
        private CoopLobbyClient.Reward reward;
        private string rewardNotice, feedback;
        private CoopNativeView previous;
        private ArenaPresentationKit effects;
        public void SetRewardLoader(Func<Task<CoopLobbyClient.Reward>> loader) { loadReward = loader; Refresh(); }

        private ulong renderedVersion = ulong.MaxValue;

        // Scene bootstrap may create the component before assigning the document.
        public void Attach(UIDocument target) { document = target; }

        public void Bind(CoopNativePlaySession admitted, Action returnAction = null)
        {
            reward = null; rewardNotice = null; loadReward = null;
            previous = null;
            feedback = null;
            recovering = false;
            leaving = false;
            if (admitted != null && Application.isPlaying)
            {
                effects = ArenaPresentationKit.Ensure(gameObject);
                effects.SetReducedMotion(true);
                effects.PlayBgm(ArenaBgm.Battle);
            }
            else if (effects != null) effects.StopAll();
            session = admitted;
            returnToHub = returnAction;
            selected = -1;
            renderedVersion = ulong.MaxValue;
            Refresh();
        }

        private void Update()
        {
            var view = session?.State?.Coop;
            if (view == null) return;
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

        private void Refresh()
        {
            var view = session?.State?.Coop;
            if (view == null) return;
            if (previous != null && view.Version > previous.Version)
            {
                feedback = null;
                if (view.Terminal)
                {
                    feedback = view.Phase == "won" ? "Victory" : "Defeat";
                    effects?.PlaySfx(view.Phase == "won" ? ArenaSfx.Victory : ArenaSfx.Defeat);
                }
                else if (view.BossState.Phase > previous.BossState.Phase)
                {
                    feedback = "The Boss transformed";
                    effects?.PlaySfx(ArenaSfx.Ultimate);
                }
                else
                {
                    for (var seat = 0; seat < view.Participants.Count; seat++)
                    {
                        var now = view.Participants[seat];
                        var prior = previous.Participants[seat];
                        var healed = now.Contribution.Healing - prior.Contribution.Healing;
                        var shielded = now.Contribution.Shielding - prior.Contribution.Shielding;
                        if (healed > 0) feedback = now.PetId + " restored " + healed + " HP";
                        else if (shielded > 0) feedback = now.PetId + " granted " + shielded + " shield";
                    }
                    if (feedback != null) effects?.PlaySfx(ArenaSfx.Skill);
                    else if (view.BossState.Health < previous.BossState.Health) effects?.PlaySfx(ArenaSfx.Attack);
                }
            }
            previous = view;
            renderedReconnect = session.RequiresReconnect;
            renderedVersion = view.Version;
            Render(view);
        }

        public void Render(CoopNativeView view)
        {
            if (view == null) return;
            var target = document != null ? document.rootVisualElement : null;
            if (target == null) return;
            target.Clear();
            var presentation = CoopNativePresentation.Build(view, Select, Cast, selected);
            if (session != null && !CanSubmit)
            {
                presentation.Q("coop-board").SetEnabled(false);
                presentation.Q("coop-actions").SetEnabled(false);
            }
            target.Add(presentation);
            if (!string.IsNullOrEmpty(feedback)) target.Add(new Label(feedback) { name = "coop-feedback" });
            if (view.Terminal && loadReward != null)
            {
                if (reward != null)
                    target.Add(new Label("Rewards received · " + reward.Summary));
                else if (rewardNotice == null && !loadingReward) _ = ReadRewardAsync();
                else if (rewardNotice != null)
                    target.Add(new Button(() => _ = ReadRewardAsync()) { text = rewardNotice });
            }
            if (session != null && view.Phase == "ready" && view.ActiveSeat == view.You)
            {
                var start = new Button(() => Cast("start")) { name = "coop-battle-start", text = "Start battle" };
                start.SetEnabled(CanSubmit);
                target.Add(start);
            }
            if (returnToHub != null || session != null) target.Add(BuildFooter());
        }

        private bool CanSubmit => session != null && !recovering && !leaving &&
            !session.RequiresReconnect && !session.HasPendingCommand;

        private VisualElement BuildFooter()
        {
            var footer = new VisualElement { name = "coop-footer" };
            footer.AddToClassList("coop-footer");
            var leave = new Button(Leave) { name = "coop-return", text = "Return to Central Plaza" };
            leave.AddToClassList("coop-footer-button");
            leave.SetEnabled(!recovering && !leaving);
            if (returnToHub == null) leave.AddToClassList("coop-footer-hidden");
            footer.Add(leave);

            var retry = session?.HasPendingCommand == true;
            var needsRecovery = retry || session?.RequiresReconnect == true;
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
            try { reward = await loadReward(); }
            catch (Exception) { rewardNotice = "Check settlement receipt"; }
            finally { loadingReward = false; if (this != null) Refresh(); }
        }

        private async Task RecoverAsync()
        {
            var current = session;
            var retry = current?.HasPendingCommand == true;
            if (current == null || recovering || leaving || (!retry && !current.RequiresReconnect)) return;
            recovering = true;
            selected = -1;
            Refresh();

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
            _ = SwapAsync(first, cell);
        }

        private async System.Threading.Tasks.Task SwapAsync(int first, int second)
        {
            try { if (session != null) await session.SwapAsync(first, second); }
            catch (NativeFailure failure) { Debug.LogWarning("Coop swap rejected: " + failure.Reason); }
            finally { Refresh(); }
        }

        private async void Cast(string kind)
        {
            if (!CanSubmit) return;
            var current = session;
            try
            {
                switch (kind)
                {
                    case "start": await current.StartAsync(); break;
                    case "guard": await current.GuardAsync(); break;
                    case "skill": await current.SkillAsync(); break;
                    case "signature": await current.SignatureAsync(); break;
                    case "fire-zone": await current.FireZoneAsync(); break;
                    case "ultimate": await current.UltimateAsync(); break;
                }
            }
            catch (NativeFailure failure) { Debug.LogWarning("Coop action rejected: " + failure.Reason); }
            finally { Refresh(); }
        }
    }
}
