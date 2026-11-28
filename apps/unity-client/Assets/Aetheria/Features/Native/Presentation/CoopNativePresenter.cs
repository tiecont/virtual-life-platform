using System;
using System.Collections.Generic;
using System.Globalization;

namespace Aetheria.Networking
{
    // Presentation-only formatting over a validated cooperative projection. It
    // never derives damage, rewards, costs or turn order; those come from the
    // committed view and the reducer's receipts.
    public static class CoopNativePresenter
    {
        private static readonly string[] ActionOrder = { "guard", "skill", "signature", "ultimate" };
        private static readonly int[] ActionSlots = { 0, 1, 2, 3 };

        public static string BossLabel(CoopNativeView view)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            var boss = view.BossState;
            return (view.BossId == null ? "Boss " : view.BossId + " · ") + boss.Health.ToString(CultureInfo.InvariantCulture) + "/" +
                boss.MaxHealth.ToString(CultureInfo.InvariantCulture) + " · phase " +
                boss.Phase.ToString(CultureInfo.InvariantCulture) +
                (boss.Shield > 0 ? " · shield " + boss.Shield.ToString(CultureInfo.InvariantCulture) : "");
        }

        public static string SeatLabel(CoopNativeView view, int seat)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (seat < 0 || seat >= view.Participants.Count) throw new ArgumentOutOfRangeException(nameof(seat));
            var participant = view.Participants[seat];
            return (seat == view.You ? "You · " : "") + participant.PetId + " · " +
                participant.Health.ToString(CultureInfo.InvariantCulture) + "/" +
                participant.MaxHealth.ToString(CultureInfo.InvariantCulture) +
                (participant.Alive ? "" : " · down");
        }

        public static string TurnLabel(CoopNativeView view, double? remainingTurnMilliseconds = null)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            var remaining = remainingTurnMilliseconds ?? (double?)view.TurnRemainingMs;
            var countdown = remaining.HasValue ? " · " + (remaining.Value > 0
                ? Math.Ceiling(remaining.Value / 1000).ToString("0", CultureInfo.InvariantCulture) + " s"
                : "Awaiting next turn") : "";
            return "Round " + view.Round.ToString(CultureInfo.InvariantCulture) + " · turn " +
                view.Turn.ToString(CultureInfo.InvariantCulture) + " · seat " +
                view.ActiveSeat.ToString(CultureInfo.InvariantCulture) + countdown +
                (view.Terminal ? " · " + view.Phase : "");
        }

        public static bool CanAct(CoopNativeView view) =>
            view != null && view.Phase == "playing" && view.ActiveSeat == view.You && view.Own.Alive &&
                view.TurnRemainingMs != 0;

        public static IReadOnlyList<string> AvailableActions(CoopNativeView view)
        {
            if (!CanAct(view)) return Array.Empty<string>();
            var actions = new List<string>();
            if (view.Abilities.Count > 0)
            {
                foreach (var ability in view.Abilities)
                    if (ability.Ready && (ability.Kind != CoopNativeView.Ultimate || view.Own.HasUltimate))
                        actions.Add(ability.Kind);
                return actions;
            }
            for (var index = 0; index < ActionOrder.Length; index += 1)
                if (view.Cooldown(ActionSlots[index]) == 0 && (ActionOrder[index] != CoopNativeView.Ultimate || view.Own.HasUltimate))
                    actions.Add(ActionOrder[index]);
            return actions;
        }
    }
}
