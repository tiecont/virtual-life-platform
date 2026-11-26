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

        public static VisualElement Build(CoopNativeView view, Action<int> select, Action<string> cast, int selected = -1)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (select == null) throw new ArgumentNullException(nameof(select));
            if (cast == null) throw new ArgumentNullException(nameof(cast));
            var root = new VisualElement { name = "coop-hud" };
            root.AddToClassList("coop-panel");
            root.Add(Label(TurnName, CoopNativePresenter.TurnLabel(view)));
            root.Add(Label(BossName, CoopNativePresenter.BossLabel(view)));

            if (view.PendingAttack != null)
                root.Add(Label("coop-telegraph", "Incoming attack · " + view.PendingAttack.Targets + " targets · " + view.PendingAttack.Remaining + " turns"));
            var seats = new VisualElement { name = "coop-seats" };
            seats.style.flexDirection = FlexDirection.Row;
            for (var seat = 0; seat < view.Participants.Count; seat += 1)
            {
                var panel = new VisualElement { name = SeatPrefix + seat };
                panel.AddToClassList("coop-member");
                if (seat == view.ActiveSeat) panel.AddToClassList("coop-active-member");
                panel.Add(Label("coop-seat-label-" + seat, CoopNativePresenter.SeatLabel(view, seat)));
                var own = view.Participants[seat];
                panel.Add(Label("coop-seat-resources-" + seat,
                    "HP " + own.Health + "/" + own.MaxHealth + " · mana " + own.Mana + " · rage " + own.Rage +
                    " · shield " + own.Shield));
                panel.Add(Label("coop-seat-contribution-" + seat,
                    "dmg " + own.Contribution.Damage + " · heal " + own.Contribution.Healing +
                    " · shield " + own.Contribution.Shielding));
                foreach (var status in own.Statuses)
                    panel.Add(Label("coop-effect-" + seat, status.Kind + " · " + status.Turns + " turns"));
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
                if (tile != null) button.AddToClassList("tile-" + tile.Element);
                if (cell == selected) button.AddToClassList("coop-selected");
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
            actions.style.flexWrap = Wrap.Wrap;
            var kinds = view.Abilities.Count == 0 ? new[] { "guard", "skill", "signature", "ultimate" } :
                view.Abilities.Select(ability => ability.Kind).ToArray();
            foreach (var kind in kinds)
            {
                var action = kind;
                var ability = view.Abilities.FirstOrDefault(item => item.Kind == action);
                var label = ActionName(action);
                if (ability != null)
                {
                    var prefix = view.Own.PetId + "-";
                    var name = ability.Id.StartsWith(prefix, StringComparison.Ordinal) ? ability.Id.Substring(prefix.Length) : ability.Id;
                    label = name.Replace('-', ' ') + " · " + ability.Mana + " MP / " + ability.Rage + " rage";
                    if (ability.Cooldown > 0) label += " · cooldown " + ability.Cooldown;
                }
                var button = new Button(() => cast(action)) { text = label };
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
