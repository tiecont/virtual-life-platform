using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // A modular portal binding. Interacting loads the target scene and hands a
    // named spawn anchor to the destination controller. Inactive entries are
    // explicit foundation markers and never load anything.
    public sealed class WorldPortalGate : MonoBehaviour
    {
        [SerializeField] private string portalId = string.Empty;
        [SerializeField] private string label = string.Empty;
        [SerializeField] private string targetScene = string.Empty;
        [SerializeField] private string targetSpawnId = string.Empty;
        [SerializeField] private string status = string.Empty;
        [SerializeField] private bool interactable;
        [SerializeField] private float interactionRadius = 3f;

        public string PortalId => portalId;
        public string Label => label;
        public string TargetScene => targetScene;
        public string TargetSpawnId => targetSpawnId;
        public string Status => status;
        public bool Interactable => interactable;
        public float InteractionRadius => interactionRadius;

        public void Configure(WorldPortalDefinition definition)
        {
            if (definition == null) return;
            portalId = definition.Id;
            label = definition.Label;
            targetScene = definition.TargetScene;
            targetSpawnId = definition.TargetSpawnId;
            status = definition.Status;
            interactable = definition.Interactable;
        }

        public float FlatDistance(Vector3 point)
        {
            var offset = point - transform.position;
            offset.y = 0f;
            return offset.magnitude;
        }

        public bool IsInRange(Vector3 point) => FlatDistance(point) <= interactionRadius;

        public bool Interact()
        {
            if (!interactable || string.IsNullOrEmpty(targetScene)) return false;
            return WorldSceneFlow.Load(targetScene, targetSpawnId);
        }
    }
}
