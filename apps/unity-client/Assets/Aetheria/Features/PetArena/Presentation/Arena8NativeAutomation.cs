using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Aetheria.Networking;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    // In-player native acceptance driver. The flag is explicit, and every match
    // operation still goes through the authenticated allocation route, native
    // admission and committed WSS receipt. No outcome or reward is synthesized.
    public sealed partial class Arena8CampaignScreen
    {
        [Serializable]
        private sealed class NativeFacts
        {
            public string status, matchId, phase, error, boardDigest;
            public int version, boardTiles, skills;
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
                await AllocateNative("cinder-terraces", "cinder-terraces-regular");
                Draw();
                await CaptureNative("native-01-allocated.png");
                await Native((session, token) => session.StartAsync(token));
                Draw();
                await CaptureNative("native-02-started.png");
                if (nativeView == null || nativeView.Phase != "playing")
                    throw new InvalidOperationException("Native Start did not enter playing");
                var swap = FindNativeSwap(nativeView.Board);
                await Native((session, token) => session.SwapAsync(swap.first, swap.second, token));
                Draw();
                await CaptureNative("native-03-swap.png");
                if (nativeView == null || nativeView.Board.Count != 64)
                    throw new InvalidOperationException("Native Swap did not return 64 cells");
                nativeFacts.status = "ok";
                nativeFacts.matchId = matchId;
                nativeFacts.phase = nativeView.Phase;
                nativeFacts.version = checked((int)nativeView.Version);
                nativeFacts.boardTiles = nativeView.Board.Count;
                nativeFacts.skills = nativeView.Skills.Count;
                nativeFacts.skillIds = nativeView.Skills.ToArray();
                nativeFacts.boardDigest = nativeView.SnapshotDigest;
                Draw();
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

        private async Task CaptureNative(string name)
        {
            await Task.Yield();
            ScreenCapture.CaptureScreenshot(Path.Combine(nativeCaptureDirectory, name));
            await Task.Delay(250);
        }

        private static (int first, int second) FindNativeSwap(System.Collections.Generic.IReadOnlyList<int> board)
        {
            for (var index = 0; index < 64; index++)
            {
                var row = index / 8;
                var column = index % 8;
                if (column < 7 && NativeSwapMatches(board, index, index + 1))
                    return (index, index + 1);
                if (row < 7 && NativeSwapMatches(board, index, index + 8))
                    return (index, index + 8);
            }
            throw new InvalidOperationException("No legal native swap");
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
