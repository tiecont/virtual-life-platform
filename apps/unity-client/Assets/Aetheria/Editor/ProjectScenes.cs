using System;
using System.Linq;
using UnityEditor;

namespace Aetheria.Editor
{
    // Single source of truth for the scenes that ship in a player build.
    // ProjectBuild applies this registry to EditorBuildSettings and passes the
    // same array to BuildPlayerOptions.scenes, so a scene cannot be present in
    // the Editor list while missing from the built executable.
    public static class ProjectScenes
    {
        public static readonly string[] PlayerScenes =
            new[] { ProjectBuild.Scene, PetArenaMvpSceneBuilder.ScenePath }
                .Concat(WorldSceneBuilder.ScenePaths).ToArray();

        public static void ApplyEditorBuildSettings()
        {
            var scenes = new EditorBuildSettingsScene[PlayerScenes.Length];
            for (var index = 0; index < PlayerScenes.Length; index++)
            {
                var path = PlayerScenes[index];
                if (AssetDatabase.LoadAssetAtPath<SceneAsset>(path) == null)
                    throw new InvalidOperationException("Required player scene is missing: " + path);
                scenes[index] = new EditorBuildSettingsScene(path, true);
            }
            EditorBuildSettings.scenes = scenes;
        }
    }
}
