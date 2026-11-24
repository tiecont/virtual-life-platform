using System;
using UnityEngine;

namespace Aetheria.Icarus
{
    // Call only after the presentation layer accepts a cue for this actor.
    // A board snapshot, button press or timer does not initiate playback.
    [DisallowMultipleComponent, RequireComponent(typeof(IcarusWingController))]
    public sealed class IcarusSignaturePresentation : MonoBehaviour
    {
        public const string PetId = "pet-v3-fire-icarus";
        public const string Opcode = "FIRE_ZONE";

        private IcarusWingController wings;
        private IcarusBowString bowString;

        private void Awake()
        {
            wings = GetComponent<IcarusWingController>();
            bowString = GetComponent<IcarusBowString>();
        }

        public bool BeginSignature(string petId, string opcode)
        {
            if (!isActiveAndEnabled || !string.Equals(PetId, petId, StringComparison.Ordinal) ||
                !string.Equals(Opcode, opcode, StringComparison.Ordinal))
                return false;
            wings.OnUltimateStart();
            if (bowString != null) bowString.SetVisible(true);
            return true;
        }

        // Use for both playback completion and interruption, not for zone expiry.
        public void EndSignature()
        {
            if (wings != null) wings.OnUltimateEnd();
            if (bowString != null) bowString.SetVisible(false);
        }

        private void OnDisable() => EndSignature();
    }
}
