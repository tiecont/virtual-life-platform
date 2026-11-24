using Aetheria.PetArena.Domain;
using NUnit.Framework;

namespace Aetheria.Tests.EditMode
{
    public sealed class PetArenaCombatTests
    {
        [Test]
        public void SixElementMatrixCoversAllThirtySixPairs()
        {
            var strong = 0;
            var resisted = 0;
            for (var attacker = 0; attacker < ElementalMatchup.ElementCount; attacker++)
            for (var defender = 0; defender < ElementalMatchup.ElementCount; defender++)
            {
                var value = ElementalMatchup.Compare((PetElement)attacker, (PetElement)defender);
                if (value == ElementEffectiveness.Strong) strong++;
                if (value == ElementEffectiveness.Resisted) resisted++;
                Assert.That(ElementalMatchup.ScaleDamage(12, value), Is.GreaterThan(0));
            }
            Assert.That(strong, Is.GreaterThanOrEqualTo(6));
            Assert.That(resisted, Is.GreaterThanOrEqualTo(6));
            Assert.That(ElementalMatchup.Compare(PetElement.Fire, PetElement.Grass),
                Is.EqualTo(ElementEffectiveness.Strong));
            Assert.That(ElementalMatchup.Compare(PetElement.Fire, PetElement.Ice),
                Is.EqualTo(ElementEffectiveness.Strong));
            Assert.That(ElementalMatchup.Compare(PetElement.Fire, PetElement.Water),
                Is.EqualTo(ElementEffectiveness.Resisted));
            Assert.That(ElementalMatchup.Compare(PetElement.Normal, PetElement.Fire),
                Is.EqualTo(ElementEffectiveness.Neutral));
        }

        [Test]
        public void IntroAndRageGatesFailClosed()
        {
            var battle = new ArenaBattle();
            Assert.That(battle.Perform(ArenaAction.Normal).Accepted, Is.False);
            Assert.That(battle.Perform(ArenaAction.Intro).Accepted, Is.True);
            Assert.That(battle.Phase, Is.EqualTo(ArenaPhase.PlayerTurn));
            Assert.That(battle.Perform(ArenaAction.Intro).Accepted, Is.False);
            Assert.That(battle.Perform(ArenaAction.Rage).Accepted, Is.False);
            Assert.That(battle.Perform(ArenaAction.Signature).Accepted, Is.False);
        }

        [Test]
        public void SignatureCreatesFourByFourFireZoneForTwoTurns()
        {
            var battle = new ArenaBattle(PetElement.Water, PetElement.Fire, 1000, 500, 2);
            battle.Perform(ArenaAction.Intro);
            battle.Perform(ArenaAction.Normal);
            battle.Perform(ArenaAction.Normal);
            battle.Perform(ArenaAction.Normal);
            Assert.That(battle.Rage, Is.EqualTo(100));
            var signature = battle.Perform(ArenaAction.Signature);
            Assert.That(signature.Accepted, Is.True);
            Assert.That(signature.Effectiveness, Is.EqualTo(ElementEffectiveness.Resisted));
            Assert.That(battle.FireZoneTurnsRemaining, Is.EqualTo(2));
            Assert.That(battle.IsFireZoneCell(3, 3), Is.True);
            Assert.That(battle.IsFireZoneCell(6, 6), Is.True);
            Assert.That(battle.IsFireZoneCell(7, 6), Is.False);
            battle.Perform(ArenaAction.Normal);
            Assert.That(battle.FireZoneTurnsRemaining, Is.EqualTo(1));
            battle.Perform(ArenaAction.Normal);
            Assert.That(battle.HasFireZone, Is.False);
        }

        [Test]
        public void DeterministicTurnsReachVictoryOrDefeat()
        {
            var victory = new ArenaBattle(PetElement.Grass, PetElement.Fire, 120, 40, 5);
            victory.Perform(ArenaAction.Intro);
            Assert.That(victory.Perform(ArenaAction.Normal).Damage, Is.EqualTo(18));
            Assert.That(victory.Perform(ArenaAction.Normal).Accepted, Is.True);
            Assert.That(victory.Perform(ArenaAction.Normal).Accepted, Is.True);
            Assert.That(victory.Phase, Is.EqualTo(ArenaPhase.Victory));
            Assert.That(victory.EnemyHealth, Is.Zero);
            Assert.That(victory.Perform(ArenaAction.Normal).Accepted, Is.False);

            var defeat = new ArenaBattle(PetElement.Grass, PetElement.Fire, 8, 500, 20);
            defeat.Perform(ArenaAction.Intro);
            defeat.Perform(ArenaAction.Normal);
            Assert.That(defeat.Phase, Is.EqualTo(ArenaPhase.Defeat));
            Assert.That(defeat.PlayerHealth, Is.Zero);
        }

        [Test]
        public void OpponentSelectionAndResetAreBoundedToIntro()
        {
            var battle = new ArenaBattle();
            Assert.That(battle.SelectEnemyElement(PetElement.Electric), Is.True);
            Assert.That(battle.EnemyElement, Is.EqualTo(PetElement.Electric));
            battle.Perform(ArenaAction.Intro);
            Assert.That(battle.SelectEnemyElement(PetElement.Ice), Is.False);
            battle.Reset(PetElement.Water);
            Assert.That(battle.Phase, Is.EqualTo(ArenaPhase.Intro));
            Assert.That(battle.EnemyElement, Is.EqualTo(PetElement.Water));
            Assert.That(battle.Turn, Is.Zero);
            Assert.That(battle.Rage, Is.Zero);
            Assert.That(battle.HasFireZone, Is.False);
        }
    }
}
