using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Central Plaza hub: spawn pad, walkable plaza, modular props and six
    // campaign portals. The shared
    // base owns locomotion, spawn handoff and portal interaction.
    public sealed class HubWorldController : WorldSceneControllerBase
    {
        public int ActivePortalCount
        {
            get
            {
                var count = 0;
                foreach (var portal in Portals)
                    if (portal != null && portal.Interactable) count++;
                return count;
            }
        }

        public int FoundationMarkerCount
        {
            get
            {
                var count = 0;
                foreach (var portal in Portals)
                    if (portal != null && !portal.Interactable) count++;
                return count;
            }
        }

        public bool IsHub => Identity != null && Identity.Kind == WorldLayoutKind.Hub;
    }
}
