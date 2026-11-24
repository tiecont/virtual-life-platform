using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    internal static class ArenaRuntimeAssets
    {
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");

        public static void Destroy(Object target)
        {
            if (target == null) return;
            if (Application.isPlaying) Object.Destroy(target);
            else Object.DestroyImmediate(target);
        }

        public static Texture2D CreateDecalTexture(ArenaElement element, int size) =>
            CreateTexture(element + " Arena Mark", size, element);

        public static Texture2D CreateParticleTexture(int size) =>
            CreateTexture("Arena Particle Dot", size, null);

        private static Texture2D CreateTexture(string name, int size, ArenaElement? element)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.name = name;
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            var center = (size - 1) * .5f;
            var radius = size * .5f;
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var dx = (x - center) / radius;
                var dy = (y - center) / radius;
                var distance = Mathf.Sqrt(dx * dx + dy * dy);
                var alpha = element.HasValue
                    ? DecalAlpha(element.Value, dx, dy, distance)
                    : Mathf.Pow(Mathf.Clamp01(1f - distance), 2f);
                pixels[y * size + x] = new Color32(255, 255, 255,
                    (byte)Mathf.RoundToInt(Mathf.Clamp01(alpha) * 255f));
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static float DecalAlpha(ArenaElement element, float x, float y, float radius)
        {
            var angle = Mathf.Atan2(y, x);
            var body = Mathf.Clamp01(1f - radius * 1.25f) * .18f;
            switch (element)
            {
                case ArenaElement.Water:
                    return body + .65f * Mathf.Max(Ring(radius, .76f, .06f), Ring(radius, .49f, .07f));
                case ArenaElement.Electric:
                    return body + .8f * Ring(radius, .66f + .14f * Mathf.Cos(angle * 4f), .06f);
                case ArenaElement.Ghost:
                    return body + .72f * Ring(radius, .73f, .09f) * (.6f + .4f * Mathf.Sin(angle * 3f));
                case ArenaElement.Ground:
                    return body + .74f * Ring(radius, .59f + .18f * Mathf.Cos(angle * 5f), .07f);
                case ArenaElement.Light:
                    var rays = Mathf.Pow(Mathf.Abs(Mathf.Cos(angle * 3f)), 20f);
                    return body + .68f * Mathf.Max(Ring(radius, .68f, .055f), rays * (1f - Mathf.SmoothStep(.65f, 1f, radius)));
                default:
                    return body + .82f * Ring(radius, .72f + .035f * Mathf.Sin(angle * 11f), .11f);
            }
        }

        private static float Ring(float radius, float center, float width) =>
            Mathf.Clamp01(1f - Mathf.Abs(radius - center) / width);

        public static Mesh CreateQuad()
        {
            var mesh = new Mesh {name = "Arena Decal Quad"};
            mesh.SetVertices(new[] {
                new Vector3(-.5f, 0f, -.5f),
                new Vector3(-.5f, 0f, .5f),
                new Vector3(.5f, 0f, .5f),
                new Vector3(.5f, 0f, -.5f),
            });
            mesh.SetUVs(0, new[] {
                new Vector2(0f, 0f),
                new Vector2(0f, 1f),
                new Vector2(1f, 1f),
                new Vector2(1f, 0f),
            });
            mesh.SetColors(new[] {Color.white, Color.white, Color.white, Color.white});
            mesh.SetTriangles(new[] {0, 1, 2, 0, 2, 3}, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        public static Material CreateMaterial(string name, Texture texture)
        {
            var shader = Resources.Load<Shader>("Wave1Vfx");
            if (shader == null) return null;
            var material = new Material(shader) { name = name };
            material.SetTexture(BaseMapId, texture);
            return material;
        }

        public static void SetColor(MaterialPropertyBlock block, Color color) =>
            block.SetColor(BaseColorId, color);
    }
}
