using System.Collections;
using System.Linq;
using Aetheria.World.Domain;
using Aetheria.World.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Aetheria.World.Tests
{
    // Scene-loading and presentation regressions for the Central Plaza hub and
    // the six developer arenas. These tests run in the Editor and in a rendered
    // Linux player; they never assert Windows qualification.
    public sealed class WorldSceneTests
    {
        [SetUp]
        public void SetUp()
        {
            WorldSceneFlow.Reset();
            WorldPresentationSettings.ReducedMotion = true;
        }

        [TearDown]
        public void TearDown() => WorldSceneFlow.Reset();

        [UnityTest]
        public IEnumerator HubLoadsWithSpawnWalkableGroundAndPortals()
        {
            yield return SceneManager.LoadSceneAsync(WorldMapCatalog.CentralPlazaSceneName);
            yield return null;
            Assert.That(SceneManager.GetActiveScene().name, Is.EqualTo(WorldMapCatalog.CentralPlazaSceneName));
            var hub = Object.FindFirstObjectByType<HubWorldController>();
            Assert.That(hub, Is.Not.Null);
            Assert.That(hub.Identity, Is.Not.Null);
            Assert.That(hub.Identity.Kind, Is.EqualTo(WorldLayoutKind.Hub));
            Assert.That(hub.Identity.ContentStage, Does.Contain("PLAYABLE"));
            Assert.That(hub.ActivePortalCount, Is.EqualTo(6));
            Assert.That(hub.FoundationMarkerCount, Is.Zero);
            Assert.That(hub.Player, Is.Not.Null);
            Assert.That(Camera.main, Is.Not.Null);

            var spawn = hub.FindSpawnAnchor(WorldLayouts.HubSpawnId);
            Assert.That(spawn, Is.Not.Null);
            var flatOffset = hub.Player.transform.position - spawn.position;
            flatOffset.y = 0f;
            Assert.That(flatOffset.magnitude, Is.LessThan(.4f), "The player did not start on the hub spawn pad.");

            var probe = spawn.position + new Vector3(1.6f, 3f, 0f);
            Assert.That(Physics.Raycast(probe, Vector3.down, out var ground, 6f), Is.True,
                "The hub has no walkable ground collider.");
            Assert.That(ground.point.y, Is.InRange(-.15f, .4f));

            hub.InputLocked = true;
            var before = hub.Player.transform.position;
            hub.Player.Move(Vector3.forward, .1f);
            Assert.That(hub.Player.transform.position.z, Is.GreaterThan(before.z));
            Assert.That(hub.Player.transform.position.y, Is.GreaterThan(-.3f), "The player fell through the plaza.");

            hub.Player.Teleport(new Vector3(12.9f, .05f, 0f), 0f);
            for (var step = 0; step < 40; step++) hub.Player.Move(Vector3.right, .1f);
            Assert.That(hub.Player.transform.position.x, Is.LessThanOrEqualTo(13.21f),
                "The player escaped the authored hub bounds.");

            var camera = hub.CameraRig.Camera;
            camera.aspect = 16f / 9f;
            var planes = GeometryUtility.CalculateFrustumPlanes(camera);
            AssertFramed(planes, spawn.position + Vector3.up, "hub spawn");
            foreach (var portal in hub.Portals)
                if (portal.Interactable)
                    AssertFramed(planes, BoundsOf(portal.gameObject), "portal " + portal.PortalId);
            Assert.That(hub.Portals.Count, Is.EqualTo(6));
        }

        [UnityTest]
        public IEnumerator HubPortalLoadsFireArenaAndReturnGateRestoresHubSpawn()
        {
            yield return SceneManager.LoadSceneAsync(WorldMapCatalog.CentralPlazaSceneName);
            yield return null;
            var hub = Object.FindFirstObjectByType<HubWorldController>();
            Assert.That(hub, Is.Not.Null);
            hub.InputLocked = true;
            var firePortal = hub.FindPortal("fire-portal");
            Assert.That(firePortal, Is.Not.Null);
            Assert.That(firePortal.TargetScene, Is.EqualTo(WorldMapCatalog.CinderTerraces.SceneName));

            hub.Player.Teleport(firePortal.transform.position + new Vector3(0f, .02f, -2.4f), 0f);
            yield return null;
            Assert.That(hub.FindPortalInRange(), Is.EqualTo(firePortal));
            Assert.That(hub.TryInteract(), Is.True, "The fire portal interaction was rejected.");
            yield return WaitForScene(WorldMapCatalog.CinderTerraces.SceneName);
            yield return null;

            var arena = Object.FindFirstObjectByType<ArenaWorldSceneController>();
            Assert.That(arena, Is.Not.Null);
            Assert.That(arena.MapId, Is.EqualTo(WorldMapCatalog.CinderTerracesId));
            Assert.That(arena.BoardTileCount, Is.EqualTo(64));
            Assert.That(arena.PetActor, Is.Not.Null);
            Assert.That(arena.EnemyActor, Is.Not.Null);
            Assert.That(arena.ReturnGate, Is.Not.Null);
            Assert.That(arena.ReturnGate.TargetSpawnId, Is.EqualTo(WorldLayouts.HubFireReturnId));

            var entry = arena.FindSpawnAnchor(WorldLayouts.CinderEntryId);
            Assert.That(entry, Is.Not.Null);
            Assert.That(Vector3.Distance(arena.Player.transform.position, entry.position), Is.LessThan(.5f),
                "The arena did not honour the portal spawn anchor.");

            var beforeZ = arena.Player.transform.position.z;
            for (var step = 0; step < 40; step++)
            {
                arena.Player.Move(Vector3.forward, .1f);
                yield return null;
            }
            Assert.That(arena.Player.transform.position.z, Is.GreaterThan(beforeZ));
            Assert.That(arena.Player.transform.position.z, Is.LessThan(-4.5f),
                "The raised board plinth must block the player instead of being walked through.");

            Assert.That(arena.ReturnToHub(), Is.True, "The arena return gate was rejected.");
            yield return WaitForScene(WorldMapCatalog.CentralPlazaSceneName);
            yield return null;
            var returnedHub = Object.FindFirstObjectByType<HubWorldController>();
            Assert.That(returnedHub, Is.Not.Null);
            var fireReturn = returnedHub.FindSpawnAnchor(WorldLayouts.HubFireReturnId);
            Assert.That(fireReturn, Is.Not.Null);
            Assert.That(Vector3.Distance(returnedHub.Player.transform.position, fireReturn.position), Is.LessThan(.6f),
                "Returning from Cinder Terraces did not use the hub-fire-return anchor.");
        }

        [UnityTest]
        public IEnumerator FireBattleHidesWorldControlsAndKeepsFixedFraming()
        {
            yield return SceneManager.LoadSceneAsync(WorldMapCatalog.CinderTerraces.SceneName);
            var arena = Object.FindFirstObjectByType<ArenaWorldSceneController>();
            var camera = arena.CameraRig.Camera;
            camera.aspect = 16f / 9f;

            arena.EnterBattlePresentation();
            var position = camera.transform.position;
            var rotation = camera.transform.rotation;
            Assert.That(arena.InputLocked, Is.True);
            Assert.That(arena.Player.gameObject.activeInHierarchy, Is.False);
            Assert.That(arena.BoardRoot.gameObject.activeInHierarchy, Is.False);
            Assert.That(arena.ReturnGate.Interact(), Is.False);
            Assert.That(camera.orthographic, Is.True);
            Assert.That(camera.WorldToViewportPoint(arena.PetActor.position).x, Is.InRange(.13f, .17f));
            Assert.That(camera.WorldToViewportPoint(arena.EnemyActor.position).x, Is.InRange(.83f, .87f));
            Assert.That(camera.GetComponent<FixedBattleCamera>().HasBackdrop, Is.True);

            camera.aspect = 4f / 3f;
            arena.EnterBattlePresentation();
            yield return null;
            yield return null;
            Assert.That(camera.transform.position, Is.EqualTo(position));
            Assert.That(camera.transform.rotation, Is.EqualTo(rotation));
            Assert.That(camera.GetComponents<FixedBattleCamera>().Length, Is.EqualTo(1));
            Assert.That(camera.WorldToViewportPoint(arena.PetActor.position).x, Is.InRange(.13f, .17f));
            Assert.That(camera.WorldToViewportPoint(arena.EnemyActor.position).x, Is.InRange(.83f, .87f));
        }

        [UnityTest]
        public IEnumerator AllArenasRenderDistinctAtmospheresReadableBoardsAndAmbientMovement()
        {
            foreach (var map in WorldMapCatalog.PlayableArenas)
                yield return AssertArenaScene(map.SceneName, map.Theme);
        }

        private static IEnumerator AssertArenaScene(string sceneName, WorldTheme theme)
        {
            yield return SceneManager.LoadSceneAsync(sceneName);
            Assert.That(SceneManager.GetActiveScene().name, Is.EqualTo(sceneName));
            var arena = Object.FindFirstObjectByType<ArenaWorldSceneController>();
            Assert.That(arena, Is.Not.Null);
            Assert.That(arena.BoardTileCount, Is.EqualTo(64));
            Assert.That(arena.Identity, Is.Not.Null);
            Assert.That(arena.Identity.ContentStage, Does.Contain("INTERMEDIATE"));
            Assert.That(arena.Player, Is.Not.Null);

            Assert.That(RenderSettings.fog, Is.True);
            Assert.That(RenderSettings.fogColor.Distance(theme.Fog), Is.LessThan(.03f),
                "Arena fog does not match the authored " + theme.Id + " atmosphere.");
            Assert.That(RenderSettings.sun, Is.Not.Null);
            Assert.That(RenderSettings.sun.color.Distance(theme.SunColor), Is.LessThan(.03f));
            Assert.That(RenderSettings.fogStartDistance, Is.EqualTo(theme.FogStart).Within(.1f));
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);
            Assert.That(camera.backgroundColor.Distance(theme.Background), Is.LessThan(.03f));
            Assert.That(camera.fieldOfView, Is.EqualTo(arena.CameraRig.FieldOfView).Within(.01f));

            var light = arena.BoardTiles[0].sharedMaterial.GetColor("_BaseColor");
            var dark = arena.BoardTiles[1].sharedMaterial.GetColor("_BaseColor");
            Assert.That(Mathf.Abs(light.grayscale - dark.grayscale), Is.GreaterThan(.1f),
                "Alternating board tiles are not readable.");
            Assert.That(arena.BoardTiles.Select(tile => tile.sharedMaterial).Distinct().Count(), Is.EqualTo(2));

            camera.aspect = 16f / 9f;
            var planes = GeometryUtility.CalculateFrustumPlanes(camera);
            foreach (var tile in arena.BoardTiles)
                Assert.That(GeometryUtility.TestPlanesAABB(planes, tile.bounds), Is.True,
                    "Board tile is outside the authored camera framing.");
            AssertFramed(planes, BoundsOf(arena.PetActor.gameObject), "pet");
            AssertFramed(planes, BoundsOf(arena.EnemyActor.gameObject), "enemy");
            AssertFramed(planes, BoundsOf(arena.ReturnGate.gameObject), "return gate");

            var movers = arena.gameObject.GetComponentsInChildren<WorldAmbientMover>();
            Assert.That(movers.Length, Is.GreaterThan(3), "No ambient movement is bound in " + sceneName);
            arena.SetReducedMotion(false);
            var before = movers.Select(mover => mover.transform.localPosition +
                                                mover.transform.localRotation.eulerAngles +
                                                mover.transform.localScale).ToArray();
            for (var frame = 0; frame < 30; frame++) yield return null;
            var moved = false;
            for (var index = 0; index < movers.Length; index++)
            {
                var now = movers[index].transform.localPosition +
                          movers[index].transform.localRotation.eulerAngles +
                          movers[index].transform.localScale;
                if ((now - before[index]).sqrMagnitude > .0005f) moved = true;
            }
            Assert.That(moved, Is.True, "Ambient movement did not animate in " + sceneName);

            arena.SetReducedMotion(true);
            yield return null;
            yield return null;
            var frozen = movers.Select(mover => mover.transform.localPosition).ToArray();
            for (var frame = 0; frame < 12; frame++) yield return null;
            for (var index = 0; index < movers.Length; index++)
                Assert.That(Vector3.Distance(frozen[index], movers[index].transform.localPosition), Is.LessThan(.0001f),
                    "Reduced motion must freeze ambient movement.");
        }

        [UnityTest]
        public IEnumerator EveryWorldSceneInBuildSettingsLoadsNonEmpty()
        {
            Assert.That(SceneUtility.GetBuildIndexByScenePath("Assets/Aetheria/Scenes/AuroraBlockout.unity"),
                Is.GreaterThanOrEqualTo(0));
            Assert.That(SceneUtility.GetBuildIndexByScenePath("Assets/Aetheria/Scenes/PetArenaPve.unity"),
                Is.GreaterThanOrEqualTo(0));
            foreach (var sceneName in WorldMapCatalog.WorldSceneNames)
            {
                yield return SceneManager.LoadSceneAsync(sceneName);
                Assert.That(SceneManager.GetActiveScene().name, Is.EqualTo(sceneName));
                var roots = SceneManager.GetActiveScene().GetRootGameObjects();
                Assert.That(roots.Length, Is.GreaterThan(0));
                Assert.That(Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None).Length,
                    Is.GreaterThan(50), "Scene has no composed geometry: " + sceneName);
                Assert.That(Object.FindFirstObjectByType<WorldSceneControllerBase>(), Is.Not.Null);
                Assert.That(Camera.main, Is.Not.Null);
                Assert.That(SceneUtility.GetBuildIndexByScenePath("Assets/Aetheria/Scenes/" + sceneName + ".unity"),
                    Is.GreaterThanOrEqualTo(0));
            }
        }

        [UnityTest]
        public IEnumerator EveryCampaignPortalLoadsItsArenaAndReturnsToItsPlazaAnchor()
        {
            yield return SceneManager.LoadSceneAsync(WorldMapCatalog.CentralPlazaSceneName);
            yield return null;
            foreach (var map in WorldMapCatalog.PlayableArenas)
            {
                var hub = Object.FindFirstObjectByType<HubWorldController>();
                Assert.That(hub, Is.Not.Null);
                var portal = hub.Portals.Single(candidate => candidate.TargetScene == map.SceneName);
                hub.Player.Teleport(portal.transform.position + new Vector3(0f, .02f, -2.1f), 0f);
                yield return null;
                Assert.That(hub.FindPortalInRange(), Is.EqualTo(portal), map.Id);
                Assert.That(hub.TryInteract(), Is.True, map.Id);
                var entryId = portal.TargetSpawnId;
                yield return WaitForScene(map.SceneName);

                var arena = Object.FindFirstObjectByType<ArenaWorldSceneController>();
                Assert.That(arena, Is.Not.Null, map.Id);
                Assert.That(arena.MapId, Is.EqualTo(map.Id));
                Assert.That(arena.BoardTileCount, Is.EqualTo(64), map.Id);
                var spawn = arena.FindSpawnAnchor(entryId);
                Assert.That(spawn, Is.Not.Null, map.Id);
                Assert.That(Vector3.Distance(arena.Player.transform.position, spawn.position), Is.LessThan(.6f), map.Id);
                Assert.That(Physics.Raycast(spawn.position + new Vector3(1.6f, 3f, 0f), Vector3.down, 6f),
                    Is.True, "Missing walkable arena collider in " + map.Id);

                var returnGate = arena.ReturnGate;
                Assert.That(returnGate, Is.Not.Null, map.Id);
                var returnId = returnGate.TargetSpawnId;
                var approach = returnGate.transform.position + new Vector3(0f, 5f, -2.1f);
                Assert.That(Physics.Raycast(approach, Vector3.down, out var footing, 7f), Is.True,
                    "Missing walkable return approach in " + map.Id);
                arena.Player.Teleport(footing.point + Vector3.up * .02f, 0f);
                yield return null;
                Assert.That(arena.FindPortalInRange(), Is.EqualTo(returnGate), map.Id);
                Assert.That(arena.TryInteract(), Is.True, map.Id);
                yield return WaitForScene(WorldMapCatalog.CentralPlazaSceneName);
                hub = Object.FindFirstObjectByType<HubWorldController>();
                Assert.That(hub, Is.Not.Null);
                var hubSpawn = hub.FindSpawnAnchor(returnId);
                Assert.That(hubSpawn, Is.Not.Null, map.Id);
                Assert.That(Vector3.Distance(hub.Player.transform.position, hubSpawn.position), Is.LessThan(.6f), map.Id);
            }
        }

        private static IEnumerator WaitForScene(string sceneName)
        {
            var deadline = Time.realtimeSinceStartup + 20f;
            while (!string.Equals(SceneManager.GetActiveScene().name, sceneName))
            {
                if (Time.realtimeSinceStartup > deadline)
                    Assert.Fail("Timed out waiting for scene " + sceneName);
                yield return null;
            }
            yield return null;
            yield return null;
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

    internal static class WorldColorExtensions
    {
        public static float Distance(this Color first, Color second)
        {
            var dr = first.r - second.r;
            var dg = first.g - second.g;
            var db = first.b - second.b;
            return Mathf.Sqrt(dr * dr + dg * dg + db * db);
        }

        public static float Distance(this Color first, WorldColor second) =>
            first.Distance(new Color(second.R, second.G, second.B, second.A));
    }
}
