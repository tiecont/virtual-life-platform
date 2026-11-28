using System;
using System.Collections.Generic;
using System.Globalization;
using Aetheria.Networking;
using Aetheria.PetArena.Vfx;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // An input-transparent overlay over the already committed board. Only
    // the approved R04 sprites and existing arena audio cues are used here.
    internal sealed class CoopJewelHudEffects
    {
        private const int MaxActive = 64;
        private const float FlightSeconds = .35f;
        private const float HoldSeconds = .85f;
        private readonly VisualElement layer = new() { name = "coop-jewel-feedback", pickingMode = PickingMode.Ignore };
        private readonly List<Chip> chips = new(MaxActive);
        private VisualElement root;

        public CoopJewelHudEffects()
        {
            layer.style.position = Position.Absolute;
            layer.style.left = 0;
            layer.style.top = 0;
            layer.style.right = 0;
            layer.style.bottom = 0;
        }

        public void Attach(VisualElement target)
        {
            root = target;
            if (layer.parent != target) target.Add(layer);
        }

        public void Clear()
        {
            foreach (var chip in chips) chip.Hide();
            layer.RemoveFromHierarchy();
            root = null;
        }

        public void Play(CoopNativeView view, Action<ArenaAudioCue> sound)
        {
            if (root == null || view.JewelFeedback.Count == 0) return;
            foreach (var chip in chips) chip.Hide();
            var board = root.Q("coop-board");
            var played = new HashSet<ArenaAudioCue>();
            var destinationSlots = new Dictionary<VisualElement, int>();
            var next = 0;
            foreach (var effect in view.JewelFeedback)
            {
                if (!TryDescribe(effect, out var kind, out var value, out var color, out var cue)) continue;
                if (played.Add(cue)) sound(cue);
                if (next == MaxActive) continue;
                var destination = effect.Cell.HasValue
                    ? root.Q(CoopNativePresentation.CellPrefix + effect.Cell.Value)
                    : (kind == "frost" || kind == "sword") ? root.Q("coop-opponents")
                    : root.Q(CoopNativePresentation.SeatPrefix + effect.Seat.Value);
                if (destination == null) continue;
                if (next == chips.Count)
                {
                    var chip = new Chip();
                    chips.Add(chip);
                    layer.Add(chip.Element);
                }
                destinationSlots.TryGetValue(destination, out var slot);
                destinationSlots[destination] = slot + 1;
                chips[next++].Show(kind, value, color, board, destination, slot);
            }
        }

        public void Update(float elapsed, int speed, bool reducedMotion)
        {
            if (root == null) return;
            foreach (var chip in chips) chip.Update(root, elapsed * speed, reducedMotion);
        }

        private static bool TryDescribe(CoopNativeView.JewelEffect effect, out string kind,
            out string value, out Color color, out ArenaAudioCue cue)
        {
            var amount = effect.Value.ToString(CultureInfo.InvariantCulture);
            switch (effect.Kind)
            {
                case "sword-damage":
                    kind = "sword"; value = "−" + amount; color = new Color32(255, 174, 151, 255); cue = ArenaAudioCue.Attack; return true;
                case "heart-heal":
                    kind = "heart"; value = "+" + amount; color = new Color32(255, 168, 199, 255); cue = ArenaAudioCue.ElementLight; return true;
                case "shield-grant":
                    kind = "shield"; value = "+" + amount; color = new Color32(180, 213, 255, 255); cue = ArenaAudioCue.Guard; return true;
                case "mana-gain":
                case "special-mana":
                    kind = effect.Kind == "special-mana" ? "special" : "mana"; value = "+" + amount + (kind == "special" ? " " + CampaignLocale.Text("battle.jewel.mana", "Mana") : "");
                    color = new Color32(143, 222, 255, 255); cue = ArenaAudioCue.ElementWater; return true;
                case "rage-gain":
                case "special-rage":
                    kind = effect.Kind == "special-rage" ? "special" : "rage"; value = "+" + amount + (kind == "special" ? " " + CampaignLocale.Text("battle.jewel.rage", "Rage") : "");
                    color = new Color32(255, 194, 123, 255); cue = ArenaAudioCue.ElementFire; return true;
                case "nature-cleanse":
                    kind = "nature"; value = "−" + amount; color = new Color32(152, 234, 131, 255); cue = ArenaAudioCue.ElementGround; return true;
                case "chill-armed":
                case "chill-consumed":
                    kind = "frost"; value = "−" + (effect.Value / 1000d).ToString("0.#%", CultureInfo.InvariantCulture);
                    color = new Color32(147, 227, 255, 255); cue = ArenaAudioCue.ElementWater; return true;
                case "astral-upgrade":
                    kind = "astral"; value = "×" + amount; color = new Color32(216, 163, 255, 255); cue = ArenaAudioCue.ElementGhost; return true;
                default:
                    kind = value = null; color = default; cue = ArenaAudioCue.None; return false;
            }
        }

        private sealed class Chip
        {
            public readonly VisualElement Element = new() { pickingMode = PickingMode.Ignore };
            private readonly VisualElement icon = new() { pickingMode = PickingMode.Ignore };
            private readonly Label text = new() { pickingMode = PickingMode.Ignore };
            private VisualElement source, destination;
            private float elapsed;
            private int stackSlot;
            private bool active;

            public Chip()
            {
                Element.style.position = Position.Absolute;
                Element.style.flexDirection = FlexDirection.Row;
                Element.style.alignItems = Align.Center;
                Element.style.paddingLeft = Element.style.paddingRight = 3;
                Element.style.borderBottomLeftRadius = Element.style.borderBottomRightRadius = 5;
                Element.style.borderTopLeftRadius = Element.style.borderTopRightRadius = 5;
                Element.style.backgroundColor = (Color)new Color32(29, 23, 44, 248);
                icon.style.width = icon.style.height = 22;
                text.style.unityFontStyleAndWeight = FontStyle.Bold;
                text.style.backgroundColor = Color.clear;
                text.style.paddingLeft = 2;
                CampaignLocale.ApplyFont(text);
                Element.Add(icon);
                Element.Add(text);
                Hide();
            }

            public void Show(string kind, string value, Color color, VisualElement from, VisualElement to, int slot)
            {
                icon.style.backgroundImage = new StyleBackground(FunctionalGemArt.Get(kind));
                text.text = value;
                text.style.color = color;
                source = from;
                destination = to;
                stackSlot = slot;
                elapsed = 0;
                active = true;
            }

            public void Hide()
            {
                Element.style.display = DisplayStyle.None;
                source = destination = null;
                active = false;
            }

            public void Update(VisualElement root, float delta, bool reducedMotion)
            {
                if (!active) return;
                var target = destination.worldBound;
                if (target.width <= 0 || float.IsNaN(target.x))
                {
                    elapsed += delta;
                    if (elapsed >= FlightSeconds + HoldSeconds) Hide();
                    return;
                }
                var flight = reducedMotion ? 0 : FlightSeconds;
                var end = root.WorldToLocal(new Vector2(
                    target.xMax - 20 - (stackSlot / 4) * 62,
                    target.yMin + 5 + (stackSlot % 4) * 24));
                var start = source == null ? end : root.WorldToLocal(source.worldBound.center);
                var progress = flight == 0 ? 1 : Mathf.Clamp01(elapsed / flight);
                var location = Vector2.Lerp(start, end, Mathf.SmoothStep(0, 1, progress));
                Element.style.left = Mathf.Clamp(location.x, 0, Mathf.Max(0, root.layout.width - 86));
                Element.style.top = Mathf.Clamp(location.y, 0, Mathf.Max(0, root.layout.height - 25));
                Element.style.display = DisplayStyle.Flex;
                elapsed += delta;
                if (elapsed >= flight + HoldSeconds) Hide();
            }
        }
    }
}
