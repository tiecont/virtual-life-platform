using UnityEngine;

namespace Aetheria.Icarus
{
    [DisallowMultipleComponent]
    public sealed class IcarusBowString : MonoBehaviour
    {
        [SerializeField] private Transform upperEndpoint;
        [SerializeField] private Transform lowerEndpoint;
        [SerializeField] private LineRenderer line;
        [SerializeField, Min(0.0001f)] private float width = 0.006f;
        [SerializeField] private bool defaultOff = true;

        private Material runtimeMaterial;

        public bool IsVisible => line != null && line.enabled;

        private void Awake()
        {
            EnsureLine();
            SetVisible(!defaultOff);
        }

        public void SetVisible(bool visible)
        {
            EnsureLine();
            if (line == null) return;
            line.enabled = visible;
            line.widthMultiplier = width;
            line.positionCount = 2;
            UpdateLine();
        }

        private void LateUpdate()
        {
            if (line != null && line.enabled) UpdateLine();
        }

        private void EnsureLine()
        {
            if (line != null) return;
            line = GetComponent<LineRenderer>();
            if (line == null) line = gameObject.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.alignment = LineAlignment.View;
            line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            line.receiveShadows = false;
            var shader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default");
            if (shader == null) return;
            runtimeMaterial = new Material(shader) { name = "Icarus bowstring runtime material" };
            line.sharedMaterial = runtimeMaterial;
        }

        private void UpdateLine()
        {
            if (upperEndpoint == null || lowerEndpoint == null) return;
            line.SetPosition(0, upperEndpoint.position);
            line.SetPosition(1, lowerEndpoint.position);
        }

        private void OnDestroy()
        {
            if (runtimeMaterial != null) Destroy(runtimeMaterial);
        }
    }
}
