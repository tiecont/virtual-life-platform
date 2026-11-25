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
