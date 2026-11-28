using System;
using Aetheria.PetArena.Infrastructure;
using Aetheria.PetArena.Presentation;
using Aetheria.World.Domain;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.Tests
{
    public sealed class CoopCampaignScreenTests
    {
        private const string LockedEncounter =
            "{\"mapId\":\"tideglass-lagoon\",\"mapName\":\"Tideglass Lagoon\",\"bossId\":\"tideglass-lagoon-warden\"," +
            "\"bossName\":\"Lagoon Warden\",\"requiredPoints\":5000,\"eligible\":false," +
            "\"regularEncounterId\":\"tideglass-lagoon-regular\",\"bossEncounterId\":\"tideglass-lagoon-boss\"," +
            "\"prerequisite\":{\"mapId\":\"cinder-terraces\",\"mapName\":\"Cinder Terraces\",\"cleared\":false}," +
            "\"recruitment\":{\"regularPetIds\":[\"coralline\"],\"legendaryPetId\":null}}";

        [TestCase(4999, false, false)]
        [TestCase(5000, false, false)]
        [TestCase(4999, true, false)]
        [TestCase(5000, true, true)]
        public void ShowsPublishedHostingRequirements(int points, bool cleared, bool eligible)
        {
            var encounter = LockedEncounter.Replace("\"cleared\":false", cleared ? "\"cleared\":true" : "\"cleared\":false")
                .Replace("\"eligible\":false", eligible ? "\"eligible\":true" : "\"eligible\":false");
            WithLobby(CoopCampaignCatalog.Decode(CatalogJson(points, encounter)), WorldMapCatalog.TideglassLagoon, true, root =>
            {
                Assert.That(root.Q<Label>("coop-availability-boss").text, Is.EqualTo("Boss · Lagoon Warden"));
                Assert.That(root.Q<Label>("coop-availability-points").text,
                    Is.EqualTo("Achievement Points · " + points + " / 5000"));
                Assert.That(root.Q<Label>("coop-availability-points-lock")?.text,
                    Is.EqualTo(points < 5000 ? "Achievement Points still needed · 1" : null));
                Assert.That(root.Q<Label>("coop-availability-map-lock")?.text,
                    Is.EqualTo(cleared ? null : "Clear Cinder Terraces first."));
                Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.EqualTo(eligible));
            });
        }

        [TestCase("vi", "Hãy vượt qua Cinder Terraces trước.")]
        [TestCase("en", "Clear Cinder Terraces first.")]
        [TestCase("ja", "先にCinder Terracesをクリアしてください。")]
        [TestCase("ko", "먼저 Cinder Terraces 지역을 클리어하세요.")]
        [TestCase("zh", "请先通关Cinder Terraces。")]
        public void ShowsTheRequiredMapInTheSelectedLanguage(string language, string expected)
        {
            const string preference = "aetheria.campaign.language";
            var previous = PlayerPrefs.HasKey(preference) ? PlayerPrefs.GetString(preference) : null;
            try
            {
                PlayerPrefs.SetString(preference, language);
                WithLobby(CoopCampaignCatalog.Decode(CatalogJson(5000, LockedEncounter)),
                    WorldMapCatalog.TideglassLagoon, true,
                    root => Assert.That(root.Q<Label>("coop-availability-map-lock").text, Is.EqualTo(expected)));
            }
            finally
            {
                if (previous == null) PlayerPrefs.DeleteKey(preference);
                else PlayerPrefs.SetString(preference, previous);
            }
        }

        [TestCase(false, "Campaign availability could not be loaded.")]
        [TestCase(true, "No published Boss encounter for this map.")]
        public void FailsClosedWhenAvailabilityIsMissing(bool loaded, string expected)
        {
            var catalog = loaded ? CoopCampaignCatalog.Decode(CatalogJson(5000, "")) : null;
            WithLobby(catalog, WorldMapCatalog.TideglassLagoon, true, root =>
            {
                Assert.That(root.Q<Label>("coop-availability-status").text, Is.EqualTo(expected));
                Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.False);
            });
        }

        [TestCase("stormcoil-fields")]
        [TestCase("lantern-necropolis")]
        [TestCase("ochre-labyrinth")]
        [TestCase("dawn-prism-sanctum")]
        public void ExtendedArenaLobbyFollowsPublishedHostingEligibility(string mapId)
        {
            Assert.That(WorldMapCatalog.TryGet(mapId, out var map), Is.True);
            Assert.That(map.IsPlayable, Is.True);
            var locked = LockedEncounter.Replace("tideglass-lagoon", mapId);
            var eligible = locked.Replace("\"cleared\":false", "\"cleared\":true")
                .Replace("\"eligible\":false", "\"eligible\":true");
            WithLobby(CoopCampaignCatalog.Decode(CatalogJson(5000, locked)), map, true, root =>
            {
                Assert.That(root.Q<Label>("coop-availability-map-lock").text, Is.EqualTo("Clear Cinder Terraces first."));
                Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.False);
            });
            WithLobby(CoopCampaignCatalog.Decode(CatalogJson(5000, eligible)), map, true, root =>
            {
                Assert.That(root.Q<Label>("coop-availability-status").text, Is.EqualTo("Hosting requirements met."));
                Assert.That(root.Q<Label>("coop-availability-scene"), Is.Null);
                Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.True);
            });
        }

        [Test]
        public void RequiresAnOwnedInstanceEvenWhenTheEncounterIsEligible()
        {
            var encounter = LockedEncounter.Replace("\"cleared\":false", "\"cleared\":true")
                .Replace("\"eligible\":false", "\"eligible\":true");
            WithLobby(CoopCampaignCatalog.Decode(CatalogJson(5000, encounter)), WorldMapCatalog.TideglassLagoon, false,
                root => Assert.That(root.Q<Button>("coop-create").enabledSelf, Is.False));
        }

        [Test]
        public void RejectsAmbiguousOrIncompleteCatalogData()
        {
            Assert.Throws<FormatException>(() => CoopCampaignCatalog.Decode(
                CatalogJson(4999, LockedEncounter.Replace("\"eligible\":false", "\"eligible\":true"))));
            Assert.Throws<FormatException>(() => CoopCampaignCatalog.Decode(
                CatalogJson(5000, LockedEncounter.Replace(",\"cleared\":false", ""))));
            Assert.Throws<FormatException>(() => CoopCampaignCatalog.Decode(
                CatalogJson(5000, LockedEncounter + "," + LockedEncounter)));
        }

        private static string CatalogJson(int points, string encounters) =>
            "{\"ruleset\":\"arena8-coop-pve\",\"configVersion\":2,\"points\":" + points + ",\"encounters\":[" + encounters + "]}";

        private static void WithLobby(CoopCampaignCatalog catalog, WorldMapDefinition map, bool owned, Action<VisualElement> assert)
        {
            var go = new GameObject("coop-campaign-test");
            var panel = ScriptableObject.CreateInstance<PanelSettings>();
            try
            {
                var document = go.AddComponent<UIDocument>();
                document.panelSettings = panel;
                var screen = go.AddComponent<CoopNativeCampaignScreen>();
                screen.Attach(document);
                using var api = new Wave1LocalApi("http://127.0.0.1:4700", "http://127.0.0.1:3300", Application.temporaryCachePath);
                var pet = new Wave1Pet
                {
                    petId = "icarus", name = "Icarus", level = 1,
                    ownedPetInstanceId = owned ? "11111111-1111-4111-8111-111111111111" : Guid.Empty.ToString()
                };
                screen.Enter(api, new[] { pet }, map, () => { }, catalog);
                var root = document.rootVisualElement;
                Assert.That(root.Q<Label>("coop-lobby-title").text, Is.EqualTo("Cooperative Arena8"));
                Assert.That(root.Q<Label>("coop-lobby-preview").text, Is.EqualTo("Local developer preview"));
                Assert.That(root.Q<Button>("coop-join").enabledSelf, Is.True);
                Assert.That(root.Q<Button>("coop-resume").enabledSelf, Is.True);
                Assert.That(root.Q<TextField>("coop-room-id"), Is.Not.Null);
                assert(root);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(panel);
            }
        }
    }
}
