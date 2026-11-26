using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    // In-player acceptance driver. It is only activated by an explicit command
    // line flag and calls the same Arena8CampaignScreen/HTTP authority path as a
    // human player. It never writes match state, damage or rewards.
    public sealed partial class Arena8CampaignScreen
    {
        [Serializable]
        private sealed class AutomatedFacts
        {
            public string status, matchId, phase, settlement, error;
            public string regularSettlement, bossSettlement, artifactId, nextEffective;
            public int boardTiles, version, coins, regularVersion, bossVersion;
            public bool artifactEquipped, waterAllocated;
            public int inventoryCount, equippedCount;
            public string beforeArtifactEffective, afterArtifactEffective, resumedState;
            public string[] skills;
        }

        private string captureDirectory;
        private AutomatedFacts automatedFacts;

        private static string CaptureDirectory()
        {
            var args = Environment.GetCommandLineArgs();
            for (var index = 0; index < args.Length - 1; index++)
                if (args[index] == "-aetheria-arena8-capture")
                    return args[index + 1];
            return null;
        }

        private static bool ResumeRequested() =>
            Environment.GetCommandLineArgs().Contains("-aetheria-arena8-resume");

        private async Task AutomatedResume()
        {
            captureDirectory = CaptureDirectory();
            automatedFacts = new AutomatedFacts { status = "running" };
            try
            {
                if (!loadedSession) throw new InvalidOperationException("No persisted session to resume");
                Directory.CreateDirectory(captureDirectory);
                await LoadLobby();
                await Capture("08-resumed.png");
                automatedFacts.status = "ok";
                automatedFacts.phase = "resumed";
                automatedFacts.coins = state.wallet.coins;
                automatedFacts.settlement = "coins=" + state.wallet.coins +
                    " cleared=" + string.Join(",", state.campaign.clearedMaps) +
                    " pets=" + string.Join(",", state.pets.Select(pet => pet.petId + ":" + pet.level));
                automatedFacts.resumedState = automatedFacts.settlement;
                automatedFacts.boardTiles = 0;
            }
            catch (Exception exception)
            {
                automatedFacts.status = "failed";
                automatedFacts.error = exception.Message;
            }
            finally
            {
                File.WriteAllText(Path.Combine(captureDirectory ?? ".", "resume-facts.json"),
                    JsonUtility.ToJson(automatedFacts, true));
                Application.Quit(automatedFacts.status == "ok" ? 0 : 2);
            }
        }

        private async Task AutomatedAcceptance()
        {
            captureDirectory = CaptureDirectory();
            automatedFacts = new AutomatedFacts { status = "running" };
            try
            {
                Directory.CreateDirectory(captureDirectory);
                if (!loadedSession)
                {
                    await api.CreateGuest(displayName, NewRequestId(), lifetime.Token);
                    loadedSession = true;
                }
                await LoadLobby();

                Arena8Settlement regular = null;
                for (var attempt = 0; attempt < 6 && regular?.won != true; attempt++)
                {
                    regular = await RunMatch("cinder-terraces", "cinder-terraces-regular",
                        "01-regular-" + attempt);
                    automatedFacts.regularSettlement = Describe(regular);
                    automatedFacts.regularVersion = view.version;
                }
                if (regular?.won != true)
                    throw new InvalidOperationException("Fire regular did not clear within six authoritative attempts");

                automatedFacts.beforeArtifactEffective = view.stats?.effective?.health + "/" +
                    view.stats?.effective?.attack + "/" + view.stats?.effective?.defense;
                artifacts = await api.GetArtifactState(lifetime.Token);
                automatedFacts.inventoryCount = artifacts.inventory?.Length ?? 0;
                automatedFacts.equippedCount = artifacts.inventory?.Count(item => item.equipped != null) ?? 0;
                var reward = artifacts.inventory?.FirstOrDefault(item => item.acquiredMapId == "cinder-terraces")
                    ?? artifacts.inventory?.FirstOrDefault(item => item.equipped == null);
                if (reward != null)
                {
                    await api.EquipArtifact(new WaveAArtifactEquipRequest
                    {
                        requestId = NewRequestId(), petId = selectedPet, artifactId = reward.artifactId,
                    }, lifetime.Token);
                    artifacts = await api.GetArtifactState(lifetime.Token);
                    automatedFacts.artifactId = reward.artifactId;
                    var equippedPet = artifacts.FindPet(selectedPet);
                    automatedFacts.artifactEquipped = equippedPet?.slots != null &&
                        (equippedPet.slots.core == reward.artifactId ||
                         equippedPet.slots.aegis == reward.artifactId ||
                         equippedPet.slots.rune == reward.artifactId);
                    Draw();
                    await Capture("05-artifact-equipped.png");
                    var check = await api.AllocateArena8(new Arena8AllocateRequest
                    {
                        requestId = NewRequestId(), petId = selectedPet, mapId = "cinder-terraces",
                        encounterId = "cinder-terraces-regular",
                    }, lifetime.Token);
                    matchId = check.matchId;
                    view = check.view;
                    automatedFacts.afterArtifactEffective = view.stats?.effective?.health + "/" +
                        view.stats?.effective?.attack + "/" + view.stats?.effective?.defense;
                    Draw();
                    await Capture("05b-post-artifact-allocation.png");
                }
                else
                {
                    throw new InvalidOperationException("No Artifact reward was present to equip");
                }

                Arena8Settlement boss = null;
                for (var attempt = 0; attempt < 6 && boss?.won != true; attempt++)
                {
                    boss = await RunMatch("cinder-terraces", "cinder-terraces-boss", "06-boss-" + attempt);
                    automatedFacts.bossSettlement = Describe(boss);
                    automatedFacts.bossVersion = view.version;
                }
                if (boss?.won != true)
                    throw new InvalidOperationException("Fire boss did not fall within six authoritative attempts");

                state = await api.GetWave1State(lifetime.Token);
                var water = await api.AllocateArena8(new Arena8AllocateRequest
                {
                    requestId = NewRequestId(), petId = selectedPet, mapId = "tideglass-lagoon",
                    encounterId = "tideglass-lagoon-regular",
                }, lifetime.Token);
                matchId = water.matchId;
                view = water.view;
                automatedFacts.waterAllocated = true;
                automatedFacts.nextEffective = view.stats?.effective?.health + "/" +
                    view.stats?.effective?.attack + "/" + view.stats?.effective?.defense;
                Draw();
                await Capture("07-water-allocation.png");

                automatedFacts.status = "ok";
                automatedFacts.matchId = matchId;
                automatedFacts.phase = view.phase;
                automatedFacts.version = view.version;
                automatedFacts.boardTiles = view.board?.Length ?? 0;
                automatedFacts.skills = view.skills?.Select(skill => skill.id).ToArray() ?? Array.Empty<string>();
                automatedFacts.settlement = Describe(regular) + " | " + Describe(boss);
                automatedFacts.coins = state.wallet.coins;
            }
            catch (Exception exception)
            {
                automatedFacts.status = "failed";
                automatedFacts.error = exception.Message;
                try { await Capture("99-failed.png"); } catch { }
            }
            finally
            {
                File.WriteAllText(Path.Combine(captureDirectory ?? ".", "facts.json"),
                    JsonUtility.ToJson(automatedFacts, true));
                Application.Quit(automatedFacts.status == "ok" ? 0 : 2);
            }
        }

        private async Task<Arena8Settlement> RunMatch(string map, string encounter, string prefix)
        {
            await Allocate(map, encounter);
            await Capture(prefix + "-allocated.png");
            await Send(new Arena8StartCommandRequest
            {
                requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
            });
            await Capture(prefix + "-started.png");
            for (var turn = 0; turn < 60 && view != null && !view.terminal; turn++)
                await SendAutomatedAction();
            await Capture(prefix + "-terminal.png");
            if (view == null || !view.terminal)
                throw new InvalidOperationException("Match did not terminate in the automation budget");
            var settlement = await api.SettleArena8(matchId, new Arena8SettleRequest
            {
                requestId = NewRequestId(),
            }, lifetime.Token);
            state = await api.GetWave1State(lifetime.Token);
            artifacts = await api.GetArtifactState(lifetime.Token);
            Draw();
            await Capture(prefix + "-settled.png");
            return settlement;
        }

        private static string Describe(Arena8Settlement settlement) =>
            (settlement.won ? "victory" : "defeat") + " +" + settlement.coins + "c +" +
            settlement.exp + "xp mat=" + settlement.materials +
            (string.IsNullOrEmpty(settlement.artifactId) ? "" : " artifact=" + settlement.artifactId);

        private Task SendAutomatedAction()
        {
            if (view.phase == "ready")
                return Send(new Arena8StartCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                });
            if (view.health * 100 / Math.Max(1, view.stats?.effective?.health ?? view.health) < 35 &&
                view.skills != null && view.skills.Any(value => value.id == "guard" && value.canCast))
                return Send(new Arena8GuardCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                });
            var skill = view.skills?
                .Where(value => value.canCast && value.id != "guard")
                .OrderByDescending(value => value.id == "ultimate" ? 4 :
                    value.id == "signature" ? 3 : value.id == "fire-zone" ? 2 : 1)
                .FirstOrDefault();
            if (skill != null)
            {
                var kind = skill.id == "shared-skill" ? "skill" :
                    skill.id == "fire-zone" ? "fireZone" : skill.id;
                return Send(new Arena8SkillCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                    action = new Arena8SkillAction { kind = kind },
                });
            }
            var swap = LegalSwap(view.board);
            if (swap == null)
                return Send(new Arena8GuardCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                });
            return Send(new Arena8SwapCommandRequest
            {
                requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                action = new Arena8SwapAction { first = swap.Value.first, second = swap.Value.second },
            });
        }

        private static (int first, int second)? LegalSwap(int[] board)
        {
            for (var index = 0; index < 64; index++)
            {
                var row = index / 8;
                var column = index % 8;
                if (column < 7)
                {
                    var next = (int[])board.Clone();
                    (next[index], next[index + 1]) = (next[index + 1], next[index]);
                    if (HasMatch(next)) return (index, index + 1);
                }
                if (row < 7)
                {
                    var next = (int[])board.Clone();
                    (next[index], next[index + 8]) = (next[index + 8], next[index]);
                    if (HasMatch(next)) return (index, index + 8);
                }
            }
            return null;
        }

        private static bool HasMatch(int[] board)
        {
            for (var row = 0; row < 8; row++)
                for (var column = 0; column < 8; column++)
                {
                    var value = board[row * 8 + column];
                    if (column <= 5 && board[row * 8 + column + 1] == value && board[row * 8 + column + 2] == value)
                        return true;
                    if (row <= 5 && board[(row + 1) * 8 + column] == value && board[(row + 2) * 8 + column] == value)
                        return true;
                }
            return false;
        }

        private async Task Capture(string name)
        {
            await Task.Yield();
            ScreenCapture.CaptureScreenshot(Path.Combine(captureDirectory, name));
            await Task.Delay(250);
        }
    }
}
