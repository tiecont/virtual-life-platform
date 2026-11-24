using System.Collections;
using Aetheria.PetArena.Domain;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Aetheria.Tests.PlayMode
{
    public sealed class PetArenaMvpTests
    {
        [UnityTest]
        public IEnumerator BuildsPlayableStageAndEvolutionReference()
        {
            var root = new GameObject("Arena test root");
            var controller = root.AddComponent<PetArenaMvpController>();
            yield return null;
            try
            {
                Assert.That(controller.Battle, Is.Not.Null);
                Assert.That(controller.Battle.Phase, Is.EqualTo(ArenaPhase.Intro));
                Assert.That(controller.PlayerEvolution, Is.Not.Null);
                Assert.That(GameObject.Find("10x10 Arena Board"), Is.Not.Null);
                Assert.That(controller.Perform(ArenaAction.Intro).Accepted, Is.True);
                Assert.That(controller.SelectEnemy(PetElement.Water), Is.False);
                Assert.That(controller.Perform(ArenaAction.Normal).Accepted, Is.True);
                controller.SetLevel(60);
                Assert.That(controller.PlayerEvolution.Wings.gameObject.activeSelf, Is.True);
                controller.SetLevel(20);
                Assert.That(controller.PlayerEvolution.Halo.gameObject.activeSelf, Is.False);
                controller.ResetBattle();
                Assert.That(controller.Battle.Phase, Is.EqualTo(ArenaPhase.Intro));
            }
            finally
            {
                Object.Destroy(root);
            }
        }
    }
}
