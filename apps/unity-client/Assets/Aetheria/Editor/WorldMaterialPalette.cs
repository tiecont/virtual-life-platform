using System;
using System.Collections.Generic;
using Aetheria.World.Domain;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.Editor
{
    // Creates the deterministic URP material set used by the modular world kit.
    // All values are authored here so re-running the builder does not churn the
    // committed material assets.
    public static class WorldMaterialPalette
    {
        public const string Folder = "Assets/Aetheria/Features/World/Content/Materials";
        private const string ShaderName = "Universal Render Pipeline/Lit";

        public static string ThemePath(string themeId, string key) => Folder + "/" + themeId + "-" + key + ".mat";

        public static string SharedPath(string key) => Folder + "/shared-" + key + ".mat";

        public static IReadOnlyDictionary<string, Material> EnsureMaterials(IEnumerable<WorldTheme> themes)
        {
            EnsureFolder(Folder);
            var shader = Shader.Find(ShaderName);
            if (shader == null) throw new InvalidOperationException("URP Lit shader is unavailable.");
            var materials = new Dictionary<string, Material>(StringComparer.Ordinal);
            foreach (var theme in themes)
            {
                foreach (var key in WorldMaterialKeys.ThemeKeys)
                {
                    var color = theme.MaterialColor(key);
                    var material = Ensure(ThemePath(theme.Id, key), theme.Id + " " + key, shader);
                    Configure(material, color, key, color);
                    materials[theme.Id + ":" + key] = material;
                }
            }
            for (var index = 0; index < WorldMaterialKeys.SharedKeys.Count; index++)
            {
                var key = WorldMaterialKeys.SharedKeys[index];
                var element = (WorldMapElement)index;
                var palette = WorldElementPalette.For(element);
                var material = Ensure(SharedPath(key), "portal " + element, shader);
                Configure(material, palette.Surface, WorldMaterialKeys.Emissive, WorldColor.Mix(palette.Accent, WorldColor.White, .1f));
                materials[key] = material;
            }
            AssetDatabase.SaveAssets();
            return materials;
        }

        private static Material Ensure(string path, string name, Shader shader)
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(material, path);
            }
            if (material.shader != shader) material.shader = shader;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static void Configure(Material material, WorldColor color, string key, WorldColor emission)
        {
            material.SetColor("_BaseColor", ToColor(color));
            material.SetColor("_Color", ToColor(color));
            material.SetFloat("_Smoothness", Smoothness(key));
            material.SetFloat("_Metallic", Metallic(key));
            var emissive = key == WorldMaterialKeys.Emissive ||
                           key == WorldMaterialKeys.Accent ||
                           key == WorldMaterialKeys.Grid ||
                           key == WorldMaterialKeys.BoardLight ||
                           key == WorldMaterialKeys.PortalFire ||
                           key == WorldMaterialKeys.PortalWater ||
                           key == WorldMaterialKeys.PortalElectric ||
                           key == WorldMaterialKeys.PortalGhost ||
                           key == WorldMaterialKeys.PortalGround ||
                           key == WorldMaterialKeys.PortalLight;
            if (emissive)
            {
                var lift = key == WorldMaterialKeys.Grid ? 1.1f : key == WorldMaterialKeys.BoardLight ? 1.15f : 2.1f;
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", ToColor(emission) * lift);
            }
            else
            {
                material.DisableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", Color.black);
            }

            var transparent = key == WorldMaterialKeys.Water;
            if (transparent)
            {
                material.SetFloat("_Surface", 1f);
                material.SetFloat("_Blend", 0f);
                material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                material.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                material.SetFloat("_ZWrite", 0f);
                material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                material.renderQueue = (int)RenderQueue.Transparent;
                material.SetOverrideTag("RenderType", "Transparent");
            }
            else
            {
                material.SetFloat("_Surface", 0f);
                material.SetFloat("_Blend", 0f);
                material.SetFloat("_SrcBlend", (float)BlendMode.One);
                material.SetFloat("_DstBlend", (float)BlendMode.Zero);
                material.SetFloat("_ZWrite", 1f);
                material.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
                material.renderQueue = -1;
                material.SetOverrideTag("RenderType", string.Empty);
            }
            material.enableInstancing = true;
        }

        private static float Smoothness(string key)
        {
            switch (key)
            {
                case WorldMaterialKeys.Metal: return .6f;
                case WorldMaterialKeys.Water: return .92f;
                case WorldMaterialKeys.Trim: return .38f;
                case WorldMaterialKeys.Accent: return .55f;
                case WorldMaterialKeys.Emissive: return .4f;
                default: return .16f;
            }
        }

        private static float Metallic(string key)
        {
            switch (key)
            {
                case WorldMaterialKeys.Metal: return .7f;
                case WorldMaterialKeys.Water: return .1f;
                default: return 0f;
            }
        }

        private static Color ToColor(WorldColor color) => new Color(color.R, color.G, color.B, color.A);

        private static void EnsureFolder(string path)
        {
            var segments = path.Split('/');
            var current = segments[0];
            for (var index = 1; index < segments.Length; index++)
            {
                var next = current + "/" + segments[index];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, segments[index]);
                current = next;
            }
        }
    }
}
