using System;
using System.Collections;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using Aetheria.Networking;
using Aetheria.Native.Public.V1;
using Google.Protobuf;
using Aetheria.PetArena.Presentation;
using Aetheria.PetArena.Vfx;
using Aetheria.World.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Aetheria.Tests
{
    // Scene adapter contract: the HUD mounts only when a UIDocument exists and
    // renders the committed view into its root.
    public sealed class CoopNativeHudTests
    {
        [Test]
        public void HudMountsTheCommittedProjection()
        {
            var go = new GameObject("coop-hud-test");
            try
            {
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
                var hud = go.AddComponent<CoopNativeHud>();
                hud.Attach(document);
                var bytes = System.Text.Encoding.UTF8.GetBytes(Projection("{\"targets\":2,\"remaining\":1,\"damage\":84}"));
                var view = CoopNativeView.Decode(3, bytes);
                hud.Bind(null, () => { });
                hud.Render(view);
                var root = document.rootVisualElement;
                Assert.That(root, Is.Not.Null);
                Assert.That(root.Q("coop-hud"), Is.Not.Null);
                Assert.That(root.Q<Label>("coop-boss").text, Does.Contain("Boss 5000/5000"));
                Assert.That(root.Q<Label>("coop-telegraph").text, Is.EqualTo("Incoming in 1 turn · 2 targets · 84 base damage each"));
                var footer = root.Q("coop-footer");
                var recover = footer.Q<Button>("coop-reconnect");
                Assert.That(footer[0].name, Is.EqualTo("coop-return"));
                Assert.That(footer[1], Is.SameAs(recover));
                Assert.That(recover.ClassListContains("coop-footer-hidden"), Is.True);
                Assert.That(recover.enabledSelf, Is.False);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [UnityTest]
        public IEnumerator CompactHudKeepsRowsReachableAndTheFooterVisible()
        {
            var go = new GameObject("coop-compact-hud-test");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            try
            {
                settings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = settings;
                var root = document.rootVisualElement;
                root.style.width = 800;
                root.style.height = 500;
                root.styleSheets.Add(Resources.Load<StyleSheet>("Wave1"));
                root.AddToClassList("coop-world");

                var hud = go.AddComponent<CoopNativeHud>();
                hud.Attach(document);
                hud.Bind(null, () => { });
                var elements = new[] { "fire", "water", "electric", "ghost", "ground", "light" };
                var view = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(Projection(elements: elements, firstMultiplier: 64)));
                hud.Render(view);
                yield return null;
                yield return null;

                var icons = new System.Collections.Generic.HashSet<Texture2D>();
                for (var index = 0; index < elements.Length; index++)
                {
                    var tile = root.Q<Button>("coop-cell-" + index);
                    var icon = tile.Q("coop-element-icon");
                    Assert.That(tile.ClassListContains("tile-" + elements[index]), Is.True);
                    Assert.That(icon.pickingMode, Is.EqualTo(PickingMode.Ignore));
                    var texture = icon.resolvedStyle.backgroundImage.texture;
                    Assert.That(texture, Is.Not.Null, elements[index] + " icon failed to load");
                    Assert.That(icons.Add(texture), Is.True, elements[index] + " icon must be unique");
                    Assert.That(icon.worldBound.xMin, Is.GreaterThanOrEqualTo(tile.worldBound.xMin));
                    Assert.That(icon.worldBound.xMax, Is.LessThanOrEqualTo(tile.worldBound.xMax));
                }

                var firstTile = root.Q<Button>("coop-cell-0");
                var multiplier = firstTile.Q<Label>("coop-tile-multiplier");
                Assert.That(multiplier.text, Is.EqualTo("×64"));
                Assert.That(multiplier.worldBound.xMax, Is.LessThanOrEqualTo(firstTile.worldBound.xMax));
                Assert.That(firstTile.Q("coop-element-icon").worldBound.xMax, Is.LessThanOrEqualTo(multiplier.worldBound.xMin));
                Assert.That(multiplier.pickingMode, Is.EqualTo(PickingMode.Ignore));
                Assert.That(root.Q<Button>("coop-cell-1").Q("coop-tile-multiplier"), Is.Null);
                Assert.That(root.Q<Button>("coop-cell-6").Q("coop-element-icon"), Is.Null);

                var scroll = root.Q<ScrollView>("coop-hud-scroll");
                var footer = root.Q("coop-footer");
                var lastCell = scroll.Q<Button>("coop-cell-63");
                var actions = scroll.Q("coop-actions");
                Assert.That(lastCell.worldBound.height, Is.GreaterThan(0));
                Assert.That(lastCell.worldBound.yMax, Is.LessThanOrEqualTo(actions.worldBound.yMin));
                Assert.That(footer.worldBound.yMax, Is.LessThanOrEqualTo(root.worldBound.yMax));
                Assert.That(scroll.worldBound.yMax, Is.LessThanOrEqualTo(footer.worldBound.yMin));

                scroll.ScrollTo(actions);
                yield return null;
                Assert.That(root.Q<Label>("coop-turn").worldBound.yMax, Is.LessThanOrEqualTo(scroll.worldBound.yMin + 1));
                Assert.That(scroll.scrollOffset.y, Is.GreaterThan(0));
                Assert.That(lastCell.worldBound.yMax, Is.LessThanOrEqualTo(scroll.contentViewport.worldBound.yMax + 1));

                hud.Render(view);
                yield return null;
                Assert.That(root.Q<ScrollView>("coop-hud-scroll"), Is.SameAs(scroll));
                Assert.That(scroll.scrollOffset.y, Is.GreaterThan(0));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        [TestCase("en", "End Turn >>")]
        [TestCase("vi", "Kết thúc lượt >>")]
        [TestCase("ja", "ターン終了 >>")]
        [TestCase("ko", "턴 종료 >>")]
        [TestCase("zh", "结束回合 >>")]
        public void TimedActionUsesPersistedCampaignLanguage(string language, string expected)
        {
            const string key = "aetheria.campaign.language";
            var previous = PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;
            try
            {
                PlayerPrefs.SetString(key, language);
                var view = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(Projection(
                    elements: new[] { "sword", "mana", "rage", "heart", "shield", "special" }, withAbilities: true, timed: true)));
                var hud = CoopNativePresentation.Build(view, _ => { }, _ => { });
                Assert.That(hud.Q<Button>("coop-action-end-turn").text, Is.EqualTo(expected));
            }
            finally
            {
                if (previous == null) PlayerPrefs.DeleteKey(key);
                else PlayerPrefs.SetString(key, previous);
            }
        }

        [TestCase("en", "Nature", "Cleanse")]
        [TestCase("vi", "Thiên Nhiên", "thanh tẩy")]
        [TestCase("ja", "自然", "弱体効果")]
        [TestCase("ko", "자연", "해로운 효과")]
        [TestCase("zh", "自然", "负面状态")]
        public void AllNineJewelsUseLocalizedNamesAndDescriptions(string language, string nature, string effect)
        {
            const string key = "aetheria.campaign.language";
            var previous = PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;
            try
            {
                PlayerPrefs.SetString(key, language);
                var view = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(
                    AdvancedProjection(JewelKinds)));
                var hud = CoopNativePresentation.Build(view, _ => { }, _ => { });
                for (var index = 0; index < JewelKinds.Length; index++)
                {
                    var tile = hud.Q<Button>("coop-cell-" + index);
                    var parts = tile.tooltip.Split('\n');
                    Assert.That(parts.Length, Is.EqualTo(2));
                    Assert.That(parts[0], Is.Not.Empty);
                    Assert.That(parts[1], Is.Not.Empty);
                    Assert.That(tile.Q("coop-functional-icon").style.backgroundImage.value.sprite.name,
                        Is.EqualTo(JewelKinds[index]));
                }
                var tooltip = hud.Q<Button>("coop-cell-6").tooltip;
                Assert.That(tooltip, Does.StartWith(nature + "\n"));
                Assert.That(tooltip, Does.Contain(effect));
            }
            finally
            {
                if (previous == null) PlayerPrefs.DeleteKey(key);
                else PlayerPrefs.SetString(key, previous);
            }
        }

        private static readonly string[] JewelKinds =
            { "sword", "mana", "rage", "heart", "shield", "special", "nature", "frost", "astral" };

        [UnityTest]
        public IEnumerator DesktopResolutionsKeepEightRowsCenteredBetweenCombatants()
        {
            var go = new GameObject("battle-layout-test");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            try
            {
                settings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = settings;
                var root = document.rootVisualElement;
                root.styleSheets.Add(Resources.Load<StyleSheet>("Wave1"));
                root.AddToClassList("coop-world");
                var hud = go.AddComponent<CoopNativeHud>();
                hud.Attach(document);
                hud.Bind(null, () => { });
                var jewels = Enumerable.Range(0, 64).Select(index => JewelKinds[index % JewelKinds.Length]).ToArray();
                var view = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(AdvancedProjection(jewels)));

                foreach (var (width, height) in new[] { (1280, 720), (1920, 1080), (2560, 1440), (3840, 2160) })
                {
                    root.style.width = width;
                    root.style.height = height;
                    hud.Render(view);
                    yield return null;
                    yield return null;

                    var board = root.Q("coop-board");
                    var actions = root.Q("coop-actions");
                    Assert.That(board.worldBound.center.x, Is.EqualTo(root.worldBound.center.x).Within(2f));
                    Assert.That(board.worldBound.width, Is.EqualTo(board.worldBound.height).Within(1f));
                    Assert.That(board.childCount, Is.EqualTo(8));
                    foreach (var row in board.Children())
                        Assert.That(row.childCount, Is.EqualTo(8));
                    for (var index = 0; index < jewels.Length; index++)
                    {
                        var tile = root.Q<Button>("coop-cell-" + index);
                        var icon = tile.Q("coop-functional-icon");
                        Assert.That(tile.worldBound.width, Is.EqualTo(tile.worldBound.height).Within(1.1f));
                        Assert.That(icon.worldBound.width, Is.EqualTo(tile.worldBound.width).Within(1f));
                        Assert.That(icon.worldBound.height, Is.EqualTo(tile.worldBound.height).Within(1f));
                        Assert.That(icon.pickingMode, Is.EqualTo(PickingMode.Ignore));
                        Assert.That(icon.resolvedStyle.backgroundImage.sprite.name, Is.EqualTo(jewels[index]));
                        if (index % 8 < 7)
                        {
                            var neighbor = root.Q<Button>("coop-cell-" + (index + 1));
                            Assert.That(neighbor.worldBound.xMin - tile.worldBound.xMax, Is.InRange(1f, 2.1f));
                        }
                    }
                    var firstTile = root.Q<Button>("coop-cell-0");
                    var badge = firstTile.Q<Label>("coop-tile-multiplier");
                    Assert.That(badge.worldBound.xMax, Is.LessThanOrEqualTo(firstTile.worldBound.xMax));
                    Assert.That(badge.worldBound.yMax, Is.LessThan(firstTile.worldBound.center.y));
                    Assert.That(badge.pickingMode, Is.EqualTo(PickingMode.Ignore));

                    firstTile.Focus();
                    yield return null;
                    var tooltip = root.Q<Label>("coop-jewel-tooltip");
                    Assert.That(tooltip.resolvedStyle.visibility, Is.EqualTo(Visibility.Visible));
                    Assert.That(tooltip.text, Is.EqualTo(firstTile.tooltip));
                    Assert.That(tooltip.pickingMode, Is.EqualTo(PickingMode.Ignore));
                    Assert.That(root.Q("coop-seats").worldBound.xMax, Is.LessThan(board.worldBound.xMin));
                    Assert.That(root.Q("coop-opponents").worldBound.xMin, Is.GreaterThan(board.worldBound.xMax));
                    var side = root.Q("coop-seats");
                    Assert.That(side.childCount, Is.EqualTo(4));
                    for (var seat = 0; seat < side.childCount; seat++)
                    {
                        var panel = side[seat];
                        var health = panel.Q<ProgressBar>("coop-seat-health-" + seat);
                        Assert.That(health.worldBound.height, Is.EqualTo(6).Within(1));
                        Assert.That(health.worldBound.xMax, Is.LessThanOrEqualTo(panel.worldBound.xMax));
                        Assert.That(health.worldBound.yMax, Is.LessThanOrEqualTo(panel.worldBound.yMax));
                        Assert.That(health.worldBound.yMin, Is.GreaterThanOrEqualTo(
                            panel.Q<Label>("coop-seat-label-" + seat).worldBound.yMax));
                    }
                    Assert.That(side.worldBound.yMax, Is.LessThanOrEqualTo(root.Q("coop-footer").worldBound.yMin));
                    Assert.That(board.worldBound.yMax, Is.LessThanOrEqualTo(actions.worldBound.yMin));
                    Assert.That(actions.worldBound.yMax, Is.LessThanOrEqualTo(root.Q("coop-footer").worldBound.yMin));
                    Assert.That(actions.childCount, Is.EqualTo(5));
                    var endTurn = actions.Q<Button>("coop-action-end-turn");
                    Assert.That(endTurn.enabledSelf, Is.True);
                    Assert.That(root.Q<Label>("coop-turn").text, Does.EndWith("15 s"));
                    foreach (var skill in actions.Children().OfType<Button>())
                    {
                        Assert.That(skill.worldBound.yMax, Is.LessThanOrEqualTo(root.Q("coop-footer").worldBound.yMin));
                        Assert.That(skill.worldBound.width, Is.GreaterThan(50));
                        if (skill != endTurn) Assert.That(skill.text, Does.Contain("\nLv 1"));
                    }
                }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        [UnityTest]
        public IEnumerator CommittedJewelCuesHonorTargetsAndMotionWithoutReplaying()
        {
            const string languageKey = "aetheria.campaign.language";
            const string speedKey = "aetheria.campaign.jewel_feedback_speed";
            const string overlayName = "coop-jewel-feedback";
            const BindingFlags instance = BindingFlags.Instance | BindingFlags.NonPublic;
            var previousLanguage = PlayerPrefs.HasKey(languageKey) ? PlayerPrefs.GetString(languageKey) : null;
            int? previousSpeed = PlayerPrefs.HasKey(speedKey) ? PlayerPrefs.GetInt(speedKey) : null;
            var previousMotion = WorldPresentationSettings.ReducedMotion;
            var go = new GameObject("synthetic-committed-jewel-hud-fixture");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            using var session = new CoopNativePlaySession(
                new PlatformSession(new Uri("https://localhost")),
                new NativeConnection(new Uri("wss://localhost/rt/v1"), new Uri("https://localhost"),
                    Enumerable.Repeat((byte)0x53, 32).ToArray(), Guid.NewGuid(),
                    _ => throw new AssertionException("The synthetic HUD fixture must not open a socket.")),
                Guid.NewGuid());

            try
            {
                PlayerPrefs.SetString(languageKey, "en");
                PlayerPrefs.SetInt(speedKey, 1);
                var document = go.AddComponent<UIDocument>();
                settings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
                document.panelSettings = settings;
                var root = document.rootVisualElement;
                root.style.width = 1280;
                root.style.height = 720;
                root.styleSheets.Add(Resources.Load<StyleSheet>("Wave1"));
                root.AddToClassList("coop-world");
                var hud = go.AddComponent<CoopNativeHud>();
                hud.enabled = false; // Advance the renderer with a deterministic delta instead of frame time.
                hud.Attach(document);

                // The advanced values and targets are from the verified native Nature, Astral and
                // Frost runs. This combined receipt, its basic amounts and the surrounding board
                // are a synthetic presentation fixture. The fixture makes no network requests.
                var cues = new (string Kind, int Seat, int Value, int? Cell, string Sprite, string Label, string Target)[]
                {
                    ("sword-damage", 0, 91, null, "sword", "−91", "coop-opponents"),
                    ("mana-gain", 0, 36, null, "mana", "+36", "coop-seat-0"),
                    ("rage-gain", 0, 30, null, "rage", "+30", "coop-seat-0"),
                    ("heart-heal", 2, 24, null, "heart", "+24", "coop-seat-2"),
                    ("shield-grant", 3, 45, null, "shield", "+45", "coop-seat-3"),
                    ("special-mana", 0, 21, null, "special", "+21 Mana", "coop-seat-0"),
                    ("special-rage", 0, 18, null, "special", "+18 Rage", "coop-seat-0"),
                    ("nature-cleanse", 0, 1, null, "nature", "−1", "coop-seat-0"),
                    ("chill-armed", 0, 150, null, "frost", "−15%", "coop-opponents"),
                    ("astral-upgrade", 0, 2, 3, "astral", "×2", "coop-cell-3")
                };
                var rows = string.Join(",", cues.Select(cue =>
                    FormattableString.Invariant($@"{{""kind"":""{cue.Kind}"",""seat"":{cue.Seat},""value"":{cue.Value}") +
                    (cue.Cell.HasValue ? FormattableString.Invariant($@",""cell"":{cue.Cell.Value}") : "") + "}"));
                var jewels = Enumerable.Range(0, 64).Select(index => JewelKinds[index % 6]).ToArray();
                jewels[3] = "rage";
                var viewJson = AdvancedProjection(jewels, multiplierCell: 3)
                    .Replace(@"""chillReductionPm"":0", @"""chillReductionPm"":150");
                var receiptJson = viewJson.Replace(@"""chillReductionPm"":150",
                    @"""chillReductionPm"":150,""jewelFeedback"":[" + rows + "]");

                var decode = typeof(CoopNativePlaySession).GetMethod("Decode", instance);
                var stateField = typeof(NativePlaySession).GetField("state", instance);
                var receiptProperty = typeof(PlayState).GetProperty(nameof(PlayState.ReceiptId));
                void Deliver(ulong version, bool committed)
                {
                    var state = (PlayState)decode.Invoke(session,
                        new object[] { version, Encoding.UTF8.GetBytes(committed ? receiptJson : viewJson) });
                    if (committed) receiptProperty.SetValue(state, "synthetic-receipt-" + version);
                    stateField.SetValue(session, state);
                }

                Deliver(1, false);
                hud.Bind(session);
                Assert.That(root.Q(overlayName), Is.Null);
                Deliver(2, true);
                hud.SetSettlementLoader(null);
                yield return null;
                yield return null;

                var renderer = typeof(CoopNativeHud).GetField("jewelEffects", instance).GetValue(hud);
                var step = renderer.GetType().GetMethod("Update");
                var speed = typeof(CoopNativeHud).GetField("jewelFeedbackSpeed", instance);
                void Advance(float delta) => step.Invoke(renderer,
                    new object[] { delta, (int)speed.GetValue(hud), WorldPresentationSettings.ReducedMotion });
                static Vector2 PositionOf(VisualElement chip) =>
                    new Vector2(chip.style.left.value.value, chip.style.top.value.value);
                VisualElement Astral() => root.Q(overlayName).Children().Single(chip =>
                    chip.Children().First().style.backgroundImage.value.sprite.name == "astral");
                bool WithinTarget(VisualElement chip, string target) =>
                    root.Q(target).worldBound.Contains(root.LocalToWorld(PositionOf(chip)));

                WorldPresentationSettings.ReducedMotion = false;
                Advance(.2f);
                Advance(0);
                Assert.That(WithinTarget(Astral(), "coop-cell-3"), Is.False, "At x1 the Astral cue is still in flight");

                hud.SetSettlementLoader(null); // Same committed version.
                Assert.That(root.Q(overlayName), Is.Null);
                Deliver(3, false);
                hud.SetSettlementLoader(null); // New version from a read, without receipt metadata.
                Assert.That(root.Q(overlayName), Is.Null);

                Deliver(4, true);
                hud.SetSettlementLoader(null);
                yield return null;
                yield return null;
                var speedControl = root.Q<Button>("coop-jewel-speed");
                using (var submit = NavigationSubmitEvent.GetPooled())
                {
                    submit.target = speedControl;
                    speedControl.SendEvent(submit);
                }
                Assert.That(speedControl.text, Does.Contain("×2"));
                Advance(.2f);
                Advance(0);
                Assert.That(WithinTarget(Astral(), "coop-cell-3"), Is.True, "At x2 the same cue has reached its target");
                Advance(.45f);
                Assert.That(Astral().style.display.value, Is.EqualTo(DisplayStyle.None));

                hud.Bind(session); // Re-attach after a reconnect with an already observed version.
                Assert.That(root.Q(overlayName), Is.Null);
                Deliver(5, true);
                hud.SetSettlementLoader(null);
                yield return null;
                yield return null;
                WorldPresentationSettings.ReducedMotion = true;
                Advance(0);
                var overlay = root.Q(overlayName);
                Assert.That(overlay.pickingMode, Is.EqualTo(PickingMode.Ignore));
                var chips = overlay.Children().ToArray();
                Assert.That(chips.Length, Is.EqualTo(cues.Length));
                for (var index = 0; index < cues.Length; index++)
                {
                    var chip = chips[index];
                    var cue = cues[index];
                    Assert.That(chip.Children().First().style.backgroundImage.value.sprite.name, Is.EqualTo(cue.Sprite));
                    Assert.That(chip.Q<Label>().text, Is.EqualTo(cue.Label));
                    Assert.That(chip.pickingMode, Is.EqualTo(PickingMode.Ignore));
                    Assert.That(WithinTarget(chip, cue.Target), Is.True, cue.Kind + " should appear at its target");
                }
                var reducedPositions = chips.Select(PositionOf).ToArray();
                Advance(.15f);
                Advance(0);
                Assert.That(chips.Select(PositionOf), Is.EqualTo(reducedPositions));
            }
            finally
            {
                WorldPresentationSettings.ReducedMotion = previousMotion;
                if (previousLanguage == null) PlayerPrefs.DeleteKey(languageKey);
                else PlayerPrefs.SetString(languageKey, previousLanguage);
                if (!previousSpeed.HasValue) PlayerPrefs.DeleteKey(speedKey);
                else PlayerPrefs.SetInt(speedKey, previousSpeed.Value);
                PlayerPrefs.Save();
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        [UnityTest]
        public IEnumerator LateReceiptFromPreviousRoomCannotReplaceCurrentReward()
        {
            var go = new GameObject("coop-receipt-test");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            try
            {
                settings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = settings;
                var root = document.rootVisualElement;
                root.style.width = 1280;
                root.style.height = 720;
                root.styleSheets.Add(Resources.Load<StyleSheet>("Wave1"));
                var hud = go.AddComponent<CoopNativeHud>();
                hud.Attach(document);
                var terminal = Projection().Replace("\"playing\"", "\"won\"").Replace("\"hp\":5000", "\"hp\":0");
                var view = CoopNativeView.Decode(9, System.Text.Encoding.UTF8.GetBytes(terminal));
                var old = new TaskCompletionSource<CoopLobbyClient.Reward>();
                var current = new TaskCompletionSource<CoopLobbyClient.Reward>();
                hud.Bind(null);
                hud.SetRewardLoader(() => old.Task);
                hud.Render(view);
                hud.Bind(null, () => { }, "Return to roster", requireSettlement: true);
                hud.SetRewardLoader(() => current.Task);
                hud.Render(view);
                yield return null;
                yield return null;

                var outcome = root.Q<Label>("coop-feedback");
                var pending = root.Q<Label>("coop-reward-pending");
                Assert.That(outcome.text, Is.EqualTo("Victory"));
                Assert.That(pending.text, Is.EqualTo("Waiting for settlement…"));
                foreach (var status in new[] { outcome, pending })
                {
                    Assert.That(status.resolvedStyle.color.grayscale, Is.GreaterThan(0.8f));
                    Assert.That(status.resolvedStyle.backgroundColor.grayscale, Is.LessThan(0.2f));
                    Assert.That(status.resolvedStyle.backgroundColor.a, Is.GreaterThan(0.9f));
                }
                Assert.That(root.Q<Button>("coop-return").enabledSelf, Is.False);

                current.SetResult(new CoopLobbyClient.Reward { coins = 70 });
                yield return null;
                old.SetResult(new CoopLobbyClient.Reward { coins = 3 });
                yield return null;
                hud.Render(view);
                yield return null;
                var receipt = root.Q<Label>("coop-reward");
                Assert.That(receipt.text, Does.Contain("70 coins"));
                Assert.That(receipt.resolvedStyle.color.grayscale, Is.GreaterThan(0.8f));
                Assert.That(receipt.resolvedStyle.backgroundColor.a, Is.GreaterThan(0.9f));
                Assert.That(root.Q("coop-reward-pending"), Is.Null);
                Assert.That(root.Q<Button>("coop-return").enabledSelf, Is.True);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        [Test]
        public void BossImpactPlaysForAnImmediateHitAndForShieldAbsorption()
        {
            AssertBossAudio(Projection(), Projection(health: 380), 4, 1, ArenaAudioCue.Impact);
            AssertBossAudio(Projection(shield: 40, shieldTurns: 2),
                Projection(shield: 20, shieldTurns: 1), 4, 1, ArenaAudioCue.Impact);
        }

        [Test]
        public void BossImpactAndNewWarningBothPlayAcrossAReplacedTelegraph()
        {
            const string prior = "{\"targets\":2,\"remaining\":1,\"damage\":84}";
            const string next = "{\"targets\":2,\"remaining\":2,\"damage\":84}";
            AssertBossAudio(Projection(prior), Projection(next, health: 380, round: 2),
                4, 2, ArenaAudioCue.BossWarning);
        }

        [Test]
        public void ExpiredShieldAndSkippedVersionsDoNotInventBossImpact()
        {
            AssertBossAudio(Projection(shield: 40, shieldTurns: 1), Projection(),
                4, 0, ArenaAudioCue.None);
            AssertBossAudio(Projection(), Projection(health: 380), 5, 0, ArenaAudioCue.None);
        }

        private static void AssertBossAudio(string before, string after, ulong afterVersion,
            int expectedCues, ArenaAudioCue expectedLastCue)
        {
            var go = new GameObject("coop-boss-audio-test");
            var audioHost = new GameObject("coop-boss-audio-test-director");
            const BindingFlags instance = BindingFlags.Instance | BindingFlags.NonPublic;
            var directorField = typeof(CoopNativeHud).GetField("battleAudio", instance);
            try
            {
                var hud = go.AddComponent<CoopNativeHud>();
                var director = audioHost.AddComponent<ArenaAudioDirector>();
                directorField.SetValue(hud, director);
                var prior = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(before));
                var next = CoopNativeView.Decode(afterVersion, System.Text.Encoding.UTF8.GetBytes(after));
                typeof(CoopNativeHud).GetMethod("PlayBossAudio", instance).Invoke(hud, new object[] { prior, next });
                Assert.That(director.PlayedCueCount, Is.EqualTo(expectedCues));
                Assert.That(director.LastCue, Is.EqualTo(expectedLastCue));
            }
            finally
            {
                var hud = go.GetComponent<CoopNativeHud>();
                if (hud != null) directorField.SetValue(hud, null);
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(audioHost);
            }
        }

        [TestCase(false)]
        [TestCase(true)]
        public void UltimateCueBelongsToTheExactCommittedLocalCommand(bool solo)
        {
            const string name = "coop-ultimate-cue";
            const string locale = "aetheria.campaign.language";
            const BindingFlags instance = BindingFlags.Instance | BindingFlags.NonPublic;
            var oldLocale = PlayerPrefs.GetString(locale);
            var hadLocale = PlayerPrefs.HasKey(locale);
            var oldMotion = WorldPresentationSettings.ReducedMotion;
            var timeScale = Time.timeScale;
            var match = Guid.NewGuid();
            var commandId = Guid.Parse("12121212-1212-1212-1212-121212121212");
            var go = new GameObject("committed-ultimate-test");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            var origin = new Uri("https://localhost");
            using var session = new CoopNativePlaySession(new PlatformSession(origin),
                new NativeConnection(new Uri("wss://localhost/rt/v1"), origin, Enumerable.Repeat((byte)1, 32).ToArray(), Guid.NewGuid(),
                    _ => throw new AssertionException("This fixture only exercises projection and receipt consumption.")),
                match, solo ? CoopNativeView.FunctionalSoloRuleset : CoopNativeView.Ruleset);
            try
            {
                PlayerPrefs.SetString(locale, "vi");
                WorldPresentationSettings.ReducedMotion = true;
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = settings;
                var hud = go.AddComponent<CoopNativeHud>();
                hud.enabled = false;
                hud.Attach(document);
                var root = document.rootVisualElement;
                var projection = Projection(withAbilities: true, timed: true, solo: solo);
                var bytes = Encoding.UTF8.GetBytes(projection);
                var stateField = typeof(NativePlaySession).GetField("state", instance);
                var decode = typeof(CoopNativePlaySession).GetMethod("Decode", instance);
                var decodeCommitted = typeof(NativePlaySession).GetMethod("DecodeCommitted", instance);
                PlayState Read(ulong version) => (PlayState)decode.Invoke(session, new object[] { version, bytes });
                var envelope = new ServerEnvelope {
                    CommandId = ByteString.CopyFrom(commandId.ToByteArray()),
                    CanonicalVersion = 2,
                    Receipt = new Receipt { AuthorizedProjection = ByteString.CopyFrom(bytes) },
                };
                GameCommand Command(ulong before, byte[] action) =>
                    new GameCommand(commandId, match, before, CoopNativeIntent.Kind, action);
                PlayState Commit(GameCommand command) =>
                    (PlayState)decodeCommitted.Invoke(session, new object[] { envelope, command });
                void Deliver(PlayState state)
                {
                    stateField.SetValue(session, state);
                    hud.SetSettlementLoader(null);
                }

                stateField.SetValue(session, Read(1));
                hud.Bind(session);
                Assert.That(root.Q(name), Is.Null);
                var ultimate = CoopNativeIntent.UltimateAction(1);
                var rejected = Assert.Throws<TargetInvocationException>(() => Commit(Command(1, ultimate)));
                Assert.That(rejected.InnerException, Is.TypeOf<NativeFailure>(), "A read receipt cannot authorize the cue.");
                envelope.Receipt.Committed = true;
                var expectedId = envelope.CommandId;
                envelope.CommandId = ByteString.CopyFrom(new byte[16]);
                rejected = Assert.Throws<TargetInvocationException>(() => Commit(Command(1, ultimate)));
                Assert.That(rejected.InnerException, Is.TypeOf<NativeFailure>(), "Another command cannot authorize the cue.");
                envelope.CommandId = expectedId;
                Deliver(Commit(Command(1, CoopNativeIntent.SignatureAction(1))));
                Assert.That(root.Q(name), Is.Null);

                envelope.CanonicalVersion = 3;
                var accepted = Commit(Command(2, ultimate));
                Assert.That(accepted.HasCommittedUltimate, Is.True);
                Deliver(accepted);
                var cue = root.Q<Label>(name);
                Assert.That(cue?.text, Is.EqualTo("Kỹ năng tối thượng"));
                Assert.That(cue.pickingMode, Is.EqualTo(PickingMode.Ignore));
                Assert.That(root.Q<Label>(CoopNativePresentation.TurnName), Is.Not.Null);
                Assert.That(Time.timeScale, Is.EqualTo(timeScale));
                Deliver(accepted);
                Assert.That(root.Q(name), Is.SameAs(cue), "The same version cannot replace or restart a cue.");

                typeof(CoopNativeHud).GetField("ultimateCueUntil", instance).SetValue(hud, Time.unscaledTime);
                typeof(CoopNativeHud).GetMethod("Update", instance).Invoke(hud, null);
                Deliver(accepted);
                Assert.That(root.Q(name), Is.Null);
                Deliver(Read(4));
                Assert.That(root.Q(name), Is.Null);
                envelope.CanonicalVersion = 6;
                Deliver(Commit(Command(4, ultimate)));
                Assert.That(root.Q(name), Is.Null, "Skipped versions are not a freshly observed commit.");
            }
            finally
            {
                WorldPresentationSettings.ReducedMotion = oldMotion;
                if (hadLocale) PlayerPrefs.SetString(locale, oldLocale);
                else PlayerPrefs.DeleteKey(locale);
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        private static string AdvancedProjection(string[] jewels, int multiplierCell = 0) =>
            Projection(elements: jewels, withAbilities: true, timed: true, multiplierCell: multiplierCell)
                .Replace("\"version\":3", "\"version\":4")
                .Replace("\"pending\":null", "\"pending\":null,\"chillReductionPm\":0");

        private static string Projection(string pending = "null", int health = 400,
            int shield = 0, int shieldTurns = 0, int round = 1, string[] elements = null, int firstMultiplier = 2,
            bool withAbilities = false, bool timed = false, int multiplierCell = 0, bool solo = false)
        {
            elements ??= new[] { "fire" };
            var board = new System.Text.StringBuilder();
            for (var index = 0; index < 64; index += 1)
            {
                if (index > 0) board.Append(',');
                board.Append(index < elements.Length
                    ? "{\"" + (timed ? "kind" : "element") + "\":\"" + elements[index] + "\",\"multiplier\":" + (index == multiplierCell ? firstMultiplier : 1) + "}"
                    : "null");
            }
            var seats = new System.Text.StringBuilder();
            var pets = new[] { "icarus", "coralline", "volt", "terran" };
            for (var index = 0; index < (solo ? 1 : 4); index += 1)
            {
                if (index > 0) seats.Append(',');
                seats.Append("{\"seat\":").Append(index).Append(",\"petId\":\"").Append(pets[index])
                    .Append("\",\"level\":1,\"hp\":").Append(index == 0 ? health : 400)
                    .Append(",\"maxHp\":400,\"attack\":40,\"defense\":4")
                    .Append(",\"critRateBp\":500,\"critDamageBp\":15000,\"mana\":0,\"rage\":0")
                    .Append(",\"shield\":").Append(index == 0 ? shield : 0)
                    .Append(",\"shieldTurns\":").Append(index == 0 ? shieldTurns : 0)
                    .Append(",\"cooldowns\":[0,0,0,0,0]")
                    .Append(",\"statuses\":[],\"contribution\":{\"damage\":0,\"healing\":0,\"shielding\":0}")
                    .Append(",\"alive\":true");
                if (timed)
                    seats.Append(",\"hasUltimate\":true,\"ultimateReady\":false,\"fireZoneTurns\":0,\"passives\":[]");
                seats.Append('}');
            }
            var abilities = "";
            if (withAbilities)
            {
                var kinds = new[] { "guard", "skill", "signature", "ultimate" };
                var ids = new[] { "guard", "ember-lance", "ember-solar-flare", "blazing-descent" };
                var fields = timed ? ",\"maxCooldown\":5,\"effectKind\":\"damage\",\"target\":\"boss\",\"powerPm\":1000" : "";
                abilities = ",\"bossId\":\"cinder-terraces-warden\",\"abilities\":[" +
                    string.Join(",", kinds.Select((kind, position) =>
                        "{\"kind\":\"" + kind + "\",\"id\":\"icarus-" + ids[position] +
                        "\",\"mana\":180,\"rage\":160,\"cooldown\":5,\"ready\":false" + fields + "}")) + "]";
            }
            var timer = timed ? ",\"turnTimeoutMs\":15000,\"turnDeadlineUnixMs\":1015000,\"turnRemainingMs\":15000," +
                "\"serverUnixMs\":1000000,\"maxRounds\":null,\"canEndTurn\":true,\"fireZoneActiveTurns\":0,\"fireZoneCells\":[]" : "";
            return "{\"state\":{\"schemaVersion\":1,\"ruleset\":{\"id\":\"" +
                (solo ? CoopNativeView.FunctionalSoloRuleset : CoopNativeView.Ruleset) + "\",\"version\":" +
                (timed ? (solo ? 2 : 3) : 1) + "," +
                "\"contentHash\":\"" + new string('a', 64) + "\",\"configDigest\":\"" + new string('b', 64) + "\"}," +
                "\"you\":0,\"phase\":\"playing\",\"activeSeat\":0,\"turn\":0,\"round\":" + round + "," +
                "\"boss\":{\"hp\":5000,\"maxHp\":5000,\"phase\":1,\"shield\":0,\"armorBreakPm\":0,\"dotDamage\":0,\"dotTurns\":0,\"transformed\":false}," +
                "\"board\":[" + board + "],\"participants\":[" + seats + "],\"pending\":" + pending + abilities + timer + "}," +
                "\"epoch\":1,\"reward\":null}";
        }
    }
}
