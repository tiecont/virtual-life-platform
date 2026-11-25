using System;
using Aetheria.Networking;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.Tests
{
    // The lobby screen renders only the server room state and exposes create/join
    // before any native admission exists.
    public sealed class CoopCampaignScreenTests
    {
        [Test]
        public void LobbyRendersCreateAndJoinBeforeARoomExists()
        {
            var go = new GameObject("coop-campaign-test");
            try
            {
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
                var screen = go.AddComponent<CoopNativeCampaignScreen>();
                screen.Attach(document);
                using (var platform = new PlatformSession(new Uri("https://fixture.invalid")))
                {
                    screen.Enter(platform, "icarus");
                    var root = document.rootVisualElement;
                    Assert.That(root.Q<Label>("coop-lobby-title").text, Is.EqualTo("Cooperative Arena8"));
                    Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.True);
                    Assert.That(root.Q<Button>("coop-join").enabledSelf, Is.True);
                    Assert.That(root.Q<TextField>("coop-room-id"), Is.Not.Null);
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }
    }
}
