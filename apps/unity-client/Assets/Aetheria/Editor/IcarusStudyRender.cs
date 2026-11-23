using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Aetheria.Editor
{
    // Explicit offline authoring command. Nothing is added to player scenes.
    public static class IcarusStudyRender
    {
        [Serializable] private sealed class ClipFact { public string name; public float seconds; public float deformation; }
        [Serializable] private sealed class SegmentFact { public string name; public int startFrame; public int frames; public bool cameraMoves; }
        [Serializable] private sealed class Facts
        {
            public string state = "DRAFT_STUDY";
            public string editor;
            public string graphicsDevice;
            public int triangles;
            public int bones;
            public int materials;
            public ClipFact[] clips;
            public SegmentFact[] segments;
            public int frames;
            public int framesPerSecond = 20;
            public string renderMethod = "SampleAnimation + BakeMesh + URP GPU render";
            public bool productionReady;
        }

        public static void Render()
        {
            const string modelPath = "Assets/Aetheria/ArtStudies/Icarus/icarus-study.fbx";
            if (Application.unityVersion != "6000.3.14f1") throw new InvalidOperationException("Pinned Editor required");
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null) throw new InvalidOperationException("Actual graphics device required");
            var output = Environment.GetEnvironmentVariable("AETHERIA_ICARUS_RENDER_OUTPUT");
            if (string.IsNullOrWhiteSpace(output) || !Path.IsPathRooted(output) || Directory.Exists(output))
                throw new InvalidOperationException("New absolute inspection output directory required");
            Directory.CreateDirectory(output);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var importer = AssetImporter.GetAtPath(modelPath) as ModelImporter;
            if (importer == null) throw new InvalidOperationException("Missing authored FBX");
            importer.animationType = ModelImporterAnimationType.Generic;
            importer.importAnimation = true;
            importer.importCameras = false;
            importer.importLights = false;
            importer.optimizeGameObjects = false;
            importer.isReadable = true;
            importer.SaveAndReimport();
            IcarusStudyPackage.Prepare();
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            var instance = UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(IcarusStudyPackage.PrefabPath));
            var skin = instance.GetComponentsInChildren<SkinnedMeshRenderer>().Single();
            var mesh = skin.sharedMesh;
            int triangles = mesh.triangles.Length / 3;
            if (triangles < 26000 || triangles > 29500 || skin.bones.Length != 74 || mesh.subMeshCount != 3)
                throw new InvalidOperationException($"Imported budget mismatch: {triangles} triangles, {skin.bones.Length} bones, {mesh.subMeshCount} materials");
            if (mesh.colors.Length != mesh.vertexCount) throw new InvalidOperationException("Vertex colors missing from FBX");
            var shader = Shader.Find("Aetheria/StudyVertexColor");
            if (shader == null || !shader.isSupported) throw new InvalidOperationException("Study shader unavailable");
            if (skin.sharedMaterials.Any(material => material == null || material.shader != shader))
                throw new InvalidOperationException("Delivered study materials missing");
            skin.updateWhenOffscreen = true;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.52f, 0.54f, 0.59f);
            var light = new GameObject("StudyKey").AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.4f;
            light.transform.rotation = Quaternion.Euler(35, 145, 0);
            var camera = new GameObject("StudyCamera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.14f, 0.16f, 0.20f);
            camera.orthographic = true;
            camera.orthographicSize = 1.28f;
            camera.nearClipPlane = 0.01f;
            camera.farClipPlane = 30;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            var target = new RenderTexture(960, 960, 24, RenderTextureFormat.ARGB32);
            target.Create();
            var texture = new Texture2D(960, 960, TextureFormat.RGB24, false);
            var clips = AssetDatabase.LoadAllAssetsAtPath(modelPath).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__", StringComparison.Ordinal)).ToArray();
            var required = new Dictionary<string, float> { {"idle", 8}, {"intro", 15}, {"normal", 4}, {"rage", 6}, {"signature", 10} };
            var selected = required.Keys.ToDictionary(name => name, name => clips.Single(c => c.name == name || c.name.EndsWith("|" + name, StringComparison.Ordinal)));
            var facts = new List<ClipFact>();
            var baked = new Mesh();
            foreach (var pair in required)
            {
                var clip = selected[pair.Key];
                if (Mathf.Abs(clip.length - pair.Value) > 0.05f) throw new InvalidOperationException("Unexpected clip duration: " + clip.name);
                clip.SampleAnimation(instance, 0);
                skin.BakeMesh(baked);
                var before = baked.vertices;
                clip.SampleAnimation(instance, clip.length * 0.25f);
                skin.BakeMesh(baked);
                var after = baked.vertices;
                float delta = 0;
                for (int i = 0; i < before.Length; i++) delta = Mathf.Max(delta, Vector3.Distance(before[i], after[i]));
                if (delta < 0.0001f) throw new InvalidOperationException("Clip has no deformed geometry: " + clip.name);
                facts.Add(new ClipFact { name = pair.Key, seconds = clip.length, deformation = delta });
            }
            var focus = skin.bounds.center;
            // Synchronous Editor renders do not advance the player skinning loop.
            // Bake each sampled pose explicitly so the GPU sees that frame's mesh.
            var sampledMesh = new Mesh();
            var sampledObject = new GameObject("SampledStudyMesh");
            sampledObject.transform.SetParent(skin.transform, false);
            // BakeMesh already incorporates the FBX import scale in its vertices.
            var importScale = skin.transform.lossyScale;
            sampledObject.transform.localScale = new Vector3(1 / importScale.x, 1 / importScale.y, 1 / importScale.z);
            var sampledFilter = sampledObject.AddComponent<MeshFilter>();
            var sampledRenderer = sampledObject.AddComponent<MeshRenderer>();
            sampledRenderer.sharedMaterials = skin.sharedMaterials;
            skin.enabled = false;
            Action<string, AnimationClip, float, float> render = (filename, clip, time, angle) =>
            {
                clip.SampleAnimation(instance, time);
                skin.BakeMesh(sampledMesh);
                if (sampledMesh.vertexCount != mesh.vertexCount) throw new InvalidOperationException("Sampled render mesh missing vertices");
                sampledMesh.RecalculateBounds();
                sampledMesh.UploadMeshData(false);
                sampledFilter.sharedMesh = null;
                sampledFilter.sharedMesh = sampledMesh;
                sampledRenderer.localBounds = sampledMesh.bounds;
                var dimensions = sampledRenderer.bounds.size;
                float largest = Mathf.Max(dimensions.x, dimensions.y, dimensions.z);
                if (largest < 0.5f || largest > 3)
                    throw new InvalidOperationException("Baked pose outside meter-scale character bounds");
                var offset = Quaternion.Euler(0, angle, 0) * new Vector3(0, 0.10f, -5);
                camera.transform.position = focus + offset;
                camera.transform.LookAt(focus);
                RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                var previous = RenderTexture.active;
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0, 0, 960, 960), 0, 0);
                texture.Apply();
                RenderTexture.active = previous;
                File.WriteAllBytes(Path.Combine(output, filename), texture.EncodeToPNG());
            };
            render("front.png", selected["idle"], 0, 180);
            render("side.png", selected["idle"], 0, 270);
            render("back.png", selected["idle"], 0, 0);
            render("signature.png", selected["signature"], 5, 160);
            var fullFocus = focus;
            camera.orthographicSize = 0.24f;
            selected["idle"].SampleAnimation(instance, 0);
            focus = instance.GetComponentsInChildren<Transform>().Single(t => t.name == "head").position + Vector3.up * 0.10f;
            render("portrait-detail.png", selected["idle"], 0, 180);
            focus = fullFocus;
            camera.orthographicSize = 1.28f;
            int frame = 0;
            var segments = new List<SegmentFact>();
            foreach (var name in new[] {"idle", "intro", "normal", "rage", "signature"})
            {
                int start = frame;
                for (int i = 0; i < Mathf.RoundToInt(selected[name].length * 20); i++)
                {
                    var clip = selected[name];
                    render($"frame-{frame++:D4}.png", clip, i / 20f, 160);
                }
                segments.Add(new SegmentFact { name = name, startFrame = start, frames = frame - start, cameraMoves = false });
            }
            int turntableStart = frame;
            for (int i = 0; i < 120; i++)
                render($"frame-{frame++:D4}.png", selected["idle"], 0, 180 + i * 3);
            segments.Add(new SegmentFact { name = "turntable", startFrame = turntableStart, frames = 120, cameraMoves = true });
            File.WriteAllText(Path.Combine(output, "inspection.json"), JsonUtility.ToJson(new Facts {
                editor = Application.unityVersion, graphicsDevice = SystemInfo.graphicsDeviceName,
                triangles = triangles, bones = skin.bones.Length, materials = mesh.subMeshCount,
                clips = facts.ToArray(), segments = segments.ToArray(), frames = frame, productionReady = false
            }, true));
            target.Release();
            Debug.Log("ICARUS_STUDY_RENDER_PASS");
        }
    }
}
