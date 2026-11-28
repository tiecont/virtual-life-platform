using System;
using UnityEngine;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;

namespace Aetheria.PetArena.Presentation
{
    // Procedural art candidates are available only in an opted-in development session.
    internal static class WaveD4BattlePreview
    {
        private const string PreviewVariable = "AETHERIA_WAVED4_BATTLE_PREVIEW";
        private const string ResourcesRoot = "WaveD4/";

        private static bool Enabled => Debug.isDebugBuild &&
            Environment.GetEnvironmentVariable(PreviewVariable) == "1";

        public static void AddIdentity(VisualElement panel, Label label, string id, bool opponent = false)
        {
            var portrait = Enabled && HasMedia(id, opponent)
                ? Resources.Load<Texture2D>(ResourcesRoot + "Portraits/" + id) : null;
            if (portrait == null)
            {
                panel.Add(label);
                return;
            }

            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            var icon = new Image
            {
                name = "battle-preview-portrait", image = portrait,
                scaleMode = ScaleMode.ScaleToFit, pickingMode = PickingMode.Ignore
            };
            icon.style.width = 40;
            icon.style.height = 26;
            icon.style.flexShrink = 0;
            label.style.flexShrink = 1;
            row.Add(icon);
            row.Add(label);
            panel.Add(row);
        }

        public static Actor Place(Transform anchor, string id, float baseOffset, bool opponent = false)
        {
            if (!Enabled || anchor == null || !HasMedia(id, opponent)) return null;
            var asset = Resources.Load<GameObject>(ResourcesRoot + "Models/" + id);
            if (asset == null) return null;

            var fallback = Array.FindAll(anchor.GetComponentsInChildren<Renderer>(true),
                renderer => !renderer.forceRenderingOff);
            var holder = new GameObject("Wave D4 preview · " + id);
            holder.transform.SetParent(anchor, false);
            // The Blender candidates face -Y, which imports facing +Z.
            holder.transform.localRotation = Quaternion.Euler(0f, opponent ? 160f : 200f, 0f);
            var model = Object.Instantiate(asset, holder.transform, false);
            foreach (var animation in model.GetComponentsInChildren<Animation>(true))
                animation.enabled = false;
            foreach (var animator in model.GetComponentsInChildren<Animator>(true))
                animator.enabled = false;

            var size = id.EndsWith("-warden", StringComparison.Ordinal) ? 2.3f : 1.8f;
            if (!TryFit(holder.transform, anchor.position, baseOffset, size))
            {
                holder.SetActive(false);
                Object.Destroy(holder);
                return null;
            }
            foreach (var renderer in fallback) renderer.forceRenderingOff = true;
            return new Actor(holder, fallback);
        }

        private static bool HasMedia(string id, bool opponent) => opponent
            ? id is "cinder-terraces-regular" or "cinder-terraces-warden" or "tideglass-lagoon-warden"
            : id is "fire-coalwhisk" or "water-dewskip" or "ground-clodkin";

        private static bool TryFit(Transform holder, Vector3 anchor, float baseOffset, float size)
        {
            var renderers = Array.FindAll(holder.GetComponentsInChildren<Renderer>(),
                renderer => renderer.enabled &&
                    (renderer is SkinnedMeshRenderer skin && skin.sharedMesh != null ||
                     renderer is MeshRenderer && renderer.GetComponent<MeshFilter>()?.sharedMesh != null));
            if (renderers.Length == 0) return false;
            var bounds = renderers[0].bounds;
            foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
            var extent = Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z);
            if (!(extent > .001f) || float.IsInfinity(extent)) return false;

            var scale = size / extent;
            holder.localScale *= scale;
            var center = anchor + (bounds.center - anchor) * scale;
            var bottom = anchor.y + (bounds.min.y - anchor.y) * scale;
            holder.position += new Vector3(anchor.x - center.x, anchor.y + baseOffset - bottom, anchor.z - center.z);
            return true;
        }

        internal sealed class Actor : IDisposable
        {
            private readonly GameObject holder;
            private readonly Renderer[] fallback;

            internal Actor(GameObject holder, Renderer[] fallback)
            {
                this.holder = holder;
                this.fallback = fallback;
            }

            public void Dispose()
            {
                if (holder == null || !holder.activeSelf) return;
                holder.SetActive(false);
                Object.Destroy(holder);
                foreach (var renderer in fallback)
                    if (renderer != null) renderer.forceRenderingOff = false;
            }
        }
    }
}
