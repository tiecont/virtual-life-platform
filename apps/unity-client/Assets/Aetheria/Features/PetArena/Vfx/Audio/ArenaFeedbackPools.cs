using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.PetArena.Vfx
{
    internal static class ArenaFeedbackTextures
    {
        public static Texture2D CreateRing(int size, float thickness)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.name = "Arena Feedback Ring";
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            var center = (size - 1) * .5f;
            var radius = size * .5f;
            var width = Mathf.Max(.01f, thickness);
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var dx = (x - center) / radius;
                var dy = (y - center) / radius;
                var distance = Mathf.Sqrt(dx * dx + dy * dy);
                var alpha = Mathf.Clamp01(1f - Mathf.Abs(distance - .82f) / width);
                pixels[y * size + x] = new Color32(255, 255, 255,
                    (byte)Mathf.RoundToInt(Mathf.Clamp01(alpha) * 255f));
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, false);
            return texture;
        }
    }

    // Pooled ring feedback for tile selection, matches and invalid swaps.
    internal sealed class ArenaTileFeedbackPool
    {
        private const int Capacity = 24;
        private const float FadeSeconds = .55f;

        private sealed class Slot
        {
            public Transform Transform;
            public MeshRenderer Renderer;
            public MaterialPropertyBlock Block;
            public Color Color;
            public float Remaining;
            public float Age;
            public float Size;
            public int Index;
            public bool Visible;
        }

        private readonly Slot[] slots = new Slot[Capacity];
        private readonly GameObject root;
        private readonly Mesh mesh;
        private readonly Material material;
        private readonly Texture2D texture;
        private int nextSlot;
        private bool reducedMotion;

        public ArenaTileFeedbackPool(Transform parent)
        {
            root = new GameObject("Board Feedback");
            root.transform.SetParent(parent, false);
            root.hideFlags = HideFlags.DontSave;
            texture = ArenaFeedbackTextures.CreateRing(64, .07f);
            material = ArenaRuntimeAssets.CreateMaterial("Arena Board Feedback", texture);
            mesh = ArenaRuntimeAssets.CreateQuad();
            for (var index = 0; index < slots.Length; index++)
                slots[index] = CreateSlot(index);
        }

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

        public void Show(Color color, Vector3 position, float size, float seconds = FadeSeconds)
        {
            var slot = FindSlot();
            slot.Color = color;
            slot.Size = Mathf.Max(.05f, size);
            slot.Remaining = Mathf.Max(.05f, seconds);
            slot.Age = 0f;
            slot.Visible = true;
            slot.Transform.gameObject.SetActive(true);
            slot.Transform.position = new Vector3(position.x, .065f, position.z);
            slot.Transform.localScale = new Vector3(slot.Size, slot.Size, slot.Size);
            slot.Renderer.sharedMaterial = material;
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
                ApplyColor(slot, alpha);
                if (reducedMotion) continue;
                var scale = slot.Size * Mathf.Lerp(1f, 1.18f, Mathf.Clamp01(slot.Age / .3f));
                slot.Transform.localScale = new Vector3(scale, scale, scale);
            }
        }

        public void SetReducedMotion(bool reduced)
        {
            reducedMotion = reduced;
        }

        public void HideAll()
        {
            for (var index = 0; index < slots.Length; index++)
            {
                slots[index].Visible = false;
                slots[index].Remaining = 0f;
                if (slots[index].Transform != null) slots[index].Transform.gameObject.SetActive(false);
            }
        }

        public void Dispose()
        {
            HideAll();
            ArenaRuntimeAssets.Destroy(root);
            ArenaRuntimeAssets.Destroy(mesh);
            ArenaRuntimeAssets.Destroy(material);
            ArenaRuntimeAssets.Destroy(texture);
        }

        private Slot CreateSlot(int index)
        {
            var slot = new Slot {Index = index};
            var part = new GameObject("Board Feedback " + index);
            part.transform.SetParent(root.transform, false);
            part.hideFlags = HideFlags.DontSave;
            part.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = part.AddComponent<MeshRenderer>();
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
            color.a = Mathf.Clamp01(alpha) * .8f;
            slot.Block.SetColor("_BaseColor", color);
            slot.Renderer.SetPropertyBlock(slot.Block);
        }
    }

    // Bounded Icarus FIRE_ZONE overlay: four by four tiles, presentation only.
    internal sealed class ArenaIcarusFireZoneVfx
    {
        private const int MaxSide = 4;
        private const int MaxCells = MaxSide * MaxSide;
        private const float FrameSeconds = 2f;

        private sealed class Cell
        {
            public Transform Transform;
            public MeshRenderer Renderer;
            public MaterialPropertyBlock Block;
            public bool Visible;
        }

        private readonly Cell[] cells = new Cell[MaxCells];
        private readonly GameObject root;
        private readonly Mesh mesh;
        private readonly Material material;
        private readonly Texture2D texture;
        private int cellCount;
        private float age;
        private bool active;

        public ArenaIcarusFireZoneVfx(Transform parent)
        {
            root = new GameObject("Icarus Fire Zone");
            root.transform.SetParent(parent, false);
            root.hideFlags = HideFlags.DontSave;
            texture = ArenaRuntimeAssets.CreateDecalTexture(ArenaElement.Fire, 64);
            material = ArenaRuntimeAssets.CreateMaterial("Icarus Fire Zone", texture);
            mesh = ArenaRuntimeAssets.CreateQuad();
            for (var index = 0; index < cells.Length; index++)
                cells[index] = CreateCell(index);
        }

        public bool IsActive => active;
        public int CellCount => cellCount;

        public int Show(Vector3 origin, float cellSize, int side)
        {
            Hide();
            var clampedSide = Mathf.Clamp(side, 1, MaxSide);
            var clampedCell = Mathf.Clamp(cellSize, .2f, 3f);
            var offset = (clampedSide - 1) * .5f;
            var index = 0;
            var color = ArenaVisualPalette.DecalColor(ArenaElement.Fire);
            for (var row = 0; row < clampedSide; row++)
            for (var column = 0; column < clampedSide; column++)
            {
                var cell = cells[index++];
                cell.Transform.position = new Vector3(
                    origin.x + (column - offset) * clampedCell,
                    .075f + row * .0004f,
                    origin.z + (row - offset) * clampedCell);
                var scale = clampedCell * .96f;
                cell.Transform.localScale = new Vector3(scale, scale, scale);
                cell.Renderer.sharedMaterial = material;
                cell.Visible = true;
                cell.Transform.gameObject.SetActive(true);
                color.a = .55f;
                cell.Block.SetColor("_BaseColor", color);
                cell.Renderer.SetPropertyBlock(cell.Block);
            }
            cellCount = index;
            active = true;
            age = 0f;
            return cellCount;
        }

        public void Tick(float deltaTime)
        {
            if (!active || deltaTime <= 0f) return;
            age += deltaTime;
            var pulse = .62f + .24f * Mathf.Sin(age * 6f);
            for (var index = 0; index < cellCount; index++)
            {
                var cell = cells[index];
                if (!cell.Visible) continue;
                var color = ArenaVisualPalette.DecalColor(ArenaElement.Fire);
                color.a = pulse;
                cell.Block.SetColor("_BaseColor", color);
                cell.Renderer.SetPropertyBlock(cell.Block);
            }
        }

        public void Hide()
        {
            for (var index = 0; index < cells.Length; index++)
            {
                cells[index].Visible = false;
                if (cells[index].Transform != null) cells[index].Transform.gameObject.SetActive(false);
            }
            cellCount = 0;
            active = false;
            age = 0f;
        }

        public void Dispose()
        {
            Hide();
            ArenaRuntimeAssets.Destroy(root);
            ArenaRuntimeAssets.Destroy(mesh);
            ArenaRuntimeAssets.Destroy(material);
            ArenaRuntimeAssets.Destroy(texture);
        }

        private Cell CreateCell(int index)
        {
            var cell = new Cell();
            var part = new GameObject("Fire Zone Cell " + index);
            part.transform.SetParent(root.transform, false);
            part.hideFlags = HideFlags.DontSave;
            part.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = part.AddComponent<MeshRenderer>();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            cell.Transform = part.transform;
            cell.Renderer = renderer;
            cell.Block = new MaterialPropertyBlock();
            part.SetActive(false);
            return cell;
        }
    }

    // Camera flash and shake with explicit reduced-motion and flash toggles.
    // Both effects restore the camera exactly when they finish.
    internal sealed class ArenaScreenFeedback
    {
        private readonly Mesh mesh;
        private readonly Material material;
        private readonly Texture2D texture;
        private GameObject flashObject;
        private MeshRenderer flashRenderer;
        private MaterialPropertyBlock block;
        private Camera boundCamera;
        private float flashRemaining;
        private float flashDuration;
        private float flashAlpha;
        private Color flashColor = Color.white;
        private float shakeRemaining;
        private float shakeDuration;
        private float shakeMagnitude;
        private Vector3 shakeOrigin;
        private Transform shakeTarget;
        private bool shakeApplied;

        public ArenaScreenFeedback()
        {
            texture = Texture2D.whiteTexture;
            material = ArenaRuntimeAssets.CreateMaterial("Arena Screen Flash", texture);
            mesh = CreateScreenQuad();
        }

        public bool FlashEnabled { get; set; } = true;
        public bool ReducedMotion { get; set; }
        public bool FlashActive => flashRemaining > 0f;
        public bool ShakeActive => shakeRemaining > 0f;

        public bool Flash(Camera camera, Color color, float seconds, float alpha)
        {
            if (!FlashEnabled || camera == null) return false;
            if (!Bind(camera)) return false;
            flashColor = color;
            flashAlpha = Mathf.Clamp01(alpha) * (ReducedMotion ? .35f : 1f);
            flashDuration = Mathf.Max(.05f, seconds);
            flashRemaining = flashDuration;
            flashObject.SetActive(true);
            ApplyFlash(1f);
            return true;
        }

        public bool Shake(Camera camera, float magnitude, float seconds)
        {
            if (camera == null || magnitude <= 0f || ReducedMotion) return false;
            if (shakeApplied) RestoreShake();
            shakeTarget = camera.transform;
            shakeOrigin = shakeTarget.localPosition;
            shakeMagnitude = magnitude;
            shakeDuration = Mathf.Max(.05f, seconds);
            shakeRemaining = shakeDuration;
            shakeApplied = true;
            return true;
        }

        public void Tick(float deltaTime)
        {
            if (deltaTime <= 0f) return;
            if (flashRemaining > 0f)
            {
                flashRemaining -= deltaTime;
                if (flashRemaining <= 0f)
                {
                    flashRemaining = 0f;
                    if (flashObject != null) flashObject.SetActive(false);
                }
                else
                {
                    ApplyFlash(flashRemaining / flashDuration);
                }
            }
            if (!shakeApplied) return;
            shakeRemaining -= deltaTime;
            if (shakeRemaining <= 0f)
            {
                RestoreShake();
                return;
            }
            if (shakeTarget == null)
            {
                shakeApplied = false;
                return;
            }
            var falloff = shakeRemaining / shakeDuration;
            var offset = Random.insideUnitSphere * (shakeMagnitude * falloff);
            offset.y *= .5f;
            shakeTarget.localPosition = shakeOrigin + offset;
        }

        public void Dispose()
        {
            RestoreShake();
            if (flashObject != null)
            {
                ArenaRuntimeAssets.Destroy(flashObject);
                flashObject = null;
            }
            flashRenderer = null;
            ArenaRuntimeAssets.Destroy(material);
            ArenaRuntimeAssets.Destroy(mesh);
        }

        private bool Bind(Camera camera)
        {
            if (camera == null) return false;
            if (flashObject != null && boundCamera == camera) return true;
            if (flashObject == null)
            {
                flashObject = new GameObject("Arena Screen Flash");
                flashObject.hideFlags = HideFlags.DontSave;
                flashObject.AddComponent<MeshFilter>().sharedMesh = mesh;
                flashRenderer = flashObject.AddComponent<MeshRenderer>();
                flashRenderer.shadowCastingMode = ShadowCastingMode.Off;
                flashRenderer.receiveShadows = false;
                flashRenderer.lightProbeUsage = LightProbeUsage.Off;
                flashRenderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
                flashRenderer.sharedMaterial = material;
                block = new MaterialPropertyBlock();
            }
            flashObject.transform.SetParent(camera.transform, false);
            boundCamera = camera;
            var depth = Mathf.Max(camera.nearClipPlane + .05f, .25f);
            var height = 2f * depth * Mathf.Tan(camera.fieldOfView * Mathf.Deg2Rad * .5f) * 1.2f;
            var width = height * Mathf.Max(.5f, camera.aspect) * 1.2f;
            flashObject.transform.localPosition = new Vector3(0f, 0f, depth);
            flashObject.transform.localRotation = Quaternion.identity;
            flashObject.transform.localScale = new Vector3(width, height, 1f);
            return true;
        }

        private void ApplyFlash(float alpha)
        {
            if (flashRenderer == null) return;
            var color = flashColor;
            color.a = Mathf.Clamp01(flashAlpha * alpha);
            block.SetColor("_BaseColor", color);
            flashRenderer.SetPropertyBlock(block);
        }

        private void RestoreShake()
        {
            if (shakeApplied && shakeTarget != null) shakeTarget.localPosition = shakeOrigin;
            shakeApplied = false;
            shakeRemaining = 0f;
            shakeTarget = null;
        }

        private static Mesh CreateScreenQuad()
        {
            var mesh = new Mesh {name = "Arena Screen Quad"};
            mesh.SetVertices(new[]
            {
                new Vector3(-.5f, -.5f, 0f),
                new Vector3(-.5f, .5f, 0f),
                new Vector3(.5f, .5f, 0f),
                new Vector3(.5f, -.5f, 0f)
            });
            mesh.SetUVs(0, new[]
            {
                new Vector2(0f, 0f),
                new Vector2(0f, 1f),
                new Vector2(1f, 1f),
                new Vector2(1f, 0f)
            });
            mesh.SetColors(new[] {Color.white, Color.white, Color.white, Color.white});
            mesh.SetTriangles(new[] {0, 1, 2, 0, 2, 3}, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
