using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.PetArena.Vfx
{
    internal sealed class ArenaDecalPool
    {
        private const int Capacity = 12;
        private const float FadeSeconds = .8f;
        private const float BaseHeight = .06f;

        private sealed class Slot
        {
            public Transform Transform;
            public MeshRenderer Renderer;
            public MaterialPropertyBlock Block;
            public Color Color;
            public float Remaining;
            public float Age;
            public float BaseSize;
            public float Size;
            public int Index;
            public bool Visible;
        }

        private readonly Slot[] slots = new Slot[Capacity];
        private readonly GameObject root;
        private readonly Mesh mesh;
        private readonly Material[] materials = new Material[ArenaVisualPalette.ElementCount];
        private readonly Texture2D[] textures = new Texture2D[ArenaVisualPalette.ElementCount];
        private int nextSlot;
        private bool reducedMotion;

        public int ActiveCount
        {
            get
            {
                var count = 0;
                for (var index = 0; index < slots.Length; index++)
                    if (slots[index].Visible) count++;
                return count;
            }
        }

        public ArenaDecalPool(Transform parent)
        {
            root = new GameObject("Decals");
            root.transform.SetParent(parent, false);
            root.hideFlags = HideFlags.DontSave;
            for (var index = 0; index < materials.Length; index++)
            {
                var element = (ArenaElement)index;
                textures[index] = ArenaRuntimeAssets.CreateDecalTexture(element, 64);
                materials[index] = ArenaRuntimeAssets.CreateMaterial(element + " Arena Decal", textures[index]);
            }
            mesh = ArenaRuntimeAssets.CreateQuad();
            for (var index = 0; index < slots.Length; index++)
                slots[index] = CreateSlot(index);
        }

        public void Show(ArenaElement element, Vector3 position, bool reduced)
        {
            var slot = FindSlot();
            slot.Color = ArenaVisualPalette.DecalColor(element);
            slot.BaseSize = ArenaVisualPalette.DecalSize(element);
            slot.Size = slot.BaseSize * (reduced ? .75f : 1f);
            slot.Remaining = FadeSeconds;
            slot.Age = 0f;
            slot.Visible = true;
            slot.Renderer.sharedMaterial = materials[(int)element];
            slot.Transform.gameObject.SetActive(true);
            slot.Transform.position = new Vector3(position.x,
                BaseHeight + slot.Index * .0005f, position.z);
            slot.Transform.rotation = Quaternion.Euler(0f,
                ((int)element * 37 + slot.Index * 53) % 360, 0f);
            var scale = reduced ? slot.Size : slot.Size * .82f;
            slot.Transform.localScale = new Vector3(scale, scale, scale);
            ApplyColor(slot, 1f);
        }

        public void Tick(float deltaTime)
        {
            if (deltaTime <= 0f) return;
            for (var index = 0; index < slots.Length; index++)
            {
                var slot = slots[index];
                if (!slot.Visible) continue;
                slot.Remaining -= deltaTime;
                slot.Age += deltaTime;
                if (slot.Remaining <= 0f)
                {
                    slot.Visible = false;
                    slot.Transform.gameObject.SetActive(false);
                    continue;
                }
                var alpha = Mathf.Clamp01(slot.Remaining / FadeSeconds);
                ApplyColor(slot, alpha * alpha);
                if (reducedMotion) continue;
                var grow = Mathf.Clamp01(slot.Age / .18f);
                var scale = Mathf.Lerp(slot.Size * .82f, slot.Size, grow);
                slot.Transform.localScale = new Vector3(scale, scale, scale);
            }
        }

        public void SetReducedMotion(bool reduced)
        {
            reducedMotion = reduced;
            for (var index = 0; index < slots.Length; index++)
            {
                var slot = slots[index];
                slot.Size = slot.BaseSize * (reduced ? .75f : 1f);
                if (slot.Visible)
                    slot.Transform.localScale = new Vector3(slot.Size, slot.Size, slot.Size);
            }
        }

        public void HideAll()
        {
            for (var index = 0; index < slots.Length; index++)
            {
                var slot = slots[index];
                slot.Visible = false;
                slot.Remaining = 0f;
                if (slot.Transform != null) slot.Transform.gameObject.SetActive(false);
            }
        }

        public void Dispose()
        {
            HideAll();
            ArenaRuntimeAssets.Destroy(root);
            ArenaRuntimeAssets.Destroy(mesh);
            for (var index = 0; index < materials.Length; index++)
            {
                ArenaRuntimeAssets.Destroy(materials[index]);
                ArenaRuntimeAssets.Destroy(textures[index]);
            }
        }

        private Slot CreateSlot(int index)
        {
            var slot = new Slot {Index = index};
            var part = new GameObject("Decal " + index);
            part.transform.SetParent(root.transform, false);
            part.hideFlags = HideFlags.DontSave;
            var filter = part.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            var renderer = part.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = materials[0];
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            slot.Transform = part.transform;
            slot.Renderer = renderer;
            slot.Block = new MaterialPropertyBlock();
            part.SetActive(false);
            return slot;
        }

        private Slot FindSlot()
        {
            for (var step = 0; step < slots.Length; step++)
            {
                var index = (nextSlot + step) % slots.Length;
                if (slots[index].Visible) continue;
                nextSlot = (index + 1) % slots.Length;
                return slots[index];
            }
            var oldest = slots[0];
            for (var index = 1; index < slots.Length; index++)
                if (slots[index].Remaining < oldest.Remaining) oldest = slots[index];
            nextSlot = (oldest.Index + 1) % slots.Length;
            return oldest;
        }

        private static void ApplyColor(Slot slot, float alpha)
        {
            var color = slot.Color;
            color.a = alpha * .8f;
            ArenaRuntimeAssets.SetColor(slot.Block, color);
            slot.Renderer.SetPropertyBlock(slot.Block);
        }
    }
}
