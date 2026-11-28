using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Aetheria.Editor
{
    // Explicit offline review command; the pilot never enters a gameplay scene.
    public static class IcarusPilotReview
    {
        private const string Root = "Assets/Aetheria/ArtStudies/IcarusV3Pilot";
        private const string Model = Root + "/icarus-review.fbx";
        [Serializable] private sealed class ClipFact
        {
            public string name;
            public float seconds;
            public float maximumVertexDisplacementMeters;
            public bool canonicalAccepted;
        }
        [Serializable] private sealed class Facts
        {
            public string state = "ART_REVISION_REQUIRED";
            public string editor;
            public string graphicsDevice;
            public string graphicsApi;
            public string renderMethod = "SampleAnimation + BakeMesh + URP GPU render";
            public int triangles;
            public int bones;
            public int materials;
            public int frames;
            public int framesPerSecond = 15;
            public int width = 640;
            public int height = 640;
            public ClipFact[] clips;
            public string[] missingCanonicalActions;
            public bool productionReady;
            public bool gameplayEnabled;
        }

        public static void Run()
        {
            if (Application.unityVersion != "6000.3.14f1") throw new InvalidOperationException("Pinned Editor required");
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null) throw new InvalidOperationException("Real GPU rendering required");
            string output = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_RENDER_OUTPUT");
            if (string.IsNullOrWhiteSpace(output) || !Path.IsPathRooted(output) || Directory.Exists(output))
                throw new InvalidOperationException("New absolute output directory required");
            Directory.CreateDirectory(output);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var importer = AssetImporter.GetAtPath(Model) as ModelImporter;
            if (importer == null) throw new InvalidOperationException("Missing pilot FBX");
            importer.animationType = ModelImporterAnimationType.Generic;
            importer.importAnimation = true;
            importer.optimizeGameObjects = false;
            importer.isReadable = true;
            importer.importCameras = importer.importLights = false;
            importer.SaveAndReimport();
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null || !shader.isSupported) throw new InvalidOperationException("URP Lit unavailable");
            var albedo = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/character-base-color.png");
            var bowAlbedo = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/bow-base-color.png");
            if (albedo == null || bowAlbedo == null) throw new InvalidOperationException("Required albedo missing");
            foreach (var source in AssetDatabase.LoadAllAssetsAtPath(Model).OfType<Material>())
            {
                var id = new AssetImporter.SourceAssetIdentifier(source);
                var material = new Material(shader) { name = id.name };
                if (id.name.Contains("CelestialGold"))
                {
                    material.SetColor("_BaseColor", new Color(.96f, .55f, .12f));
                    material.SetFloat("_Metallic", .8f);
                }
                else if (id.name.Contains("SolarLight"))
                {
                    material.SetColor("_BaseColor", new Color(1, .65f, .2f));
                    material.SetColor("_EmissionColor", new Color(1, .35f, .05f));
                    material.EnableKeyword("_EMISSION");
                }
                else
                {
                    // The appended bow receives the duplicate imported GLTF material.
                    material.SetTexture("_BaseMap", id.name.EndsWith(".001", StringComparison.Ordinal) ? bowAlbedo : albedo);
                    material.SetColor("_BaseColor", Color.white);
                }
                material.SetFloat("_Smoothness", .25f);
                material.SetFloat("_Cull", 0);
                string path = Root + "/" + id.name.Replace('/', '_') + ".mat";
                if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) AssetDatabase.DeleteAsset(path);
                AssetDatabase.CreateAsset(material, path);
                importer.AddRemap(id, material);
            }
            importer.SaveAndReimport();
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
            if (pipeline == null) throw new InvalidOperationException("Existing URP pipeline missing");
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            var instance = UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Model));
            instance.name = "IcarusV3_DRAFT_ONLY";
            var skins = instance.GetComponentsInChildren<SkinnedMeshRenderer>();
            if (skins.Length != 1) throw new InvalidOperationException("Expected one deforming body mesh");
            var skin = skins[0];
            if (skin.bones.Length != 44) throw new InvalidOperationException("Draft rig mismatch");
            skin.updateWhenOffscreen = true;
            var clips = AssetDatabase.LoadAllAssetsAtPath(Model).OfType<AnimationClip>()
                .Where(c => !c.name.StartsWith("__preview__", StringComparison.Ordinal)).ToArray();
            AnimationClip Find(string name) => clips.Single(c => c.name == name || c.name.EndsWith("|" + name, StringComparison.Ordinal));
            var idle = Find("idle");
            if (AssetDatabase.LoadAssetAtPath<AnimatorController>(Root + "/IcarusPilot.controller") != null)
                AssetDatabase.DeleteAsset(Root + "/IcarusPilot.controller");
            var controller = AnimatorController.CreateAnimatorControllerAtPath(Root + "/IcarusPilot.controller");
            foreach (string name in new[] {"idle", "wing_fold_test", "bow_draw_test"})
                controller.AddMotion(Find(name));
            var animator = instance.GetComponent<Animator>();
            if (animator == null) animator = instance.AddComponent<Animator>();
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            PrefabUtility.SaveAsPrefabAsset(instance, Root + "/IcarusPilot.prefab");
            AssetDatabase.SaveAssets();
            var facts = new List<ClipFact>();
            var probe = new Mesh();
            foreach (string name in new[] {"idle", "wing_fold_test", "bow_draw_test"})
            {
                var clip = Find(name);
                clip.SampleAnimation(instance, 0);
                skin.BakeMesh(probe);
                var before = probe.vertices;
                float delta = 0;
                for (int sample = 1; sample <= 4; sample++)
                {
                    clip.SampleAnimation(instance, clip.length * sample / 5);
                    skin.BakeMesh(probe);
                    var after = probe.vertices;
                    for (int i = 0; i < before.Length; i++) delta = Mathf.Max(delta, Vector3.Distance(before[i], after[i]));
                }
                if (delta < .0001f) throw new InvalidOperationException("No body deformation: " + clip.name);
                facts.Add(new ClipFact { name = name, seconds = clip.length, maximumVertexDisplacementMeters = delta });
            }
            idle.SampleAnimation(instance, 0);
            var focus = new Vector3(0, .94f, 0);
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(.55f, .55f, .55f);
            var probeLight = new SphericalHarmonicsL2();
            probeLight.AddAmbientLight(new Color(.45f, .45f, .45f));
            RenderSettings.ambientProbe = probeLight;
            var light = new GameObject("ReviewKey").AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.3f;
            light.transform.rotation = Quaternion.Euler(35, -30, 0);
            var fill = new GameObject("ReviewFill").AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.intensity = .65f;
            fill.transform.rotation = Quaternion.Euler(15, 135, 0);
            var camera = new GameObject("ReviewCamera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.23f, .23f, .23f);
            camera.orthographic = true;
            camera.orthographicSize = 1.14f;
            camera.nearClipPlane = .01f;
            camera.farClipPlane = 30;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            var target = new RenderTexture(640, 640, 24, RenderTextureFormat.ARGB32);
            target.Create();
            var texture = new Texture2D(640, 640, TextureFormat.RGB24, false);
            var sampled = new Mesh();
            var sampledObject = new GameObject("BakedReviewBody");
            sampledObject.transform.SetParent(skin.transform, false);
            var scale = skin.transform.lossyScale;
            sampledObject.transform.localScale = new Vector3(1/scale.x, 1/scale.y, 1/scale.z);
            var filter = sampledObject.AddComponent<MeshFilter>();
            var renderer = sampledObject.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = skin.sharedMaterials;
            skin.enabled = false;
            void Render(string file, AnimationClip clip, float time, float angle)
            {
                clip.SampleAnimation(instance, time);
                skin.BakeMesh(sampled);
                sampled.RecalculateBounds();
                sampled.UploadMeshData(false);
                filter.sharedMesh = null;
                filter.sharedMesh = sampled;
                renderer.localBounds = sampled.bounds;
                var dimensions = renderer.bounds.size;
                if (Mathf.Max(dimensions.x, dimensions.y, dimensions.z) > 3 || dimensions.y < .5f)
                    throw new InvalidOperationException("Invalid meter-scale deformed bounds");
                camera.transform.position = focus + Quaternion.Euler(0, angle, 0) * new Vector3(0, 0, 5);
                camera.transform.LookAt(focus);
                RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                var previous = RenderTexture.active;
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0,0,640,640), 0, 0);
                texture.Apply();
                RenderTexture.active = previous;
                File.WriteAllBytes(Path.Combine(output, file), texture.EncodeToPNG());
            }
            Render("front.png", idle, 0, 0);
            Render("side.png", idle, 0, 90);
            Render("back.png", idle, 0, 180);
            int frame = 0;
            for (int i = 0; i < 60; i++) Render($"turntable-{i:D4}.png", idle, 0, i*6);
            foreach (string name in new[] {"idle", "wing_fold_test", "bow_draw_test"})
            {
                var clip = Find(name);
                int count = Mathf.CeilToInt(clip.length*15);
                for (int i = 0; i < count; i++) Render($"{name}-{i:D4}.png", clip, i/15f, -15);
                frame += count;
            }
            var canonical = new[] {"idle","world_walk_or_hover","world_follow","emote","summon","normal_sword_hit","rage_sword_100","signature_skill_windup","signature_skill_cast","ultimate_cut_in","ultimate_impact","damage_reaction","defend","status_affected","victory","defeat"};
            File.WriteAllText(Path.Combine(output, "inspection.json"), JsonUtility.ToJson(new Facts {
                editor = Application.unityVersion, graphicsDevice = SystemInfo.graphicsDeviceName,
                graphicsApi = SystemInfo.graphicsDeviceType.ToString(), triangles = skin.sharedMesh.triangles.Length/3,
                bones = skin.bones.Length, materials = instance.GetComponentsInChildren<Renderer>().SelectMany(r => r.sharedMaterials).Distinct().Count(),
                clips = facts.ToArray(), frames = frame + 60, missingCanonicalActions = canonical
            }, true));
            AssetDatabase.ExportPackage(Root, Path.Combine(output, "IcarusV3Pilot.unitypackage"), ExportPackageOptions.Recurse | ExportPackageOptions.IncludeDependencies);
            target.Release();
            Debug.Log("ICARUS_V3_PILOT_IMPORT_RENDER_PASS");
        }
    }
}
