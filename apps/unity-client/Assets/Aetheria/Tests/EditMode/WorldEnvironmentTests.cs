using System;
using System.Collections.Generic;
using System.Linq;
using Aetheria.Editor;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Aetheria.Tests.EditMode
{
    // Validates the world data, the actual saved scene assets and the reusable
    // kit bindings. It does not claim production art acceptance or Windows
    // qualification.
    public sealed class WorldEnvironmentTests
    {
        [Test]
        public void CatalogKeepsTwoPlayableArenasAndFourFoundationMaps()
        {
            Assert.That(WorldMapCatalog.Maps.Count, Is.EqualTo(6));
            Assert.That(WorldMapCatalog.PlayableArenas.Count, Is.EqualTo(2));
            Assert.That(WorldMapCatalog.FoundationMaps.Count, Is.EqualTo(4));
            Assert.That(WorldMapCatalog.WorldSceneNames.Count, Is.EqualTo(3));
            Assert.That(WorldMapCatalog.PlayableArenas[0].Id, Is.EqualTo(WorldMapCatalog.CinderTerracesId));
            Assert.That(WorldMapCatalog.PlayableArenas[1].Id, Is.EqualTo(WorldMapCatalog.TideglassLagoonId));
            Assert.That(WorldMapCatalog.CinderTerraces.Element, Is.EqualTo(WorldMapElement.Fire));
            Assert.That(WorldMapCatalog.TideglassLagoon.Element, Is.EqualTo(WorldMapElement.Water));

            var ids = new HashSet<string>(StringComparer.Ordinal);
            var scenes = new HashSet<string>(StringComparer.Ordinal);
            foreach (var map in WorldMapCatalog.Maps)
            {
                Assert.That(ids.Add(map.Id), Is.True, "Duplicate map id: " + map.Id);
                if (map.IsPlayable)
                {
                    Assert.That(map.SceneName, Is.Not.Empty);
                    Assert.That(scenes.Add(map.SceneName), Is.True, "Duplicate scene name: " + map.SceneName);
                    Assert.That(map.Theme, Is.Not.Null);
                }
                else
                {
                    Assert.That(map.Status, Is.EqualTo(WorldMapStatus.FoundationOnly));
                    Assert.That(map.SceneName, Is.Empty, "Foundation maps must not claim a scene.");
                    Assert.That(map.ContentStage, Does.Contain("FOUNDATION ONLY"));
                }
            }
            Assert.That(ids.Add(WorldMapCatalog.CentralPlazaId), Is.True);
        }

        [Test]
        public void HubAndArenaLayoutsValidateAgainstTheEightByEightBoard()
        {
            foreach (var layout in new[] { WorldLayouts.Hub, WorldLayouts.CinderTerraces, WorldLayouts.TideglassLagoon })
            {
                var problems = WorldLayoutValidator.Validate(layout);
                Assert.That(problems, Is.Empty, layout.MapId + ": " + string.Join(" | ", problems));
                Assert.That(layout.PreviewOnly, Is.False);
            }

            Assert.That(WorldLayouts.Hub.Kind, Is.EqualTo(WorldLayoutKind.Hub));
            Assert.That(WorldLayouts.Hub.Placements.Count, Is.GreaterThan(60));
            Assert.That(WorldLayouts.Hub.Portals.Count, Is.EqualTo(6));
            Assert.That(WorldLayouts.Hub.ActivePortals().Count, Is.EqualTo(2));
            Assert.That(WorldLayouts.Hub.DefaultSpawnId, Is.EqualTo(WorldLayouts.HubSpawnId));

            foreach (var arena in WorldLayouts.PlayableArenas)
            {
                Assert.That(arena.Kind, Is.EqualTo(WorldLayoutKind.Arena));
                Assert.That(arena.Board, Is.Not.Null);
                Assert.That(arena.Board.Columns, Is.EqualTo(8));
                Assert.That(arena.Board.Rows, Is.EqualTo(8));
                Assert.That(arena.Board.CellCount, Is.EqualTo(64));
                Assert.That(arena.Board.Gap, Is.GreaterThanOrEqualTo(.02f));
                Assert.That(arena.Actors.Count, Is.EqualTo(2));
                Assert.That(arena.Placements.Count, Is.GreaterThan(100));
                Assert.That(arena.Placements.Count(placement =>
                    placement.Group == "board" && placement.PartId == "board-tile"), Is.EqualTo(64));
                Assert.That(arena.Portals.Count, Is.EqualTo(1));
                Assert.That(arena.Portals[0].TargetScene, Is.EqualTo(WorldMapCatalog.CentralPlazaSceneName));
            }
        }

        [Test]
        public void PortalsResolveToRealTargetScenesAndSpawnAnchors()
        {
            foreach (var portal in WorldLayouts.Hub.ActivePortals())
            {
                Assert.That(portal.TargetScene, Is.Not.Empty);
                Assert.That(WorldMapCatalog.TryGetByScene(portal.TargetScene, out var target), Is.True);
                var targetLayout = WorldLayouts.ForMap(target.Id);
                Assert.That(targetLayout.FindSpawn(portal.TargetSpawnId), Is.Not.Null,
                    "Portal " + portal.Id + " points at a missing spawn anchor.");
                Assert.That(portal.PortalMaterialKey, Is.Not.Empty);
            }

            foreach (var arena in WorldLayouts.PlayableArenas)
            {
                var returnGate = arena.Portals[0];
                Assert.That(returnGate.TargetScene, Is.EqualTo(WorldMapCatalog.CentralPlazaSceneName));
                Assert.That(WorldLayouts.Hub.FindSpawn(returnGate.TargetSpawnId), Is.Not.Null);
            }

            foreach (var marker in WorldLayouts.Hub.Portals)
            {
                if (marker.Interactable) continue;
                Assert.That(marker.Status, Does.Contain("FOUNDATION ONLY"));
                Assert.That(marker.TargetScene, Is.Empty);
                Assert.That(marker.TargetSpawnId, Is.Empty);
            }
        }

        [Test]
        public void FireAndWaterThemesStayDistinctAndArtBibleGrounded()
        {
            var fire = WorldThemes.Fire;
            var water = WorldThemes.Water;
            Assert.That(fire.Palette.Ink, Is.EqualTo(WorldColor.FromHex("#4A1410")));
            Assert.That(fire.Palette.Surface, Is.EqualTo(WorldColor.FromHex("#FF7A3D")));
            Assert.That(water.Palette.Ink, Is.EqualTo(WorldColor.FromHex("#0C2C4A")));
            Assert.That(water.Palette.Surface, Is.EqualTo(WorldColor.FromHex("#40C9E8")));
            Assert.That(fire.FogColorDistance(water), Is.GreaterThan(.15f));
            Assert.That(fire.SunColor.DistanceTo(water.SunColor), Is.GreaterThan(.1f));
            Assert.That(fire.Background.DistanceTo(water.Background), Is.GreaterThan(.15f));
            Assert.That(fire.FogEnabled && water.FogEnabled, Is.True);
            Assert.That(fire.FogStart, Is.Not.EqualTo(water.FogStart));
            foreach (var theme in new[] { fire, water })
            {
                var light = theme.MaterialColor(WorldMaterialKeys.BoardLight);
                var dark = theme.MaterialColor(WorldMaterialKeys.BoardDark);
                Assert.That(Mathf.Abs(light.Luminance - dark.Luminance), Is.GreaterThan(.1f),
                    "Board tiles must stay readable in " + theme.Id + ".");
                Assert.That(theme.MaterialColor(WorldMaterialKeys.Emissive).Luminance,
                    Is.GreaterThan(theme.MaterialColor(WorldMaterialKeys.Stone).Luminance));
            }
        }

        [Test]
        public void FoundationPreviewsComposeFromTheSameKitWithoutScenes()
        {
            Assert.That(WorldSceneBuilder.ScenePaths.Length, Is.EqualTo(3));
            foreach (var map in WorldMapCatalog.FoundationMaps)
            {
                var preview = WorldLayouts.Preview(map);
                Assert.That(preview.PreviewOnly, Is.True);
                Assert.That(preview.SceneName, Is.Empty);
                Assert.That(preview.ActivePortals(), Is.Empty);
                Assert.That(preview.Board.CellCount, Is.EqualTo(64));
                Assert.That(preview.Placements.Count, Is.GreaterThan(60));
                Assert.That(preview.Theme.Id, Is.Not.Empty);
                var problems = WorldLayoutValidator.Validate(preview);
                Assert.That(problems, Is.Empty, map.Id + ": " + string.Join(" | ", problems));
                foreach (var scenePath in WorldSceneBuilder.ScenePaths)
                    Assert.That(scenePath, Does.Not.Contain(map.DisplayName), "Foundation map must not own a scene.");
            }
        }

        [Test]
        public void KitPartsAndPlacementsStayReusableAndUnique()
        {
            Assert.That(EnvironmentKit.Parts.Count, Is.GreaterThanOrEqualTo(45));
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var categories = new HashSet<WorldKitCategory>();
            foreach (var part in EnvironmentKit.Parts)
            {
                Assert.That(ids.Add(part.Id), Is.True, "Duplicate kit part: " + part.Id);
                categories.Add(part.Category);
                Assert.That(part.Scale.X, Is.GreaterThan(0f));
                Assert.That(part.Scale.Y, Is.GreaterThan(0f));
                Assert.That(part.Scale.Z, Is.GreaterThan(0f));
            }
            foreach (WorldKitCategory category in Enum.GetValues(typeof(WorldKitCategory)))
                Assert.That(categories.Contains(category), Is.True, "Kit category is unused: " + category);

            foreach (var layout in WorldLayouts.PlayableScenes)
            {
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var placement in layout.Placements)
                {
                    Assert.That(EnvironmentKit.TryGet(placement.PartId, out _), Is.True);
                    Assert.That(names.Add(placement.Name), Is.True, "Duplicate placement name: " + placement.Name);
                }
            }

            var cinderTiles = WorldLayouts.CinderTerraces.Placements
                .Where(placement => placement.Group == "board" && placement.PartId == "board-tile").ToList();
            Assert.That(cinderTiles.Count(tile => tile.MaterialKey == WorldMaterialKeys.BoardLight), Is.EqualTo(32));
            Assert.That(cinderTiles.Count(tile => tile.MaterialKey == WorldMaterialKeys.BoardDark), Is.EqualTo(32));
        }

        [Test]
        public void BuildSettingsKeepExistingScenesAndAppendTheThreeWorldScenes()
        {
            var paths = new List<string>();
            foreach (var scene in EditorBuildSettings.scenes) paths.Add(scene.path);
            Assert.That(paths, Does.Contain("Assets/Aetheria/Scenes/AuroraBlockout.unity"));
            Assert.That(paths, Does.Contain("Assets/Aetheria/Scenes/PetArenaPve.unity"));
            foreach (var path in WorldSceneBuilder.ScenePaths)
            {
                Assert.That(paths, Does.Contain(path));
                Assert.That(AssetDatabase.LoadAssetAtPath<SceneAsset>(path), Is.Not.Null, "Missing scene asset: " + path);
            }
        }

        [Test]
        public void SavedScenesContainTheActualComposedEnvironment()
        {
            foreach (var path in WorldSceneBuilder.ScenePaths)
            {
                var scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Additive);
                try
                {
                    Assert.That(scene.IsValid(), Is.True);
                    var roots = scene.GetRootGameObjects();
                    Assert.That(roots.Length, Is.GreaterThan(0), "Scene is empty: " + path);
                    GameObject root = null;
                    foreach (var candidate in roots)
                        if (candidate.GetComponent<WorldMapIdentity>() != null) root = candidate;
                    Assert.That(root, Is.Not.Null, "World identity is missing in " + path);
                    var identity = root.GetComponent<WorldMapIdentity>();
                    Assert.That(identity.ContentStage, Does.Contain("INTERMEDIATE").Or.Contain("PLAYABLE"));
                    Assert.That(identity.PlacementCount, Is.GreaterThan(60));
                    Assert.That(identity.BoardCellCount, Is.EqualTo(
                        identity.Kind == WorldLayoutKind.Arena ? 64 : 0));

                    var controller = root.GetComponent<WorldSceneControllerBase>();
                    Assert.That(controller, Is.Not.Null, "World controller is missing in " + path);
                    Assert.That(controller.Player, Is.Not.Null);
                    Assert.That(controller.CameraRig, Is.Not.Null);
                    Assert.That(controller.CameraRig.Camera, Is.Not.Null);
                    Assert.That(controller.CameraRig.Camera.CompareTag("MainCamera"), Is.True);
                    Assert.That(controller.Portals.Count, Is.GreaterThanOrEqualTo(1));
                    Assert.That(controller.FindSpawnAnchor(controller.DefaultSpawnId), Is.Not.Null);
                    Assert.That(root.GetComponentsInChildren<Light>().Length, Is.GreaterThanOrEqualTo(1));
                    var renderers = root.GetComponentsInChildren<Renderer>();
                    Assert.That(renderers.Length, Is.GreaterThan(80), "Scene does not contain composed geometry: " + path);
                    foreach (var renderer in renderers)
                    {
                        Assert.That(renderer.sharedMaterial, Is.Not.Null, "Unbound material on " + renderer.name);
                        Assert.That(renderer.sharedMaterial.shader.name, Is.EqualTo("Universal Render Pipeline/Lit"));
                    }

                    var camera = controller.CameraRig.Camera;
                    camera.aspect = 16f / 9f;
                    var planes = GeometryUtility.CalculateFrustumPlanes(camera);
                    var spawn = controller.FindSpawnAnchor(controller.DefaultSpawnId);
                    AssertFramed(planes, spawn.position, "spawn in " + path);
                    foreach (var portal in controller.Portals)
                    {
                        if (!portal.Interactable) continue;
                        AssertFramed(planes, BoundsOf(portal.gameObject), "portal " + portal.PortalId + " in " + path);
                    }

                    if (identity.Kind == WorldLayoutKind.Arena)
                    {
                        var arena = root.GetComponent<ArenaWorldSceneController>();
                        Assert.That(arena, Is.Not.Null);
                        Assert.That(arena.BoardTileCount, Is.EqualTo(64));
                        Assert.That(arena.PetActor, Is.Not.Null);
                        Assert.That(arena.EnemyActor, Is.Not.Null);
                        Assert.That(arena.ReturnGate, Is.Not.Null);
                        AssertFramed(planes, BoundsOf(arena.BoardRoot.gameObject), "board in " + path);
                        AssertFramed(planes, BoundsOf(arena.PetActor.gameObject), "pet in " + path);
                        AssertFramed(planes, BoundsOf(arena.EnemyActor.gameObject), "enemy in " + path);
                        Assert.That(arena.BoardTiles[0].sharedMaterial.GetColor("_BaseColor"),
                            Is.Not.EqualTo(arena.BoardTiles[1].sharedMaterial.GetColor("_BaseColor")));
                    }
                    else
                    {
                        var hub = root.GetComponent<HubWorldController>();
                        Assert.That(hub, Is.Not.Null);
                        Assert.That(hub.ActivePortalCount, Is.EqualTo(2));
                        Assert.That(hub.FoundationMarkerCount, Is.EqualTo(4));
                        Assert.That(hub.IsHub, Is.True);
                    }
                }
                finally
                {
                    EditorSceneManager.CloseScene(scene, true);
                }
            }
        }

        private static void AssertFramed(Plane[] planes, Vector3 point, string label) =>
            Assert.That(GeometryUtility.TestPlanesAABB(planes, new Bounds(point, Vector3.one * .25f)), Is.True,
                "Not framed by the authored camera: " + label);

        private static void AssertFramed(Plane[] planes, Bounds bounds, string label) =>
            Assert.That(GeometryUtility.TestPlanesAABB(planes, bounds), Is.True,
                "Not framed by the authored camera: " + label);

        private static Bounds BoundsOf(GameObject root)
        {
            var renderers = root.GetComponentsInChildren<Renderer>();
            Assert.That(renderers.Length, Is.GreaterThan(0), "No renderer on " + root.name);
            var bounds = renderers[0].bounds;
            for (var index = 1; index < renderers.Length; index++) bounds.Encapsulate(renderers[index].bounds);
            return bounds;
        }
    }

    internal static class WorldThemeTestExtensions
    {
        public static float FogColorDistance(this WorldTheme theme, WorldTheme other) =>
            theme.Fog.DistanceTo(other.Fog);
    }
}
