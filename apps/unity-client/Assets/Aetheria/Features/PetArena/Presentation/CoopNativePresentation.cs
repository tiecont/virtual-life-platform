using System;
using System.Globalization;
using System.Linq;
using Aetheria.Networking;
using UnityEngine;
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
        private const float JewelTooltipWidth = 232f;
        private const float JewelTooltipGap = 4f;

        public static VisualElement Build(CoopNativeView view, Action<int> select, Action<string> cast, int selected = -1, bool inputAvailable = true)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (select == null) throw new ArgumentNullException(nameof(select));
            if (cast == null) throw new ArgumentNullException(nameof(cast));
            var root = new VisualElement { name = "coop-hud" };
            root.AddToClassList("coop-panel");
            CampaignLocale.ApplyFont(root);
            if (view.IsFunctionalBoard)
            {
                var states = Resources.Load<StyleSheet>("FunctionalTiles/FunctionalGemStates");
                if (states != null) root.styleSheets.Add(states);
            }
            root.Add(Label(TurnName, CoopNativePresenter.TurnLabel(view)));
            var stage = BattleScreenLayout.Stage();
            root.Add(stage);
            var opponents = BattleScreenLayout.Side("coop-opponents", "battle-enemy-side");
            var enemy = new VisualElement();
            enemy.AddToClassList("battle-combatant");
            var bossMeter = new ProgressBar
            {
                name = BossName + "-meter", lowValue = 0,
                highValue = view.BossState.MaxHealth, value = view.BossState.Health
            };
            enemy.Add(Label(BossName, CoopNativePresenter.BossLabel(view)));
            enemy.Add(bossMeter);
            if (view.BossState.ArmorBreakPm > 1000)
                enemy.Add(Label("coop-boss-vulnerability", "Boss damage taken ×" + (view.BossState.ArmorBreakPm / 1000f).ToString("0.###")));
            if (view.BossState.DotTurns > 0)
                enemy.Add(Label("coop-burn", "Burn · " + view.BossState.DotDamage + " damage · " + view.BossState.DotTurns + " turns"));
            if (view.FireZoneActiveTurns > 0)
                enemy.Add(Label("coop-fire-zone", "Fire Zone · " + view.FireZoneActiveTurns +
                    (view.FireZoneActiveTurns == 1 ? " turn" : " turns")));

            if (view.ChillReductionPm > 0)
            {
                var reduction = (view.ChillReductionPm / 1000d).ToString("0.#%", CultureInfo.InvariantCulture);
                enemy.Add(Label("coop-chill", string.Format(CultureInfo.InvariantCulture,
                    CampaignLocale.Text("battle.jewel_chill", "Chill · Next enemy attack: −{0} damage"), reduction)));
            }

            var pending = view.PendingAttack;
            if (pending != null)
            {
                var targets = pending.Targets == 1 ? "1 target" : pending.Targets + " targets";
                var turns = pending.Remaining == 1 ? "1 turn" : pending.Remaining + " turns";
                enemy.Add(Label("coop-telegraph", $"Incoming in {turns} · {targets} · {pending.Damage} base damage each"));
            }
            opponents.Add(enemy);
            stage.Add(opponents);
            var seats = BattleScreenLayout.Side("coop-seats", "battle-player-side");
            for (var seat = 0; seat < view.Participants.Count; seat += 1)
            {
                var panel = new VisualElement { name = SeatPrefix + seat };
                panel.AddToClassList("coop-member");
                panel.AddToClassList("battle-combatant");
                if (seat == view.ActiveSeat) panel.AddToClassList("coop-active-member");
                var own = view.Participants[seat];
                var seatLabel = "Seat " + seat.ToString(CultureInfo.InvariantCulture) + " · " +
                    CoopNativePresenter.SeatLabel(view, seat);
                panel.Add(Label("coop-seat-label-" + seat, seatLabel));
                var healthLabel = string.Format(CultureInfo.InvariantCulture,
                    "Seat {0} · {1} health · {2}/{3} HP", seat, own.PetId, own.Health, own.MaxHealth);
                var health = new ProgressBar
                {
                    name = "coop-seat-health-" + seat,
                    lowValue = 0,
                    highValue = own.MaxHealth,
                    value = own.Health,
                    title = healthLabel,
                    tooltip = healthLabel,
                    focusable = false
                };
                health.AddToClassList("coop-seat-health");
                panel.Add(health);
                panel.Add(Label("coop-seat-resources-" + seat,
                    "Mana " + own.Mana + " · Rage " + own.Rage +
                    (own.Shield > 0 ? " · Shield " + own.Shield : "") +
                    (own.UltimateReady ? " · Ultimate ready" : "")));
                panel.Add(Label("coop-seat-contribution-" + seat,
                    "dmg " + own.Contribution.Damage + " · heal " + own.Contribution.Healing +
                    " · shield " + own.Contribution.Shielding));
                foreach (var status in own.Statuses)
                    panel.Add(Label("coop-effect-" + seat, status.Kind + " · " + status.Turns + " turns"));
                seats.Add(panel);
            }
            stage.Add(seats);

            var center = BattleScreenLayout.Center("coop-board");
            var board = center[0];
            stage.Insert(0, center);
            Label jewelTooltip = null;
            if (view.IsFunctionalBoard)
            {
                board.AddToClassList("functional-gem-board");
                jewelTooltip = new Label { name = "coop-jewel-tooltip", pickingMode = PickingMode.Ignore };
                jewelTooltip.AddToClassList("functional-gem-tooltip");
                jewelTooltip.style.width = JewelTooltipWidth;
                jewelTooltip.style.visibility = Visibility.Hidden;
                stage.Add(jewelTooltip);
            }
            var allowSwap = inputAvailable && CoopNativePresenter.CanAct(view);
            for (var index = 0; index < view.Board.Count; index += 1)
            {
                var cell = index;
                var tile = view.Board[cell];
                var description = CellText(tile);
                var button = new Button(() => select(cell))
                {
                    name = CellPrefix + cell,
                    text = description,
                    tooltip = description
                };
                button.AddToClassList("coop-tile");
                if (tile != null)
                {
                    var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                    if (tile.Kind == null)
                    {
                        button.AddToClassList("tile-" + tile.Element);
                        button.AddToClassList("coop-element-tile");
                        icon.name = "coop-element-icon";
                        icon.AddToClassList("coop-element-icon");
                    }
                    else
                    {
                        var sprite = FunctionalGemArt.Get(tile.Kind);
                        if (sprite != null)
                        {
                            button.AddToClassList("coop-functional-tile");
                            button.AddToClassList("functional-gem-cell");
                            icon.AddToClassList("functional-gem-art");
                            icon.name = "coop-functional-icon";
                            icon.AddToClassList("coop-functional-icon");
                            icon.style.backgroundImage = new StyleBackground(sprite);
                        }
                    }
                    button.Add(icon);
                    if (tile.Multiplier > 1)
                    {
                        button.AddToClassList("coop-tile-multiplied");
                        var badge = new Label("×" + tile.Multiplier) { name = "coop-tile-multiplier", pickingMode = PickingMode.Ignore };
                        badge.AddToClassList("coop-tile-multiplier");
                        if (tile.Kind != null) badge.AddToClassList("functional-gem-multiplier");
                        button.Add(badge);
                    }
                }
                if (tile?.Kind != null)
                {
                    var function = CampaignLocale.Text("battle.jewel." + tile.Kind + ".effect", "");
                    button.tooltip += "\n" + function;
                    BindJewelTooltip(stage, button, jewelTooltip);
                }
                if (view.FireZoneCells.Contains(cell))
                {
                    button.AddToClassList("coop-fire-zone-tile");
                    button.tooltip += " · " + CampaignLocale.Text("battle.fire_zone", "Fire Zone");
                }
                if (cell == selected)
                {
                    button.AddToClassList("coop-selected");
                    if (tile?.Kind != null)
                    {
                        button.AddToClassList("functional-gem-selected");
                        var highlight = new VisualElement { pickingMode = PickingMode.Ignore };
                        highlight.AddToClassList("functional-gem-selection");
                        button.Insert(1, highlight);
                    }
                }
                button.SetEnabled(allowSwap);
                BattleScreenLayout.AddCell(board, button, index);
            }


            var actions = new VisualElement { name = "coop-actions" };
            actions.AddToClassList("battle-actions");
            var available = CoopNativePresenter.AvailableActions(view);
            var kinds = view.Abilities.Count == 0 ? new[] { "guard", "skill", "signature", "ultimate" } :
                view.Abilities.Select(ability => ability.Kind).ToArray();
            foreach (var action in kinds)
            {
                if (action == CoopNativeView.Ultimate && !view.Own.HasUltimate) continue;
                var ability = view.Abilities.FirstOrDefault(item => item.Kind == action);
                var label = ActionName(action);
                if (ability != null)
                {
                    var prefix = view.Own.PetId + "-";
                    var name = ability.Id.StartsWith(prefix, StringComparison.Ordinal) ? ability.Id.Substring(prefix.Length) : ability.Id;
                    var title = name.Replace('-', ' ');
                    title = title.Length == 0 || name == "guard" ? label : char.ToUpperInvariant(title[0]) + title.Substring(1);
                    label = title + "\n" + CampaignLocale.Format("battle.action.cost", "Lv {0} · {1} MP / {2} rage",
                        view.Own.SkillLevels[view.SlotForAbility(action)], ability.Mana, ability.Rage);
                    if (ability.Cooldown > 0)
                        label += "\n" + CampaignLocale.Format("battle.action.cooldown", "Cooldown {0}", ability.Cooldown);
                }
                var button = new Button(() => cast(action)) { text = label, tooltip = label };
                button.name = ActionPrefix + action;
                button.SetEnabled(inputAvailable && available.Contains(action));
                actions.Add(button);
            }
            if (view.IsTimed && view.Phase == "playing")
            {
                var endTurn = new Button(() => cast(CoopNativeIntent.EndTurn))
                    { name = ActionPrefix + "end-turn", text = CampaignLocale.Text("battle.end_turn", "End Turn") };
                endTurn.AddToClassList("battle-primary-action");
                endTurn.SetEnabled(inputAvailable && view.CanEndTurn && CoopNativePresenter.CanAct(view));
                actions.Add(endTurn);
            }
            center.Add(actions);
            return root;
        }

        public static string CellText(CoopNativeView.Tile tile)
        {
            if (tile == null) return "·";
            var name = tile.Kind == null ? ElementName(tile.Element) :
                CampaignLocale.Text("battle.jewel." + tile.Kind, tile.Kind);
            return name + (tile.Multiplier > 1 ? " ×" + tile.Multiplier : "");
        }

        private static void BindJewelTooltip(VisualElement stage, Button button, Label tooltip)
        {
            void Show()
            {
                var cell = stage.WorldToLocal(button.worldBound);
                var above = cell.yMin - tooltip.layout.height - JewelTooltipGap;
                tooltip.text = button.tooltip;
                tooltip.style.left = Mathf.Clamp(cell.center.x - JewelTooltipWidth / 2f, 0,
                    Mathf.Max(0, stage.layout.width - JewelTooltipWidth));
                tooltip.style.top = above >= 0 ? above : cell.yMax + JewelTooltipGap;
                tooltip.style.visibility = Visibility.Visible;
            }
            void Hide() => tooltip.style.visibility = Visibility.Hidden;

            button.RegisterCallback<PointerEnterEvent>(_ => Show());
            button.RegisterCallback<PointerLeaveEvent>(_ => Hide());
            button.RegisterCallback<FocusInEvent>(_ => Show());
            button.RegisterCallback<FocusOutEvent>(_ => Hide());
            button.RegisterCallback<PointerDownEvent>(_ => Hide());
        }

        public static string ActionName(string kind)
        {
            switch (kind)
            {
                case "guard": return CampaignLocale.Text("battle.action.guard", "Guard");
                case "skill": return CampaignLocale.Text("battle.action.skill", "Skill");
                case "signature": return CampaignLocale.Text("battle.action.signature", "Signature");
                case "ultimate": return CampaignLocale.Text("battle.action.ultimate", "Ultimate");
                case "fire-zone": return CampaignLocale.Text("battle.action.fire-zone", "Fire Zone");
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
