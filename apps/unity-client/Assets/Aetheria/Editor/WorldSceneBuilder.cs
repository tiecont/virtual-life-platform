using System;
using System.Collections.Generic;
using System.Linq;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.Editor
{
    public static class WorldSceneBuilder
    {
        private const string ScenesDirectory = "Assets/Aetheria/Scenes";

        public static readonly string[] ScenePaths =
            WorldMapCatalog.WorldSceneNames.Select(ScenePath).ToArray();

        [MenuItem("Aetheria/World/Build Central Plaza and campaign arenas")]
        public static void BuildAll()
        {
            EnsureFolder("Assets/Aetheria/Features/World/Content");
            EnsureFolder(ScenesDirectory);
            var layouts = WorldLayouts.PlayableScenes;
            var materials = WorldMaterialPalette.EnsureMaterials(layouts.Select(layout => layout.Theme).ToArray());
            foreach (var layout in layouts)
                BuildScene(ScenePath(layout.SceneName), layout, materials);
            EnsureBuildEntries();
            AssetDatabase.SaveAssets();
            Debug.Log("World scenes saved: " + string.Join(", ", WorldMapCatalog.WorldSceneNames));
        }

        private static string ScenePath(string name) => ScenesDirectory + "/" + name + ".unity";

        // The world scenes are part of the one canonical player-build registry;
        // keep this entry point so existing build menus and callers stay valid.
        public static void EnsureBuildEntries()
        {
            foreach (var path in ScenePaths)
                if (AssetDatabase.LoadAssetAtPath<SceneAsset>(path) == null)
                    throw new InvalidOperationException("World scene asset is missing: " + path);
            ProjectScenes.ApplyEditorBuildSettings();
        }

        private static void BuildScene(
            string path,
            WorldLayout layout,
            IReadOnlyDictionary<string, Material> materials)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var root = new GameObject(layout.DisplayName);
            var composition = WorldSceneComposer.Compose(root.transform, layout, materials);
            WorldSceneControllerBase controller = layout.Kind == WorldLayoutKind.Hub
                ? (WorldSceneControllerBase)root.AddComponent<HubWorldController>()
                : root.AddComponent<ArenaWorldSceneController>();
            controller.Bind(
                composition.Identity,
                composition.Player,
                composition.CameraRig,
                composition.Portals,
                composition.SpawnAnchors,
                composition.SpawnAnchorIds,
                layout.DefaultSpawnId,
                layout.DisplayName + " / " + layout.ContentStage,
                ToVector3(layout.BoundsMin),
                ToVector3(layout.BoundsMax));
            if (controller is ArenaWorldSceneController arena)
                arena.BindArenaExtras(layout.MapId, composition.BoardRoot, composition.BoardTiles,
                    composition.PetActor, composition.EnemyActor);
            composition.Hud.Bind(controller);
            EditorUtility.SetDirty(composition.Identity);
            EditorUtility.SetDirty(composition.Player);
            EditorUtility.SetDirty(composition.Hud);
            if (composition.PetActor != null) EditorUtility.SetDirty(composition.PetActor.gameObject);
            if (composition.EnemyActor != null) EditorUtility.SetDirty(composition.EnemyActor.gameObject);
            EditorUtility.SetDirty(controller);
            SceneManager.SetActiveScene(scene);
            EditorSceneManager.SaveScene(scene, path);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport |
                                            ImportAssetOptions.ForceUpdate);
        }

        private static Vector3 ToVector3(WorldPoint point) => new Vector3(point.X, point.Y, point.Z);

        private static void EnsureFolder(string path)
        {
            var segments = path.Split('/');
            var current = segments[0];
            for (var index = 1; index < segments.Length; index++)
            {
                var next = current + "/" + segments[index];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, segments[index]);
                current = next;
            }
        }
    }
}
