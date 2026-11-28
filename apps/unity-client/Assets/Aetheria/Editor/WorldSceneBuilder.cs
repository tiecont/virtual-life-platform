using System;
using System.Collections.Generic;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.Editor
{
    // Builds the three committed world scenes from the same layout data the
    // tests validate. Scenes contain real composed objects; nothing here creates
    // an empty scene file or claims one of the four foundation maps finished.
    public static class WorldSceneBuilder
    {
        public const string HubScenePath = "Assets/Aetheria/Scenes/CentralPlaza.unity";
        public const string CinderScenePath = "Assets/Aetheria/Scenes/CinderTerraces.unity";
        public const string TideglassScenePath = "Assets/Aetheria/Scenes/TideglassLagoon.unity";

        public static readonly string[] ScenePaths =
        {
            HubScenePath, CinderScenePath, TideglassScenePath
        };

        [MenuItem("Aetheria/World/Build Central Plaza and two arena scenes")]
        public static void BuildAll()
        {
            EnsureFolder("Assets/Aetheria/Features/World/Content");
            EnsureFolder("Assets/Aetheria/Scenes");
            var materials = WorldMaterialPalette.EnsureMaterials(new[]
            {
                WorldThemes.Hub, WorldThemes.Fire, WorldThemes.Water
            });
            BuildScene(HubScenePath, WorldLayouts.Hub, materials);
            BuildScene(CinderScenePath, WorldLayouts.CinderTerraces, materials);
            BuildScene(TideglassScenePath, WorldLayouts.TideglassLagoon, materials);
            EnsureBuildEntries();
            AssetDatabase.SaveAssets();
            Debug.Log("World scenes saved: CentralPlaza, CinderTerraces, TideglassLagoon. " +
                      "Four remaining maps stay foundation-only previews.");
        }

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
