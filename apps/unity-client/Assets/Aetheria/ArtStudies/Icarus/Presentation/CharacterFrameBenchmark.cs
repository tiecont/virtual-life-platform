#if DEVELOPMENT_BUILD || UNITY_EDITOR
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Profiling;
using UnityEngine.SceneManagement;

namespace Aetheria.Icarus
{
    // This sampler is opt-in and only compiled into development players.
    internal sealed class CharacterFrameBenchmark : MonoBehaviour
    {
        const int Warmup = 60, SampleCount = 240;
        [Serializable] sealed class Sample
        {
            public double frameIntervalMs, cpuFrameMs, gpuFrameMs;
            public long drawCalls, allocatedBytes, graphicsBytes;
        }
        [Serializable] sealed class Report
        {
            public string scene, unity, cpu, gpu, api, os, assetRevision;
            public int width, height, processors, systemMemoryMB, graphicsMemoryMB, warmupFrames = Warmup;
            public double p50Ms, p95Ms, p99Ms;
            public int over60HzBudget, reportedCpuFrames, reportedGpuFrames;
            public Sample[] frames;
        }
        readonly Sample[] samples = new Sample[SampleCount];
        readonly FrameTiming[] timings = new FrameTiming[1];
        readonly Stopwatch clock = new Stopwatch();
        ProfilerRecorder draws, gfx;
        string target, revision;
        PlayableDirector director;
        int count;
        double last;
        ulong previousTiming;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            if (Application.isEditor || !Environment.GetCommandLineArgs().Contains("-aetheria-character-benchmark")) return;
            var go = new GameObject("Character frame benchmark");
            go.AddComponent<CharacterFrameBenchmark>();
        }

        void Start()
        {
            target = Environment.GetEnvironmentVariable("AETHERIA_CHARACTER_BENCHMARK_OUTPUT");
            revision = Environment.GetEnvironmentVariable("AETHERIA_CHARACTER_BENCHMARK_REVISION");
            director = FindObjectsByType<PlayableDirector>(FindObjectsSortMode.None).SingleOrDefault();
            if (string.IsNullOrEmpty(target) || !Path.IsPathRooted(target) || File.Exists(target) ||
                director == null || !director.playableAsset || director.duration <= 0 || !Camera.main ||
                !FindObjectsByType<SkinnedMeshRenderer>(FindObjectsSortMode.None).Any())
            {
                UnityEngine.Debug.LogError("Benchmark requires a fresh output file and a rendered character Timeline scene.");
                enabled = false;
                Application.Quit(2);
                return;
            }
            director.extrapolationMode = DirectorWrapMode.Loop;
            director.Play();
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = -1;
            draws = ProfilerRecorder.StartNew(ProfilerCategory.Render,"Draw Calls Count",1);
            gfx = ProfilerRecorder.StartNew(ProfilerCategory.Memory,"Gfx Used Memory",1);
            clock.Start();
        }

        void LateUpdate()
        {
            double now = clock.Elapsed.TotalMilliseconds;
            double interval = now - last;
            last = now;
            FrameTimingManager.CaptureFrameTimings();
            if (count++ < Warmup) return;
            var row = new Sample { frameIntervalMs = interval,
                allocatedBytes = Profiler.GetTotalAllocatedMemoryLong(),
                drawCalls = draws.Valid && draws.Count > 0 ? draws.LastValue : -1,
                graphicsBytes = gfx.Valid && gfx.Count > 0 ? gfx.LastValue : -1 };
            if (FrameTimingManager.GetLatestTimings(1,timings) == 1 && timings[0].frameStartTimestamp != previousTiming)
            {
                previousTiming = timings[0].frameStartTimestamp;
                row.cpuFrameMs = timings[0].cpuFrameTime;
                row.gpuFrameMs = timings[0].gpuFrameTime;
            }
            int index = count - Warmup - 1;
            samples[index] = row;
            if (index + 1 != SampleCount) return;
            double[] sorted = samples.Select(s => s.frameIntervalMs).OrderBy(value => value).ToArray();
            double Percentile(double fraction) => sorted[(int)Math.Ceiling(sorted.Length * fraction)-1];
            var result = new Report { scene = SceneManager.GetActiveScene().name, unity = Application.unityVersion,
                cpu = SystemInfo.processorType, gpu = SystemInfo.graphicsDeviceName, api = SystemInfo.graphicsDeviceType.ToString(),
                os = SystemInfo.operatingSystem, processors = SystemInfo.processorCount, systemMemoryMB = SystemInfo.systemMemorySize,
                graphicsMemoryMB = SystemInfo.graphicsMemorySize, width = Screen.width, height = Screen.height,
                p50Ms = Percentile(.50), p95Ms = Percentile(.95), p99Ms = Percentile(.99),
                reportedCpuFrames = samples.Count(s => s.cpuFrameMs > 0), reportedGpuFrames = samples.Count(s => s.gpuFrameMs > 0),
                over60HzBudget = sorted.Count(ms => ms > 1000.0/60), assetRevision = revision, frames = samples };
            enabled = false;
            using (var output = new StreamWriter(new FileStream(target, FileMode.CreateNew)))
                output.Write(JsonUtility.ToJson(result, true));
            Application.Quit(0);
        }

        void OnDestroy() { draws.Dispose(); gfx.Dispose(); }
    }
}
#endif
