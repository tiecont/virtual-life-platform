using System;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.World.Presentation
{
    // Bounded scene transition used by hub portals and arena return gates. It
    // carries only a spawn-anchor id; it never transfers combat state, rewards
    // or authority between scenes.
    public static class WorldSceneFlow
    {
        private static string pendingSpawnId;
        private static string pendingScene;
        private static bool loading;

        public static bool IsLoading => loading;
        public static string PendingScene => pendingScene;

        public static bool Load(string sceneName, string spawnId = null)
        {
            if (string.IsNullOrEmpty(sceneName) || loading) return false;
            pendingSpawnId = spawnId ?? string.Empty;
            pendingScene = sceneName;
            loading = true;
            try
            {
                var operation = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);
                if (operation == null)
                {
                    Reset();
                    return false;
                }
                operation.completed += OnCompleted;
                return true;
            }
            catch (ArgumentException exception)
            {
                Debug.LogError("World scene transition failed for " + sceneName + ": " + exception.Message);
                Reset();
                return false;
            }
        }

        private static void OnCompleted(AsyncOperation operation) => loading = false;

        public static string ConsumeSpawnId()
        {
            var id = pendingSpawnId ?? string.Empty;
            pendingSpawnId = null;
            return id;
        }

        public static void Reset()
        {
            pendingSpawnId = null;
            pendingScene = null;
            loading = false;
        }
    }
}
