using System;
using Aetheria.Networking;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine;
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
                var bytes = System.Text.Encoding.UTF8.GetBytes(Projection());
                var view = CoopNativeView.Decode(3, bytes);
                hud.Render(view);
                var root = document.rootVisualElement;
                Assert.That(root, Is.Not.Null);
                Assert.That(root.Q("coop-hud"), Is.Not.Null);
                Assert.That(root.Q<Label>("coop-boss").text, Does.Contain("Boss 5000/5000"));
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        private static string Projection()
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
                "\"board\":[" + board + "],\"participants\":[" + seats + "],\"pending\":null}," +
                "\"epoch\":1,\"reward\":null}";
        }
    }
}
