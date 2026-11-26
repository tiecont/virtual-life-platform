using System;
using System.Linq;
using Aetheria.Networking;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // UI Toolkit presentation over the committed cooperative projection. Every
    // label, enabled action and tile comes from CoopNativeView; this layer never
    // computes damage, rewards, costs or turn order.
    public static class CoopNativePresentation
    {
        public const string TurnName = "coop-turn";
        public const string BossName = "coop-boss";
        public const string SeatPrefix = "coop-seat-";
        public const string CellPrefix = "coop-cell-";
        public const string ActionPrefix = "coop-action-";

        public static VisualElement Build(CoopNativeView view, Action<int> select, Action<string> cast)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (select == null) throw new ArgumentNullException(nameof(select));
            if (cast == null) throw new ArgumentNullException(nameof(cast));
            var root = new VisualElement { name = "coop-hud" };
            root.Add(Label(TurnName, CoopNativePresenter.TurnLabel(view)));
            root.Add(Label(BossName, CoopNativePresenter.BossLabel(view)));

            var seats = new VisualElement { name = "coop-seats" };
            seats.style.flexDirection = FlexDirection.Row;
            for (var seat = 0; seat < view.Participants.Count; seat += 1)
            {
                var panel = new VisualElement { name = SeatPrefix + seat };
                panel.style.marginRight = 12;
                panel.Add(Label("coop-seat-label-" + seat, CoopNativePresenter.SeatLabel(view, seat)));
                var own = view.Participants[seat];
                panel.Add(Label("coop-seat-resources-" + seat,
                    "HP " + own.Health + "/" + own.MaxHealth + " · mana " + own.Mana + " · rage " + own.Rage +
                    " · shield " + own.Shield));
                panel.Add(Label("coop-seat-contribution-" + seat,
                    "dmg " + own.Contribution.Damage + " · heal " + own.Contribution.Healing +
                    " · shield " + own.Contribution.Shielding));
                seats.Add(panel);
            }
            root.Add(seats);

            var board = new VisualElement { name = "coop-board" };
            board.style.flexDirection = FlexDirection.Row;
            board.style.flexWrap = Wrap.Wrap;
            board.style.width = 520;
            for (var index = 0; index < view.Board.Count; index += 1)
            {
                var cell = index;
                var tile = view.Board[cell];
                var button = new Button(() => select(cell)) { text = CellText(tile) };
                button.name = CellPrefix + cell;
                button.style.width = 58;
                button.style.height = 48;
                button.style.marginRight = 2;
                button.style.marginBottom = 2;
                button.SetEnabled(CoopNativePresenter.CanAct(view));
                board.Add(button);
            }
            root.Add(board);

            var actions = new VisualElement { name = "coop-actions" };
            actions.style.flexDirection = FlexDirection.Row;
            var available = CoopNativePresenter.AvailableActions(view);
            foreach (var kind in new[] { "guard", "skill", "signature", "ultimate" })
            {
                var action = kind;
                var button = new Button(() => cast(action)) { text = ActionName(action) };
                button.name = ActionPrefix + action;
                button.SetEnabled(available.Contains(action));
                actions.Add(button);
            }
            root.Add(actions);
            return root;
        }

        public static string CellText(CoopNativeView.Tile tile) =>
            tile == null ? "·" : ElementName(tile.Element) + (tile.Multiplier > 1 ? " ×" + tile.Multiplier : "");

        public static string ActionName(string kind)
        {
            switch (kind)
            {
                case "guard": return "Guard";
                case "skill": return "Skill";
                case "signature": return "Signature";
                case "ultimate": return "Ultimate";
                default: return kind ?? "?";
            }
        }

        public static string ElementName(string element)
        {
            switch (element)
            {
                case "fire": return "Fire";
                case "water": return "Water";
                case "electric": return "Electric";
                case "ghost": return "Ghost";
                case "ground": return "Ground";
                case "light": return "Light";
                default: return "?";
            }
        }

        private static Label Label(string name, string text) => new Label(text) { name = name };
    }
}
