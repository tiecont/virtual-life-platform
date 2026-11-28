using System;
using System.Collections;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Aetheria.Tests.PlayMode
{
    // Play-mode coverage for the native Arena8 consumer: the 64-cell board and
    // skill HUD render the committed projection, and an invalid admission fails
    // closed before any network I/O. No live services are required.
    public sealed class Arena8NativePresentationTests
    {
        [Test]
        public void BoardRendersSixtyFourCommittedCells()
        {
            var view = View(playing: true);
            var selected = -1;
            var board = Arena8NativePresentation.BuildBoard(view, 2, cell => selected = cell);
            var cells = board.Query<Button>().ToList();
            Assert.That(cells.Count, Is.EqualTo(64));
            Assert.That(cells.Select(button => button.name).Distinct().Count(), Is.EqualTo(64));
            Assert.That(cells[0].name, Is.EqualTo("arena8-cell-0"));
            Assert.That(cells[63].name, Is.EqualTo("arena8-cell-63"));
            Assert.That(cells[0].text, Is.EqualTo("Fire"));
            Assert.That(cells[1].text, Is.EqualTo("Water"));
            Assert.That(cells[2].text, Is.EqualTo("Electric"));
            Assert.That(cells[2].style.borderBottomWidth.value, Is.EqualTo(4f), "Selection is a local highlight only");
            Assert.That(cells[0].style.borderBottomWidth.value, Is.Not.EqualTo(4f));
            Assert.That(selected, Is.EqualTo(-1), "Rendering a board never sends an intent");
        }

        [Test]
        public void SkillHudReflectsCommittedResources()
        {
            var view = View(playing: true);
            var cast = "";
            var hud = Arena8NativePresentation.BuildSkills(view, id => cast = id);
            var skills = hud.Children().OfType<Button>().ToList();
            Assert.That(skills.Select(button => button.name),
                Is.EqualTo(new[] { "arena8-skill-shared-skill", "arena8-skill-signature", "arena8-skill-ultimate", "arena8-skill-guard" }));
            Assert.That(skills[0].enabledSelf, Is.False, "No mana is committed yet");
            Assert.That(skills[0].text, Does.Contain("needs mana/rage"));
            Assert.That(skills[3].enabledSelf, Is.True, "Guard has no resource cost");
            Assert.That(skills[3].text, Is.EqualTo("Guard"));
            Assert.That(cast, Is.Empty, "Building the HUD casts nothing");
        }

        [Test]
        public void SkillHudEnablesCommittedAffordances()
        {
            var view = View(playing: true, mana: 300, rage: 200);
            var hud = Arena8NativePresentation.BuildSkills(view, _ => { });
            var skills = hud.Children().OfType<Button>().ToList();
            Assert.That(skills.All(button => button.enabledSelf), Is.True);
            Assert.That(skills[2].text, Is.EqualTo("Ultimate"));
        }

        [UnityTest]
        public IEnumerator ExpiredAdmissionFailsClosedBeforeNetworkIo()
        {
            using var platform = new PlatformSession(new Uri("https://localhost"));
            using var connection = new NativeConnection(new Uri("wss://localhost/rt/v1"), new Uri("https://localhost"),
                Enumerable.Repeat((byte)0x53, 32).ToArray(), Guid.NewGuid(),
                _ => Task.FromResult(new AdmissionTicket("secret-ticket", "principal", DateTimeOffset.UtcNow.AddSeconds(-1))));
            using var session = new Arena8NativePlaySession(platform, connection, Guid.NewGuid());
            var task = session.ConnectAsync();
            while (!task.IsCompleted) yield return null;
            Assert.That(task.IsFaulted, Is.True);
            var failure = (NativeFailure)task.Exception.GetBaseException();
            Assert.That(failure.Reason, Is.EqualTo(Failure.Authentication));
            Assert.That(failure.Message, Does.Not.Contain("secret-ticket"));
            Assert.That(session.State, Is.Null);
            Assert.That(session.HasPendingCommand, Is.False);
        }

        private static Arena8NativeView View(bool playing, int mana = 0, int rage = 0)
        {
            var board = new int[64];
            for (var y = 0; y < 8; y++)
                for (var x = 0; x < 8; x++)
                    board[y * 8 + x] = (x + 2 * y) % 6;
            var telegraph = playing
                ? "{\"kind\":\"assault\",\"axis\":\"row\",\"target\":0,\"announcedTurn\":0,\"resolvesTurn\":1,"
                    + "\"cells\":[0,1,2,3,4,5,6,7]}"
                : "null";
            var json = "{\"state\":{"
                + "\"schemaVersion\":1,"
                + "\"ruleset\":{\"id\":\"arena8-pve\",\"version\":1,\"reducerId\":\"aetheria-pet-arena-arena8\","
                + "\"contentHash\":\"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20\","
                + "\"bindingId\":\"arena8-content-binding\",\"bindingVersion\":1,"
                + "\"bindingDigest\":\"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\","
                + "\"rosterVersion\":\"arena8-roster-v1\","
                + "\"rulesDigest\":\"f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff0\"},"
                + "\"pet\":{\"id\":\"icarus\",\"name\":\"Icarus\",\"family\":\"emberling\",\"element\":\"fire\","
                + "\"level\":20,\"ownedPetId\":\"33333333-3333-4333-8333-333333333333\"},"
                + "\"stats\":{\"base\":{\"health\":180,\"attack\":20,\"defense\":10},"
                + "\"grown\":{\"health\":200,\"attack\":22,\"defense\":12},"
                + "\"effective\":{\"health\":220,\"attack\":24,\"defense\":14}},"
                + "\"artifacts\":[],"
                + "\"modifiers\":{"
                + "\"hp\":{\"value\":4,\"active\":true,\"effect\":\"health\",\"reason\":\"adds to maximum and starting health\"},"
                + "\"attack\":{\"value\":2,\"active\":true,\"effect\":\"attack\",\"reason\":\"adds to attack\"},"
                + "\"defense\":{\"value\":1,\"active\":true,\"effect\":\"defense\",\"reason\":\"adds to defense\"},"
                + "\"speed\":{\"value\":1,\"active\":false,\"effect\":\"inactive\",\"reason\":\"arena8 has no initiative\"}},"
                + "\"skills\":[\"shared-skill\",\"signature\",\"ultimate\",\"guard\"],"
                + "\"encounter\":{\"index\":0,\"id\":\"cinder-terraces-regular\",\"revision\":1,\"boss\":false,\"element\":\"fire\"},"
                + "\"phase\":\"" + (playing ? "playing" : "ready") + "\",\"turn\":0,"
                + "\"board\":[" + string.Join(",", board) + "],"
                + "\"health\":" + (playing ? 200 : 220) + ",\"enemyHealth\":160,\"enemyShield\":0,"
                + "\"mana\":" + mana + ",\"rage\":" + rage + ",\"cooldown\":0,\"fireZoneTurns\":0,"
                + "\"telegraph\":" + telegraph + ","
                + "\"snapshotDigest\":\"101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f\"},"
                + "\"epoch\":1,\"reward\":null}";
            return Arena8NativeView.Decode(playing ? 1UL : 0UL, Encoding.UTF8.GetBytes(json));
        }
    }
}
