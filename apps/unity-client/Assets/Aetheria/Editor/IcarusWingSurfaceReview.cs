using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    /// <summary>Private, two-sided material diagnostics for an exact imported wing candidate.</summary>
    public static class IcarusWingSurfaceReview
    {
        private const string Candidate = "Assets/AetheriaH2AccessoryReview/Wings.glb";
        private const int Size = 960;

        [Serializable]
        private sealed class TextureFacts
        {
            public string name, graphicsFormat;
            public int width, height;
            public bool sRgb;
        }

        [Serializable]
        private sealed class MaterialFacts
        {
            public string name, shader;
            public Color baseColor;
            public float cull, metallic, smoothness, bumpScale;
            public bool normalKeyword, metallicGlossKeyword;
            public TextureFacts baseMap, normalMap, metallicGlossMap;
        }

        [Serializable]
        private sealed class Facts
        {
            public string classification = "PRIVATE_WING_SURFACE_DIAGNOSTICS";
            public string candidateSha256, projectColorSpace, graphicsDevice;
            public MaterialFacts[] materials;
            public string[] frames;
        }

        public static void Render()
        {
            string output = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_WING_SURFACE_OUTPUT");
            string expected = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_WING_SURFACE_SHA256");
            if (!Application.isBatchMode || SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null ||
                !Path.IsPathRooted(output ?? "") || Directory.Exists(output) || File.Exists(output))
                throw new InvalidOperationException("Use a private graphics-enabled batch Editor with a fresh surface evidence directory.");
            string input = Path.Combine(Path.GetDirectoryName(Application.dataPath), Candidate);
            string hash;
            using (var sha = SHA256.Create())
            using (var source = File.OpenRead(input))
                hash = BitConverter.ToString(sha.ComputeHash(source)).Replace("-", "").ToLowerInvariant();
            if (hash != expected) throw new InvalidOperationException("Stage and pin the exact candidate GLB for private surface review.");
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
            if (pipeline == null) throw new InvalidOperationException("Pinned URP pipeline missing.");
            var oldDefault = GraphicsSettings.defaultRenderPipeline;
            var oldQuality = QualitySettings.renderPipeline;
            var stage = new GameObject("Private wing surface review");
            var target = new RenderTexture(Size, Size, 24) { antiAliasing = 4 };
            var pixels = new Texture2D(Size, Size, TextureFormat.RGB24, false);
            var controls = new List<Material>();
            try
            {
                GraphicsSettings.defaultRenderPipeline = pipeline;
                QualitySettings.renderPipeline = pipeline;
                AssetDatabase.ImportAsset(Candidate, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                var imported = AssetDatabase.LoadAssetAtPath<GameObject>(Candidate);
                if (imported == null) throw new InvalidOperationException("The actual candidate did not import.");
                var model = Object.Instantiate(imported, stage.transform);
                foreach (var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                {
                    int fold = skin.sharedMesh.GetBlendShapeIndex("WingFold");
                    if (fold >= 0) skin.SetBlendShapeWeight(fold, 0);
                }
                using var surfaces = new IcarusH2AccessoryMotionPreview.SampledSurfaceDraw(model);
                surfaces.Refresh();
                var renderers = model.GetComponentsInChildren<Renderer>(false).Where(value => value.enabled).ToArray();
                if (renderers.Length == 0) throw new InvalidOperationException("The imported wing has no rendered surfaces.");
                var original = renderers.Select(value => value.sharedMaterials).ToArray();
                var materials = original.SelectMany(slots => slots).Where(value => value != null).Distinct().ToArray();
                var unlit = Shader.Find("Universal Render Pipeline/Unlit");
                if (unlit == null || materials.Length == 0 || materials.Any(value => Map(value, "_BaseMap") == null))
                    throw new InvalidOperationException("Expected an actual imported BaseColor texture for every surface.");
                var records = materials.Select(Inspect).ToArray();
                var normalOff = materials.ToDictionary(material => material, material =>
                {
                    var control = new Material(material);
                    control.DisableKeyword("_NORMALMAP");
                    control.SetTexture("_BumpMap", null);
                    controls.Add(control);
                    return control;
                });
                var baseOnly = materials.ToDictionary(material => material, material =>
                {
                    var control = new Material(unlit);
                    control.SetTexture("_BaseMap", Map(material, "_BaseMap"));
                    control.SetColor("_BaseColor", material.GetColor("_BaseColor"));
                    control.SetFloat("_Cull", (float)CullMode.Off);
                    controls.Add(control);
                    return control;
                });
                var frames = new List<string>();
                var camera = new GameObject("Surface review camera").AddComponent<Camera>();
                camera.transform.SetParent(stage.transform, false);
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(.15f, .15f, .15f);
                camera.orthographic = true;
                camera.nearClipPlane = .01f;
                camera.farClipPlane = 25;
                camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
                var key = new GameObject("Surface key").AddComponent<Light>();
                key.transform.SetParent(stage.transform, false);
                key.type = LightType.Directional;
                key.color = Color.white;
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(.28f, .28f, .28f);
                RenderSettings.reflectionIntensity = .25f;
                target.Create();
                var bounds = IcarusH2AccessoryMotionPreview.BoundsFor(model);
                Directory.CreateDirectory(output);
                foreach (int face in new[] { 1, -1 })
                {
                    var view = new Vector3(0, .08f, face);
                    string side = face == 1 ? "plus-z" : "minus-z";
                    void Shot(string mode, Func<Material, Material> apply)
                    {
                        for (int i = 0; i < renderers.Length; i++) renderers[i].sharedMaterials = original[i].Select(apply).ToArray();
                        string name = side + "-" + mode + ".png";
                        IcarusH2AccessoryMotionPreview.Capture(camera, target, pixels, bounds, view, Path.Combine(output, name));
                        frames.Add(name);
                    }
                    key.transform.rotation = Quaternion.Euler(28, -32, 0);
                    key.intensity = .45f;
                    Shot("fixed-key", material => material);
                    key.transform.rotation = Quaternion.LookRotation(new Vector3(.10f, -.35f, -face));
                    key.intensity = .95f;
                    Shot("balanced-lit", material => material);
                    Shot("balanced-normal-off", material => normalOff[material]);
                    Shot("basecolor-control", material => baseOnly[material]);
                }
                var facts = new Facts {
                    candidateSha256 = hash, projectColorSpace = QualitySettings.activeColorSpace.ToString(),
                    graphicsDevice = SystemInfo.graphicsDeviceType.ToString(), materials = records, frames = frames.ToArray(),
                };
                File.WriteAllText(Path.Combine(output, "wing-surface-review.json"), JsonUtility.ToJson(facts, true) + "\n");
            }
            finally
            {
                foreach (var material in controls) Object.DestroyImmediate(material);
                Object.DestroyImmediate(stage);
                target.Release();
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(pixels);
                GraphicsSettings.defaultRenderPipeline = oldDefault;
                QualitySettings.renderPipeline = oldQuality;
            }
        }

        private static MaterialFacts Inspect(Material material) => new MaterialFacts {
            name = material.name, shader = material.shader.name, baseColor = material.GetColor("_BaseColor"),
            cull = material.GetFloat("_Cull"), metallic = material.GetFloat("_Metallic"),
            smoothness = material.GetFloat("_Smoothness"), bumpScale = material.GetFloat("_BumpScale"),
            normalKeyword = material.IsKeywordEnabled("_NORMALMAP"),
            metallicGlossKeyword = material.IsKeywordEnabled("_METALLICSPECGLOSSMAP"),
            baseMap = TextureInfo(Map(material, "_BaseMap")), normalMap = TextureInfo(Map(material, "_BumpMap")),
            metallicGlossMap = TextureInfo(Map(material, "_MetallicGlossMap")),
        };

        private static Texture Map(Material material, string name) => material.HasProperty(name) ? material.GetTexture(name) : null;

        private static TextureFacts TextureInfo(Texture texture) => texture == null ? null : new TextureFacts {
            name = texture.name, width = texture.width, height = texture.height, graphicsFormat = texture.graphicsFormat.ToString(),
            sRgb = GraphicsFormatUtility.IsSRGBFormat(texture.graphicsFormat),
        };
    }
}
