using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Aetheria.Editor
{
    [InitializeOnLoad]
    public static class ProjectBuild
    {
        public const string Scene = "Assets/Aetheria/Scenes/AuroraBlockout.unity";
        public const string PetArenaScene = PetArenaMvpSceneBuilder.ScenePath;
        private const string Settings = "Assets/Aetheria/Settings";

        static ProjectBuild()
        {
            EditorApplication.delayCall += Prepare;
        }

        [MenuItem("Aetheria/Prepare blockout")]
        public static void Prepare()
        {
            if (Application.unityVersion != "6000.3.14f1") throw new InvalidOperationException("Pinned Editor 6000.3.14f1 required");
            PlayerSettings.companyName = "Aetheria";
            PlayerSettings.productName = "Aetheria";
            PlayerSettings.defaultScreenWidth = 1024;
            PlayerSettings.defaultScreenHeight = 768;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = true;
            if (!AssetDatabase.IsValidFolder(Settings)) AssetDatabase.CreateFolder("Assets/Aetheria", "Settings");
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(Settings + "/BlockoutURP.asset");
            if (pipeline == null)
            {
                var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, Settings + "/BlockoutRenderer.asset");
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                pipeline.msaaSampleCount = 1;
                pipeline.renderScale = 1f;
                pipeline.shadowDistance = 30f;
                AssetDatabase.CreateAsset(pipeline, Settings + "/BlockoutURP.asset");
            }
            const string resources = "Assets/Aetheria/Resources";
            if (!AssetDatabase.IsValidFolder(resources)) AssetDatabase.CreateFolder("Assets/Aetheria", "Resources");
            if (AssetDatabase.LoadAssetAtPath<Material>(resources + "/BlockoutLit.mat") == null)
                AssetDatabase.CreateAsset(new Material(Shader.Find("Universal Render Pipeline/Lit")), resources + "/BlockoutLit.mat");
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            // One canonical registry feeds both the Editor build list and the
            // player build below; never keep two scene lists in sync by hand.
            ProjectScenes.ApplyEditorBuildSettings();
            AssetDatabase.SaveAssets();
            BlockoutCollisionExport.Write();
        }

        public static void Linux()
        {
            Build(BuildTarget.StandaloneLinux64, "Builds/Linux/Aetheria");
        }

        public static void WindowsMono()
        {
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            Build(BuildTarget.StandaloneWindows64, "Builds/Windows/Aetheria.exe");
        }

        private static void Build(BuildTarget target, string output)
        {
            Prepare();
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, target))
                throw new InvalidOperationException("Required platform build module is unavailable");
            var scenes = ProjectScenes.PlayerScenes;
            // The shader build pass reopens the previous scene after scanning
            // the registry. A fresh batch editor may have only an untitled scene.
            if (Application.isBatchMode && string.IsNullOrEmpty(SceneManager.GetActiveScene().path))
                EditorSceneManager.OpenScene(scenes[0]);
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = scenes, locationPathName = output, target = target,
                options = BuildOptions.Development
            });
            if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Blockout build failed");
        }
    }
}
