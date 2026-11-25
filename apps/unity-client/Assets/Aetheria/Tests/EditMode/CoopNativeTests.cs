using System;
using System.Linq;
using System.Text;
using Aetheria.Networking;
using NUnit.Framework;

namespace Aetheria.Tests
{
    // Strict contract tests for the canonical coop projection consumer and the
    // bounded coop intent writer. They never open a socket or start a runtime.
    public sealed class CoopNativeTests
    {
        private const string Hash = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        private const string Digest = "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f";

        [Test]
        public void ReadyProjectionDecodesParticipantsAndBoard()
        {
            var view = Coop(version: 7);
            Assert.That(view.Version, Is.EqualTo(7));
            Assert.That(view.Phase, Is.EqualTo("ready"));
            Assert.That(view.You, Is.Zero);
            Assert.That(view.ActiveSeat, Is.Zero);
            Assert.That(view.Round, Is.EqualTo(1));
            Assert.That(view.Board.Count, Is.EqualTo(64));
            Assert.That(view.Board[0].Element, Is.EqualTo("fire"));
            Assert.That(view.Board[0].Multiplier, Is.EqualTo(2));
            Assert.That(view.Board[1].Element, Is.EqualTo("water"));
            Assert.That(view.Board[1].Multiplier, Is.EqualTo(1));
            Assert.That(view.Board[2], Is.Null);
            Assert.That(view.Participants.Count, Is.EqualTo(4));
            Assert.That(view.Participants[3].Seat, Is.EqualTo(3));
            Assert.That(view.Participants[3].PetId, Is.EqualTo("terran"));
            Assert.That(view.Own.Cooldowns.Count, Is.EqualTo(5));
            Assert.That(view.BossState.Health, Is.EqualTo(5000));
            Assert.That(view.PendingAttack, Is.Null);
            Assert.That(view.Terminal, Is.False);
            Assert.That(view.RulesetId, Is.EqualTo("arena8-coop-pve"));
            Assert.That(view.CanSwap(0, 1), Is.True);
            Assert.That(view.CanSwap(0, 9), Is.False);
        }

        [Test]
        public void TerminalProjectionCarriesTheRewardState()
        {
            var view = Coop(phase: "won", reward: "\"REWARD_PENDING\"", bossHealth: 0);
            Assert.That(view.Terminal, Is.True);
            Assert.That(view.Reward, Is.EqualTo("REWARD_PENDING"));
        }

        [Test]
        public void ProjectionRejectsUnknownFieldsAndInvalidSeats()
        {
            Assert.Throws<FormatException>(() => Coop(extra: "\"extra\":1,"));
            Assert.Throws<FormatException>(() => Coop(seats: 3));
            Assert.Throws<FormatException>(() => Coop(board: 63));
            Assert.Throws<FormatException>(() => Coop(you: 4));
        }

        [Test]
        public void IntentWriterIsClosedAndBounded()
        {
            CollectionAssert.AreEqual(Encoding.UTF8.GetBytes("{\"epoch\":1,\"action\":{\"kind\":\"guard\"}}"),
                CoopNativeIntent.GuardAction(1));
            CollectionAssert.AreEqual(Encoding.UTF8.GetBytes("{\"epoch\":2,\"action\":{\"kind\":\"swap\",\"first\":0,\"second\":1}}"),
                CoopNativeIntent.SwapAction(2, 0, 1));
            Assert.Throws<ArgumentException>(() => CoopNativeIntent.GuardAction(0));
            Assert.Throws<ArgumentException>(() => CoopNativeIntent.SwapAction(1, 0, 0));
            Assert.Throws<ArgumentException>(() => CoopNativeIntent.SwapAction(1, 0, 64));
        }

        private static CoopNativeView Coop(ulong version = 0, string phase = "ready", string reward = "null",
            int bossHealth = 5000, int you = 0, int seats = 4, int board = 64, string extra = "")
        {
            var boardJson = new StringBuilder();
            for (var index = 0; index < board; index += 1)
            {
                if (index > 0) boardJson.Append(',');
                boardJson.Append(index == 0 ? "{\"element\":\"fire\",\"multiplier\":2}" : index == 1 ? "{\"element\":\"water\",\"multiplier\":1}" : "null");
            }
            var seatsJson = new StringBuilder();
            var pets = new[] { "icarus", "coralline", "volt", "terran" };
            for (var index = 0; index < seats; index += 1)
            {
                if (index > 0) seatsJson.Append(',');
                seatsJson.Append("{\"seat\":").Append(index)
                    .Append(",\"petId\":\"").Append(pets[index]).Append("\"")
                    .Append(",\"level\":1,\"hp\":400,\"maxHp\":400,\"attack\":40,\"defense\":4")
                    .Append(",\"critRateBp\":500,\"critDamageBp\":15000,\"mana\":0,\"rage\":0")
                    .Append(",\"shield\":0,\"shieldTurns\":0,\"cooldowns\":[0,0,0,0,0]")
                    .Append(",\"statuses\":[],\"contribution\":{\"damage\":0,\"healing\":0,\"shielding\":0}")
                    .Append(",\"alive\":true}");
            }
            var json = "{\"state\":{" + extra + "\"schemaVersion\":1,"
                + "\"ruleset\":{\"id\":\"arena8-coop-pve\",\"version\":1,\"contentHash\":\"" + Hash + "\",\"configDigest\":\"" + Digest + "\"},"
                + "\"you\":" + you + ",\"phase\":\"" + phase + "\",\"activeSeat\":" + you + ","
                + "\"turn\":0,\"round\":1,"
                + "\"boss\":{\"hp\":" + bossHealth + ",\"maxHp\":5000,\"phase\":1,\"shield\":0,\"armorBreakPm\":0,\"dotDamage\":0,\"dotTurns\":0,\"transformed\":false},"
                + "\"board\":[" + boardJson + "],"
                + "\"participants\":[" + seatsJson + "],"
                + "\"pending\":null},"
                + "\"epoch\":1,\"reward\":" + reward + "}";
            return CoopNativeView.Decode(version, Encoding.UTF8.GetBytes(json));
        }
    }
}
