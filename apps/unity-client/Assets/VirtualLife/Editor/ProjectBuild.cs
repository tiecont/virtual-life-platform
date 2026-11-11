using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace VirtualLife.Editor
{
    [InitializeOnLoad]
    public static class ProjectBuild
    {
        public const string Scene = "Assets/VirtualLife/Scenes/AuroraBlockout.unity";
        private const string Settings = "Assets/VirtualLife/Settings";

        static ProjectBuild()
        {
            EditorApplication.delayCall += Prepare;
        }

        [MenuItem("VirtualLife/Prepare blockout")]
        public static void Prepare()
        {
            if (Application.unityVersion != "6000.3.14f1") throw new InvalidOperationException("Pinned Editor 6000.3.14f1 required");
            if (!AssetDatabase.IsValidFolder(Settings)) AssetDatabase.CreateFolder("Assets/VirtualLife", "Settings");
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
            const string resources = "Assets/VirtualLife/Resources";
            if (!AssetDatabase.IsValidFolder(resources)) AssetDatabase.CreateFolder("Assets/VirtualLife", "Resources");
            if (AssetDatabase.LoadAssetAtPath<Material>(resources + "/BlockoutLit.mat") == null)
                AssetDatabase.CreateAsset(new Material(Shader.Find("Universal Render Pipeline/Lit")), resources + "/BlockoutLit.mat");
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            EditorBuildSettings.scenes = new[] {new EditorBuildSettingsScene(Scene, true)};
            AssetDatabase.SaveAssets();
        }

        public static void Linux()
        {
            Build(BuildTarget.StandaloneLinux64, "Builds/Linux/VirtualLife");
        }

        public static void WindowsMono()
        {
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            Build(BuildTarget.StandaloneWindows64, "Builds/Windows/VirtualLife.exe");
        }

        private static void Build(BuildTarget target, string output)
        {
            Prepare();
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, target))
                throw new InvalidOperationException("Required platform build module is unavailable");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] {Scene}, locationPathName = output, target = target,
                options = BuildOptions.Development
            });
            if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Blockout build failed");
        }
    }
}
