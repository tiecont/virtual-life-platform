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
            return "Boss " + boss.Health.ToString(CultureInfo.InvariantCulture) + "/" +
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

        public static string TurnLabel(CoopNativeView view)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            return "Round " + view.Round.ToString(CultureInfo.InvariantCulture) + " · turn " +
                view.Turn.ToString(CultureInfo.InvariantCulture) + " · seat " +
                view.ActiveSeat.ToString(CultureInfo.InvariantCulture) +
                (view.Terminal ? " · " + view.Phase : "");
        }

        public static bool CanAct(CoopNativeView view) =>
            view != null && !view.Terminal && view.Phase == "playing" && view.ActiveSeat == view.You && view.Own.Alive;

        // Fire Zone is only offered when a future projection states the capability;
        // the current contract has no capability field, so the UI does not invent one.
        public static IReadOnlyList<string> AvailableActions(CoopNativeView view)
        {
            if (!CanAct(view)) return Array.Empty<string>();
            var actions = new List<string>();
            for (var index = 0; index < ActionOrder.Length; index += 1)
                if (view.Cooldown(ActionSlots[index]) == 0) actions.Add(ActionOrder[index]);
            return actions;
        }
    }
}
