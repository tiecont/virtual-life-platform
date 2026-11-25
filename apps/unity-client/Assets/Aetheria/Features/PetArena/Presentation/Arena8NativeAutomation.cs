using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    // In-player native acceptance driver. Every match operation still goes
    // through authenticated allocation, native admission and committed WSS
    // receipts. It never synthesizes an outcome, board or reward.
    public sealed partial class Arena8CampaignScreen
    {
        [Serializable]
        private sealed class NativeFacts
        {
            public string status, matchId, phase, error, boardDigest, settlement;
            public string regularSettlement, bossSettlement, artifactId;
            public int version, boardTiles, skills, coins;
            public bool artifactEquipped, waterAllocated;
            public string[] skillIds;
        }

        private string nativeCaptureDirectory;
        private NativeFacts nativeFacts;

        private static string NativeCaptureDirectory()
        {
            var args = Environment.GetCommandLineArgs();
            for (var index = 0; index < args.Length - 1; index++)
                if (args[index] == "-aetheria-arena8-native-capture")
                    return args[index + 1];
            return null;
        }

        private async Task AutomatedNativeAcceptance()
        {
            nativeCaptureDirectory = NativeCaptureDirectory();
            nativeFacts = new NativeFacts { status = "running" };
            try
            {
                Directory.CreateDirectory(nativeCaptureDirectory);
                if (!loadedSession)
                {
                    await api.CreateGuest(displayName, NewRequestId(), lifetime.Token);
                    loadedSession = true;
                }
                await LoadLobby();

                Arena8Settlement regular = null;
                for (var attempt = 0; attempt < 6 && regular?.won != true; attempt++)
                {
                    regular = await RunNativeMatch("cinder-terraces", "cinder-terraces-regular",
                        "native-regular-" + attempt);
                    nativeFacts.regularSettlement = DescribeNative(regular);
                }
                if (regular?.won != true)
                    throw new InvalidOperationException("Native Fire regular did not clear in six attempts");

                artifacts = await api.GetArtifactState(lifetime.Token);
                var reward = artifacts.inventory?.FirstOrDefault(item => item.acquiredMapId == "cinder-terraces")
                    ?? artifacts.inventory?.FirstOrDefault(item => item.equipped == null);
                if (reward != null)
                {
                    await api.EquipArtifact(new WaveAArtifactEquipRequest
                    {
                        requestId = NewRequestId(), petId = selectedPet, artifactId = reward.artifactId,
                    }, lifetime.Token);
                    artifacts = await api.GetArtifactState(lifetime.Token);
                    nativeFacts.artifactId = reward.artifactId;
                    var equipped = artifacts.FindPet(selectedPet);
                    nativeFacts.artifactEquipped = equipped?.slots != null &&
                        (equipped.slots.core == reward.artifactId || equipped.slots.aegis == reward.artifactId ||
                         equipped.slots.rune == reward.artifactId);
                    Draw();
                    await CaptureNative("native-05-artifact.png");
                }

                // Bounded legitimate regular progression raises the Pet level
                // before the boss attempt; no stats or rewards are seeded.
                for (var extra = 0; extra < 7 &&
                    (state.FindPet(selectedPet)?.level ?? 60) < 16; extra++)
                {
                    var win = await RunNativeMatch("cinder-terraces", "cinder-terraces-regular",
                        "native-regular-extra-" + extra);
                    nativeFacts.regularSettlement = DescribeNative(win);
                }

                Arena8Settlement boss = null;
                for (var attempt = 0; attempt < 8 && boss?.won != true; attempt++)
                {
                    boss = await RunNativeMatch("cinder-terraces", "cinder-terraces-boss",
                        "native-boss-" + attempt);
                    nativeFacts.bossSettlement = DescribeNative(boss);
                }
                if (boss?.won != true)
                    throw new InvalidOperationException("Native Fire boss did not clear in six attempts");

                state = await api.GetWave1State(lifetime.Token);
                await AllocateNative("tideglass-lagoon", "tideglass-lagoon-regular");
                nativeFacts.waterAllocated = nativeView != null && nativeView.Phase != null;
                Draw();
                await CaptureNative("native-07-water.png");

                nativeFacts.status = "ok";
                nativeFacts.matchId = matchId;
                nativeFacts.phase = nativeView?.Phase ?? "";
                nativeFacts.version = nativeView == null ? 0 : checked((int)nativeView.Version);
                nativeFacts.boardTiles = nativeView?.Board.Count ?? 0;
                nativeFacts.skills = nativeView?.Skills.Count ?? 0;
                nativeFacts.skillIds = nativeView?.Skills.ToArray() ?? Array.Empty<string>();
                nativeFacts.boardDigest = nativeView?.SnapshotDigest ?? "";
                nativeFacts.settlement = DescribeNative(regular) + " | " + DescribeNative(boss);
                nativeFacts.coins = state.wallet.coins;
            }
            catch (Exception exception)
            {
                nativeFacts.status = "failed";
                nativeFacts.error = exception.Message;
                try { await CaptureNative("native-99-failed.png"); } catch { }
            }
            finally
            {
                File.WriteAllText(Path.Combine(nativeCaptureDirectory ?? ".", "native-facts.json"),
                    JsonUtility.ToJson(nativeFacts, true));
                Application.Quit(nativeFacts.status == "ok" ? 0 : 2);
            }
        }

        private async Task<Arena8Settlement> RunNativeMatch(string map, string encounter, string prefix)
        {
            await AllocateNative(map, encounter);
            Draw();
            await CaptureNative(prefix + "-allocated.png");
            await Native((session, token) => session.StartAsync(token));
            Draw();
            await CaptureNative(prefix + "-started.png");
            for (var turn = 0; turn < 60 && nativeView != null && !nativeView.Terminal; turn++)
                await NativeTurn();
            Draw();
            await CaptureNative(prefix + "-terminal.png");
            if (nativeView == null || !nativeView.Terminal)
                throw new InvalidOperationException("Native match did not terminate");
            var settlement = await api.SettleArena8Native(matchId, new Arena8SettleRequest
            {
                requestId = NewRequestId(),
            }, lifetime.Token);
            state = await api.GetWave1State(lifetime.Token);
            artifacts = await api.GetArtifactState(lifetime.Token);
            DisposeNative();
            // The native runtime and its TLS bridge close asynchronously after
            // settlement; wait for the bounded teardown before a new allocation.
            await Task.Delay(5000);
            Draw();
            await CaptureNative(prefix + "-settled.png");
            return settlement;
        }

        private async Task NativeTurn()
        {
            if (nativeView.Health <= 80 &&
                await TryNative((session, token) => session.GuardAsync(token))) return;
            if (nativeView.Affords(Arena8NativeView.Ultimate) &&
                await TryNative((session, token) => session.UltimateAsync(token))) return;
            if (nativeView.Affords(Arena8NativeView.Signature) &&
                await TryNative((session, token) => session.SignatureAsync(token))) return;
            if (nativeView.Affords(Arena8NativeView.SharedSkill) &&
                await TryNative((session, token) => session.SkillAsync(token))) return;
            foreach (var swap in FindNativeSwaps(nativeView.Board))
                if (await TryNative((session, token) => session.SwapAsync(swap.first, swap.second, token))) return;
            if (await TryNative((session, token) => session.GuardAsync(token))) return;
            throw new InvalidOperationException("Native match has no accepted action");
        }

        private static string DescribeNative(Arena8Settlement settlement) =>
            (settlement.won ? "victory" : "defeat") + " +" + settlement.coins + "c +" +
            settlement.exp + "xp mat=" + settlement.materials;

        private async Task<bool> TryNative(Func<Arena8NativePlaySession, System.Threading.CancellationToken, Task<PlayState>> command)
        {
            try { await Native(command); return true; }
            catch (InvalidOperationException) { return false; }
        }

        private async Task CaptureNative(string name)
        {
            await Task.Yield();
            ScreenCapture.CaptureScreenshot(Path.Combine(nativeCaptureDirectory, name));
            await Task.Delay(250);
        }

        private static System.Collections.Generic.List<(int first, int second)> FindNativeSwaps(
            System.Collections.Generic.IReadOnlyList<int> board)
        {
            var result = new System.Collections.Generic.List<(int first, int second)>();
            for (var index = 0; index < 64; index++)
            {
                var row = index / 8;
                var column = index % 8;
                if (column < 7 && NativeSwapMatches(board, index, index + 1))
                    result.Add((index, index + 1));
                if (row < 7 && NativeSwapMatches(board, index, index + 8))
                    result.Add((index, index + 8));
            }
            return result;
        }

        private static bool NativeSwapMatches(System.Collections.Generic.IReadOnlyList<int> board, int first, int second)
        {
            var next = board.ToArray();
            (next[first], next[second]) = (next[second], next[first]);
            for (var at = 0; at < 64; at++)
            {
                var x = at % 8;
                var y = at / 8;
                if (x < 6 && next[at] == next[at + 1] && next[at] == next[at + 2]) return true;
                if (y < 6 && next[at] == next[at + 8] && next[at] == next[at + 16]) return true;
            }
            return false;
        }
    }
}
