using System;
using System.Collections;
using System.Linq;
using System.Threading;
using Aetheria.PetArena.Infrastructure;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Aetheria.Tests.PlayMode
{
    public sealed class Wave1CampaignTests
    {
        private const string ScenePath = "Assets/Aetheria/Scenes/PetArenaPve.unity";
        private VisualElement root;

        [UnitySetUp]
        public IEnumerator OpenArena()
        {
            Assert.That(Environment.GetEnvironmentVariable("AETHERIA_WAVE1_API"), Is.Not.Null);
            yield return SceneManager.LoadSceneAsync(ScenePath, LoadSceneMode.Additive);
            var document = SceneManager.GetSceneByPath(ScenePath).GetRootGameObjects()[0].GetComponent<UIDocument>();
            Assert.That(document, Is.Not.Null);
            root = document.rootVisualElement;
        }

        [UnityTearDown]
        public IEnumerator CloseArena()
        {
            if (SceneManager.GetSceneByPath(ScenePath).isLoaded)
                yield return SceneManager.UnloadSceneAsync(ScenePath);
        }

        [UnityTest, Explicit("Run through scripts/wave1-unity-smoke.mjs with a disposable database.")]
        public IEnumerator PlaysAndSavesTheCampaign()
        {
            yield return Press("enter-guest");
            yield return Press("choose-map");
            Assert.That(root.Q<Button>("map-tideglass-lagoon").enabledSelf, Is.False);
            yield return Press("map-cinder-terraces");
            for (var turn = 0; turn < 4; turn++) yield return Press("attack");
            yield return Press("fight-boss");
            for (var turn = 0; turn < 9; turn++) yield return Press("attack");
            yield return Press("finish-map");
            yield return WaitFor(() => HasText("Victory"), "victory");
            Assert.That(HasText("+500 EXP"), Is.True);
            Assert.That(HasText("Recruited Emberloom"), Is.True);
            yield return Press("reward-evolution");
            Assert.That(HasText("Coalwhisk · Fire · Lv 10"), Is.True);
            yield return AssertCommittedStage("fire-coalwhisk", 0);
            yield return Press("evolution-back");
            yield return Press("open-gacha");
            yield return Press("pull-ten");
            yield return WaitFor(() => HasText("7200 coins") && HasText("#10 · Icarus"), "gacha receipt");
            yield return Press("gacha-back");
            yield return Press("party-pet-v3-fire-icarus");
            yield return Press("choose-map");
            yield return WaitFor(() => root.Q<Button>("active-pet-v3-fire-icarus") != null, "saved four-Pet party");
            Assert.That(root.Q<Button>("map-tideglass-lagoon").enabledSelf, Is.True);
        }

        [UnityTest, Explicit("Run after PlaysAndSavesTheCampaign through scripts/wave1-unity-smoke.mjs.")]
        public IEnumerator ReopensWithPersistedSessionAndState()
        {
            yield return WaitFor(() => root.Q<Button>("choose-map") != null, "resumed lobby");
            Assert.That(HasText("7200 coins"), Is.True);
            Assert.That(root.Q<Button>("party-fire-emberloom"), Is.Not.Null);
            Assert.That(root.Q<Button>("party-pet-v3-fire-icarus").text, Does.StartWith("4. "));
            yield return Press("open-evolution");
            yield return Press("evolution-pet-v3-fire-icarus");
            Assert.That(HasText("Icarus · Fire · Lv 22"), Is.True);
            Assert.That(HasText("Lv 20 · Power skill & Artifact B eligibility ✓"), Is.True);
            yield return AssertCommittedStage("pet-v3-fire-icarus", 1);
            yield return Press("evolution-back");
            yield return Press("choose-map");
            Assert.That(root.Q<Button>("map-cinder-terraces").text, Does.EndWith("Replay"));
            Assert.That(root.Q<Button>("map-tideglass-lagoon").enabledSelf, Is.True);
        }

        private static IEnumerator AssertCommittedStage(string petId, int expectedStage)
        {
            using var api = new Wave1LocalApi(Environment.GetEnvironmentVariable("AETHERIA_WAVE1_API"),
                Environment.GetEnvironmentVariable("AETHERIA_WAVE1_WEB_ORIGIN"), Application.persistentDataPath);
            Assert.That(api.LoadSession(), Is.True, "The campaign saved its authenticated session.");
            var request = api.GetWave1State(CancellationToken.None);
            yield return WaitFor(() => request.IsCompleted, "committed Pet progression");
            var pet = request.GetAwaiter().GetResult().FindPet(petId);
            Assert.That(pet, Is.Not.Null, petId);
            Assert.That(pet.stage, Is.EqualTo(expectedStage), petId);
        }

        private IEnumerator Press(string name)
        {
            yield return WaitFor(() => root.Q<Button>(name)?.enabledSelf == true, name);
            var button = root.Q<Button>(name);
            using var submit = NavigationSubmitEvent.GetPooled();
            submit.target = button;
            button.SendEvent(submit);
            yield return null;
        }

        private bool HasText(string text) => root.Query<Label>().ToList().Any(label =>
            label.text != null && label.text.Contains(text, StringComparison.Ordinal));

        private static IEnumerator WaitFor(Func<bool> predicate, string expected)
        {
            var deadline = Time.realtimeSinceStartup + 10f;
            while (!predicate() && Time.realtimeSinceStartup < deadline) yield return null;
            Assert.That(predicate(), Is.True, "Timed out waiting for " + expected);
        }
    }
}
