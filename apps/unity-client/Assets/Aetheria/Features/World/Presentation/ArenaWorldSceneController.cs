using System;
using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Typed arena controller. It reuses the shared locomotion/portal flow and
    // exposes the authored board, Pet and enemy placement for readability tests
    // and rendered evidence.
    public sealed class ArenaWorldSceneController : WorldSceneControllerBase
    {
        [SerializeField] private string mapId = string.Empty;
        [SerializeField] private Transform boardRoot;
        [SerializeField] private Renderer[] boardTiles = Array.Empty<Renderer>();
        [SerializeField] private Transform petActor;
        [SerializeField] private Transform enemyActor;

        public string MapId => mapId;
        public Transform BoardRoot => boardRoot;
        public int BoardTileCount => boardTiles.Length;
        public Renderer[] BoardTiles => boardTiles;
        public Transform PetActor => petActor;
        public Transform EnemyActor => enemyActor;
        public bool BattlePresentation { get; private set; }

        public void EnterBattlePresentation()
        {
            if (BattlePresentation) return;
            BattlePresentation = true;
            InputLocked = true;
            enabled = false;
            var hud = GetComponent<WorldHud>();
            if (hud != null) hud.enabled = false;
            if (Player != null) Player.gameObject.SetActive(false);
            if (boardRoot != null) boardRoot.gameObject.SetActive(false);
            foreach (var portal in Portals)
                if (portal != null) portal.gameObject.SetActive(false);

            if (CameraRig == null) return;
            var stage = CameraRig.gameObject.AddComponent<FixedBattleCamera>();
            stage.Frame(transform.position + new Vector3(0f, 2.6f, .2f), petActor, enemyActor, mapId);
            if (!stage.HasBackdrop) return;

            var cameraTransform = CameraRig.transform;
            foreach (Transform group in transform)
            {
                if (group == petActor || group == enemyActor || group == cameraTransform ||
                    group.GetComponent<Light>() != null) continue;
                group.gameObject.SetActive(false);
            }
        }

        public void BindArenaExtras(string arenaMapId, Transform board, Renderer[] tiles, Transform pet, Transform enemy)
        {
            mapId = arenaMapId;
            boardRoot = board;
            boardTiles = tiles ?? Array.Empty<Renderer>();
            petActor = pet;
            enemyActor = enemy;
        }

        public bool ReturnToHub()
        {
            foreach (var portal in Portals)
            {
                if (portal == null || !portal.Interactable) continue;
                if (!string.Equals(portal.TargetScene, WorldMapCatalog.CentralPlazaSceneName, StringComparison.Ordinal))
                    continue;
                Feedback = "Returning to " + portal.Label + "...";
                return portal.Interact();
            }
            Feedback = "No hub return gate is bound in this arena.";
            return false;
        }

        public WorldPortalGate ReturnGate
        {
            get
            {
                foreach (var portal in Portals)
                    if (portal != null && portal.Interactable &&
                        string.Equals(portal.TargetScene, WorldMapCatalog.CentralPlazaSceneName,
                            StringComparison.Ordinal)) return portal;
                return null;
            }
        }
    }
}
