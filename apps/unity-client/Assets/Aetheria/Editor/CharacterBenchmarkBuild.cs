using System;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Aetheria.Editor
{
    public static class CharacterBenchmarkBuild
    {
        public static void Build()
        {
            var scene = Environment.GetEnvironmentVariable("AETHERIA_CHARACTER_BENCHMARK_SCENE");
            var path = Environment.GetEnvironmentVariable("AETHERIA_CHARACTER_BENCHMARK_PLAYER");
            if (!Application.isBatchMode || !Regex.IsMatch(scene ?? "", @"^Assets/IcarusMotionReview-[0-9a-f]{32}/IcarusRecorder\.unity$") ||
                !AssetDatabase.LoadAssetAtPath<SceneAsset>(scene) || string.IsNullOrEmpty(path) ||
                !Path.IsPathRooted(path) || File.Exists(path) || Directory.Exists(path))
                throw new InvalidOperationException("Supply the staged Icarus Recorder scene and a new absolute player path.");
            bool original = PlayerSettings.enableFrameTimingStats;
            try
            {
                PlayerSettings.enableFrameTimingStats = true;
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] {scene},
                    target = BuildTarget.StandaloneLinux64, locationPathName = path, options = BuildOptions.Development });
                if (report.summary.result != BuildResult.Succeeded)
                    throw new InvalidOperationException("Character benchmark Linux build failed: " + report.summary.result);
            }
            finally { PlayerSettings.enableFrameTimingStats = original; }
        }
    }
}
