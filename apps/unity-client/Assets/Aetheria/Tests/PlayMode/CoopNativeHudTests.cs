using System;
using System.Collections;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using Aetheria.Networking;
using Aetheria.PetArena.Presentation;
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
                var view = CoopNativeView.Decode(3, System.Text.Encoding.UTF8.GetBytes(Projection()));
                hud.Render(view);
                yield return null;
                yield return null;

                var scroll = root.Q<ScrollView>("coop-hud-scroll");
                var footer = root.Q("coop-footer");
                var lastCell = scroll.Q<Button>("coop-cell-63");
                var actions = scroll.Q("coop-actions");
                Assert.That(lastCell.worldBound.height, Is.GreaterThan(0));
                Assert.That(lastCell.worldBound.yMax, Is.LessThanOrEqualTo(actions.worldBound.yMin));
                Assert.That(footer.worldBound.yMax, Is.LessThanOrEqualTo(root.worldBound.yMax));
                Assert.That(scroll.worldBound.yMax, Is.LessThanOrEqualTo(footer.worldBound.yMin));

                scroll.ScrollTo(lastCell);
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

        [UnityTest]
        public IEnumerator LateReceiptFromPreviousRoomCannotReplaceCurrentReward()
        {
            var go = new GameObject("coop-receipt-test");
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            try
            {
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = settings;
                var hud = go.AddComponent<CoopNativeHud>();
                hud.Attach(document);
                var terminal = Projection().Replace("\"playing\"", "\"won\"").Replace("\"hp\":5000", "\"hp\":0");
                var view = CoopNativeView.Decode(9, System.Text.Encoding.UTF8.GetBytes(terminal));
                var old = new TaskCompletionSource<CoopLobbyClient.Reward>();
                var current = new TaskCompletionSource<CoopLobbyClient.Reward>();
                hud.Bind(null);
                hud.SetRewardLoader(() => old.Task);
                hud.Render(view);
                hud.Bind(null);
                hud.SetRewardLoader(() => current.Task);
                hud.Render(view);
                current.SetResult(new CoopLobbyClient.Reward { coins = 70 });
                yield return null;
                old.SetResult(new CoopLobbyClient.Reward { coins = 3 });
                yield return null;
                hud.Render(view);
                Assert.That(document.rootVisualElement.Q<Label>("coop-reward").text, Does.Contain("70 coins"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(settings);
            }
        }

        private static string Projection(string pending = "null")
        {
            var board = new System.Text.StringBuilder();
            for (var index = 0; index < 64; index += 1)
            {
                if (index > 0) board.Append(',');
                board.Append(index == 0 ? "{\"element\":\"fire\",\"multiplier\":2}" : "null");
            }
            var seats = new System.Text.StringBuilder();
            var pets = new[] { "icarus", "coralline", "volt", "terran" };
            for (var index = 0; index < 4; index += 1)
            {
                if (index > 0) seats.Append(',');
                seats.Append("{\"seat\":").Append(index).Append(",\"petId\":\"").Append(pets[index])
                    .Append("\",\"level\":1,\"hp\":400,\"maxHp\":400,\"attack\":40,\"defense\":4")
                    .Append(",\"critRateBp\":500,\"critDamageBp\":15000,\"mana\":0,\"rage\":0")
                    .Append(",\"shield\":0,\"shieldTurns\":0,\"cooldowns\":[0,0,0,0,0]")
                    .Append(",\"statuses\":[],\"contribution\":{\"damage\":0,\"healing\":0,\"shielding\":0}")
                    .Append(",\"alive\":true}");
            }
            return "{\"state\":{\"schemaVersion\":1,\"ruleset\":{\"id\":\"arena8-coop-pve\",\"version\":1," +
                "\"contentHash\":\"" + new string('a', 64) + "\",\"configDigest\":\"" + new string('b', 64) + "\"}," +
                "\"you\":0,\"phase\":\"playing\",\"activeSeat\":0,\"turn\":0,\"round\":1," +
                "\"boss\":{\"hp\":5000,\"maxHp\":5000,\"phase\":1,\"shield\":0,\"armorBreakPm\":0,\"dotDamage\":0,\"dotTurns\":0,\"transformed\":false}," +
                "\"board\":[" + board + "],\"participants\":[" + seats + "],\"pending\":" + pending + "}," +
                "\"epoch\":1,\"reward\":null}";
        }
    }
}
