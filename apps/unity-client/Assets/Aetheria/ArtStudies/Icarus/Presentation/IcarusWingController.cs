using UnityEngine;

namespace Aetheria.Icarus
{
    [DisallowMultipleComponent]
    public sealed class IcarusWingController : MonoBehaviour
    {
        [SerializeField] private Transform wingSocket;
        [SerializeField] private Transform haloSocket;
        [SerializeField, Min(0)] private float transitionSeconds = .22f;
        [SerializeField] private string dissolveProperty = "_DissolveAmount";
        [SerializeField, Min(0)] private float haloFloatMeters = .025f;
        [SerializeField, Min(0)] private float haloCyclesPerSecond = .55f;
        [SerializeField] private float haloDegreesPerSecond = 24;

        private (Renderer renderer, int slot)[] dissolveSlots;
        private MaterialPropertyBlock properties;
        private int dissolveId;
        private Vector3 wingScale;
        private Vector3 haloPosition;
        private Quaternion haloRotation;
        private bool manualWings;
        private bool signatureWings;
        private bool reducedMotion = true;
        private float reveal;
        private float haloTime;
        private bool initialized;

        public bool WingsRequested => manualWings || signatureWings;

        private void Awake()
        {
            if (wingSocket != null)
            {
                wingScale = wingSocket.localScale;
                var slots = new System.Collections.Generic.List<(Renderer, int)>();
                if (!string.IsNullOrWhiteSpace(dissolveProperty))
                {
                    dissolveId = Shader.PropertyToID(dissolveProperty);
                    foreach (Renderer renderer in wingSocket.GetComponentsInChildren<Renderer>(true))
                    {
                        var materials = renderer.sharedMaterials;
                        for (var i = 0; i < materials.Length; i++)
                            if (materials[i] != null && materials[i].HasProperty(dissolveId)) slots.Add((renderer, i));
                    }
                }
                dissolveSlots = slots.ToArray();
                if (dissolveSlots.Length != 0) properties = new MaterialPropertyBlock();
            }
            if (haloSocket != null)
            {
                haloPosition = haloSocket.localPosition;
                haloRotation = haloSocket.localRotation;
            }
            initialized = true;
            ApplyWingReveal(0);
        }

        public void SetWingsVisible(bool visible)
        {
            manualWings = visible;
            RefreshRequestedVisibility();
        }

        public void ToggleWings() => SetWingsVisible(!manualWings);

        public void OnUltimateStart()
        {
            signatureWings = true;
            RefreshRequestedVisibility();
        }

        public void OnUltimateEnd()
        {
            signatureWings = false;
            RefreshRequestedVisibility();
        }

        public void SetReducedMotion(bool value)
        {
            reducedMotion = value;
            RefreshRequestedVisibility();
            if (value) ResetHalo();
        }

        private void RefreshRequestedVisibility()
        {
            if (!initialized || !isActiveAndEnabled) return;
            if (reducedMotion || transitionSeconds <= 0) ApplyWingReveal(WingsRequested ? 1 : 0);
        }

        private void LateUpdate()
        {
            var dt = Time.unscaledDeltaTime;
            float target = WingsRequested ? 1 : 0;
            if (!Mathf.Approximately(reveal, target))
                ApplyWingReveal(reducedMotion || transitionSeconds <= 0
                    ? target : Mathf.MoveTowards(reveal, target, dt / transitionSeconds));

            if (haloSocket == null || reducedMotion) return;
            haloTime += dt;
            haloSocket.localPosition = haloPosition +
                Vector3.up * (Mathf.Sin(haloTime * (2 * Mathf.PI) * haloCyclesPerSecond) * haloFloatMeters);
            haloSocket.localRotation = haloRotation *
                Quaternion.AngleAxis(Mathf.Repeat(haloTime * haloDegreesPerSecond, 360), Vector3.up);
        }

        private void ApplyWingReveal(float value)
        {
            reveal = value;
            if (wingSocket == null) return;
            if (value == 0 && wingSocket.gameObject.activeSelf) wingSocket.gameObject.SetActive(false);
            float eased = Mathf.SmoothStep(0, 1, value);
            wingSocket.localScale = wingScale * eased;
            foreach (var (renderer, slot) in dissolveSlots)
            {
                if (renderer == null) continue;
                renderer.GetPropertyBlock(properties, slot);
                properties.SetFloat(dissolveId, 1 - eased);
                renderer.SetPropertyBlock(properties, slot);
            }
            if (value > 0 && !wingSocket.gameObject.activeSelf) wingSocket.gameObject.SetActive(true);
        }

        private void ResetHalo()
        {
            haloTime = 0;
            if (!initialized || haloSocket == null) return;
            haloSocket.localPosition = haloPosition;
            haloSocket.localRotation = haloRotation;
        }

        private void OnDisable()
        {
            manualWings = signatureWings = false;
            ApplyWingReveal(0);
            ResetHalo();
        }
    }
}
