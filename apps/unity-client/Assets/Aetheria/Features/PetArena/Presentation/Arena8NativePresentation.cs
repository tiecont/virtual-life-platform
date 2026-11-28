using System;
using Aetheria.Networking;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Presentation for the committed native projection. Every tile, resource and
    // skill affordance is read from the authoritative view; nothing here computes
    // damage, rewards or an outcome.
    public static class Arena8NativePresentation
    {
        public const string CellNamePrefix = "arena8-cell-";
        public const string SkillNamePrefix = "arena8-skill-";

        public static VisualElement BuildBoard(Arena8NativeView view, int selected, Action<int> select)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (select == null) throw new ArgumentNullException(nameof(select));
            var board = new VisualElement();
            board.style.flexDirection = FlexDirection.Row;
            board.style.flexWrap = Wrap.Wrap;
            board.style.width = 520;
            for (var index = 0; index < view.Board.Count; index++)
            {
                var cell = index;
                var button = new Button(() => select(cell)) { text = ElementName(view.Board[cell]) };
                button.name = CellNamePrefix + cell;
                button.style.width = 58;
                button.style.height = 48;
                button.style.marginRight = 2;
                button.style.marginBottom = 2;
                if (cell == selected) button.style.borderBottomWidth = 4;
                board.Add(button);
            }
            return board;
        }

        public static VisualElement BuildSkills(Arena8NativeView view, Action<string> cast)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            if (cast == null) throw new ArgumentNullException(nameof(cast));
            var hud = new VisualElement();
            foreach (var id in view.Skills)
            {
                var skill = id;
                var gate = SkillGate(view, skill);
                var button = new Button(() => cast(skill)) { text = SkillName(skill) + (gate == null ? "" : " · " + gate) };
                button.name = SkillNamePrefix + skill;
                button.SetEnabled(gate == null);
                hud.Add(button);
            }
            return hud;
        }

        // Local affordability hint for the committed resources. The server stays
        // the only authority for whether an ability resolves.
        public static string SkillGate(Arena8NativeView view, string id)
        {
            if (view.Affords(id)) return null;
            if (view.Phase != "playing") return "waiting";
            if (!view.HasSkill(id)) return "unavailable";
            if (view.Cooldown != 0) return "cooldown " + view.Cooldown;
            return "needs mana/rage";
        }

        public static string ElementName(int element)
        {
            switch (element)
            {
                case 0: return "Fire";
                case 1: return "Water";
                case 2: return "Electric";
                case 3: return "Ghost";
                case 4: return "Ground";
                case 5: return "Light";
                default: return "?";
            }
        }

        public static string SkillName(string id)
        {
            switch (id)
            {
                case Arena8NativeView.SharedSkill: return "Shared skill";
                case Arena8NativeView.Signature: return "Signature";
                case Arena8NativeView.FireZone: return "Fire zone";
                case Arena8NativeView.Ultimate: return "Ultimate";
                case Arena8NativeView.Guard: return "Guard";
                default: return id ?? "?";
            }
        }
    }
}
