using System;
using System.Collections.Generic;
using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Shared offline presentation controller for the Central Plaza hub and the
    // campaign arenas. It owns local locomotion, portal interaction, the
    // spawned anchor handoff and accessibility toggles. It never owns combat
    // authority, rewards or board rules.
    public abstract class WorldSceneControllerBase : MonoBehaviour
    {
        [SerializeField] private WorldMapIdentity identity;
        [SerializeField] private WorldPlayerMotor player;
        [SerializeField] private WorldCameraRig cameraRig;
        [SerializeField] private WorldPortalGate[] portals = Array.Empty<WorldPortalGate>();
        [SerializeField] private Transform[] spawnAnchors = Array.Empty<Transform>();
        [SerializeField] private string[] spawnAnchorIds = Array.Empty<string>();
        [SerializeField] private string defaultSpawnId = string.Empty;
        [SerializeField] private string hudTitle = string.Empty;
        [SerializeField] private bool reducedMotion = true;
        [SerializeField] private bool inputLocked;
        [SerializeField] private string feedback = "Walk with WASD and press E at a portal.";

        private WorldHud hud;

        public WorldMapIdentity Identity => identity;
        public WorldPlayerMotor Player => player;
        public WorldCameraRig CameraRig => cameraRig;
        public IReadOnlyList<WorldPortalGate> Portals => portals;
        public string HudTitle => hudTitle;
        public string DefaultSpawnId => defaultSpawnId;
        public bool ReducedMotion => reducedMotion;
        public WorldPortalGate NearestPortal { get; private set; }

        public string Feedback
        {
            get => feedback;
            set => feedback = value ?? string.Empty;
        }

        public bool InputLocked
        {
            get => inputLocked;
            set
            {
                inputLocked = value;
                if (player != null) player.MovementLocked = value;
            }
        }

        // Called by the editor scene builder after composition. Runtime scenes
        // load these values from serialization instead.
        public void Bind(
            WorldMapIdentity mapIdentity,
            WorldPlayerMotor playerMotor,
            WorldCameraRig camera,
            WorldPortalGate[] portalGates,
            Transform[] anchors,
            string[] anchorIds,
            string defaultSpawn,
            string title,
            Vector3 boundsMin,
            Vector3 boundsMax)
        {
            identity = mapIdentity;
            player = playerMotor;
            cameraRig = camera;
            portals = portalGates ?? Array.Empty<WorldPortalGate>();
            spawnAnchors = anchors ?? Array.Empty<Transform>();
            spawnAnchorIds = anchorIds ?? Array.Empty<string>();
            defaultSpawnId = defaultSpawn ?? string.Empty;
            hudTitle = title ?? string.Empty;
            if (player != null)
            {
                player.ConfigureBounds(boundsMin, boundsMax);
                player.MovementLocked = inputLocked;
            }
        }

        protected virtual void Awake()
        {
            if (identity == null) identity = GetComponent<WorldMapIdentity>();
            if (player == null) player = FindFirstObjectByType<WorldPlayerMotor>();
            if (cameraRig == null) cameraRig = FindFirstObjectByType<WorldCameraRig>();
            if (portals == null || portals.Length == 0)
                portals = FindObjectsByType<WorldPortalGate>(FindObjectsSortMode.None);
            if (hud == null)
            {
                hud = GetComponent<WorldHud>();
                if (hud == null) hud = gameObject.AddComponent<WorldHud>();
            }
            hud.Bind(this);
            WorldPresentationSettings.ReducedMotion = reducedMotion;
            if (player != null) player.MovementLocked = inputLocked;
        }

        protected virtual void Start()
        {
            PlacePlayerAtSpawn();
        }

        protected virtual void Update()
        {
            if (player == null) return;
            NearestPortal = FindNearestPortal();
            if (inputLocked) return;
            if (Input.GetKeyDown(KeyCode.E)) TryInteract();
            if (Input.GetKeyDown(KeyCode.M)) SetReducedMotion(!reducedMotion);
        }

        public void PlacePlayerAtSpawn()
        {
            if (player == null) return;
            var requested = WorldSceneFlow.ConsumeSpawnId();
            var anchor = FindSpawnAnchor(requested);
            if (anchor == null && !string.IsNullOrEmpty(requested))
                Debug.LogWarning("World scene '" + gameObject.scene.name + "' has no spawn anchor '" + requested + "'.");
            if (anchor == null) anchor = FindSpawnAnchor(defaultSpawnId);
            if (anchor == null && spawnAnchors.Length > 0) anchor = spawnAnchors[0];
            if (anchor == null) return;
            player.Teleport(anchor.position, anchor.eulerAngles.y);
            feedback = "Spawned at " + (string.IsNullOrEmpty(requested) ? defaultSpawnId : requested) + ".";
        }

        public Transform FindSpawnAnchor(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            for (var index = 0; index < spawnAnchors.Length && index < spawnAnchorIds.Length; index++)
                if (string.Equals(spawnAnchorIds[index], id, StringComparison.Ordinal))
                    return spawnAnchors[index];
            return null;
        }

        public WorldPortalGate FindPortal(string id)
        {
            foreach (var portal in portals)
                if (portal != null && string.Equals(portal.PortalId, id, StringComparison.Ordinal))
                    return portal;
            return null;
        }

        public WorldPortalGate FindNearestPortal()
        {
            if (player == null) return null;
            WorldPortalGate nearest = null;
            var best = float.MaxValue;
            foreach (var portal in portals)
            {
                if (portal == null) continue;
                var distance = portal.FlatDistance(player.transform.position);
                if (distance >= best) continue;
                best = distance;
                nearest = portal;
            }
            return nearest;
        }

        public WorldPortalGate FindPortalInRange()
        {
            if (player == null) return null;
            WorldPortalGate nearest = null;
            var best = float.MaxValue;
            foreach (var portal in portals)
            {
                if (portal == null) continue;
                var distance = portal.FlatDistance(player.transform.position);
                if (distance > portal.InteractionRadius || distance >= best) continue;
                best = distance;
                nearest = portal;
            }
            return nearest;
        }

        public bool TryInteract()
        {
            var portal = FindPortalInRange();
            if (portal == null)
            {
                feedback = "No portal in range. Walk to a portal ring and press E.";
                return false;
            }
            if (!portal.Interactable)
            {
                feedback = portal.Label + " / " + portal.Status + " - the reusable kit is bound, the map is not playable yet.";
                return false;
            }
            feedback = "Entering " + portal.Label + "...";
            return portal.Interact();
        }

        public void SetReducedMotion(bool value)
        {
            reducedMotion = value;
            WorldPresentationSettings.ReducedMotion = value;
            feedback = value
                ? "Reduced motion: ambient movement paused; board, targets and portals stay readable."
                : "Full motion: bounded ambient movement resumed.";
        }

        public bool TryEnterPortal(string id)
        {
            var portal = FindPortal(id);
            if (portal == null || player == null) return false;
            return portal.Interact();
        }
    }
}
