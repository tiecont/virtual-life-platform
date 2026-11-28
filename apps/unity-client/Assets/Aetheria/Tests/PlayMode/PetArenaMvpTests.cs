using System.Collections;
using Aetheria.PetArena.Domain;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Aetheria.Tests.PlayMode
{
    public sealed class PetArenaMvpTests
    {
        [UnityTest]
        public IEnumerator BuildsPlayableStageAndEvolutionReference()
        {
            const string scenePath = "Assets/Aetheria/Scenes/PetArenaPve.unity";
            var load = SceneManager.LoadSceneAsync(scenePath, LoadSceneMode.Additive);
            Assert.That(load, Is.Not.Null);
            yield return load;
            var scene = SceneManager.GetSceneByPath(scenePath);
            try
            {
                var controller = scene.GetRootGameObjects()[0].GetComponent<PetArenaMvpController>();
                Assert.That(controller, Is.Not.Null);
                Assert.That(controller.Battle, Is.Not.Null);
                Assert.That(controller.Battle.Phase, Is.EqualTo(ArenaPhase.Intro));
                Assert.That(controller.PlayerEvolution, Is.Not.Null);
                Assert.That(ArenaBattle.BoardSize, Is.EqualTo(8));
                Assert.That(GameObject.Find("8x8 Arena Board"), Is.Not.Null);
                Assert.That(controller.Perform(ArenaAction.Intro).Accepted, Is.True);
                Assert.That(controller.SelectEnemy(PetElement.Water), Is.False);
                Assert.That(controller.Perform(ArenaAction.Normal).Accepted, Is.True);
                controller.SetLevel(60);
                Assert.That(controller.PlayerEvolution.Wings.gameObject.activeSelf, Is.False);
                Assert.That(controller.PlayerEvolution.Halo.gameObject.activeSelf, Is.False);
                controller.SetLevel(20);
                Assert.That(controller.PlayerEvolution.Halo.gameObject.activeSelf, Is.False);
                controller.ResetBattle();
                Assert.That(controller.Battle.Phase, Is.EqualTo(ArenaPhase.Intro));
            }
            finally
            {
                SceneManager.UnloadSceneAsync(scene);
            }
        }
    }
}
