using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.SceneManagement;
using UnityEngine.Timeline;
using UniVRM10;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    // Optional walk-only overlay. Turning off the child track returns its preview instance
    // to the unmodified source motion. The VRM, source rig and source clip stay immutable.
    public static class IcarusLocalizedGarmentStudy
    {
        const string Source = "Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm";
        const string BodyHash = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a";
        const string BaselineHash = "fc3d6f0bd88750a0f811873234c753457609a2a318c5b07bdd3b761fe3618d70";
        const string WalkHash = "44a08db1ae92bb4093be2d8cfccded2a65b86ac42803fc5160beb1ddd607a251";
        const int SkirtVertices = 6718, BodyVertices = 23922, Frames = 32;
        [Serializable] sealed class Mask
        {
            public string sourceSha256, baselineSha256, cacheSha256;
            public int[] vertices;
        }
        [Serializable] sealed class Report
        {
            public string scene, status = "PROTOTYPE", source = BodyHash, walk = WalkHash;
            public int frames = Frames, affectedVertices;
            public float maxBaselineMismatchMeters, maxCorrectiveErrorMeters;
        }

        public static void Build() => BuildStudy(false);
        public static void BuildRendered() => BuildStudy(true);

        static void BuildStudy(bool render)
        {
            string Input(string variable)
            {
                var value = Environment.GetEnvironmentVariable(variable);
                if (!Path.IsPathRooted(value ?? "")) throw new ArgumentException("Missing absolute " + variable);
                return value;
            }
            if (render && SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Null)
                throw new InvalidOperationException("Rendering both garment layers requires a private graphics device.");
            var receipt = Input("AETHERIA_GARMENT_LOCAL");
            var output = Input("AETHERIA_GARMENT_OUTPUT");
            var baseline = Input("AETHERIA_GARMENT_BASE_POSES");
            var sourceWalk = Input("AETHERIA_GARMENT_BASE_CLIP");
            var corrected = Path.Combine(receipt, "localized-skirt.bin");
            var mask = JsonUtility.FromJson<Mask>(File.ReadAllText(Path.Combine(receipt, "localized-skirt.json")));
            if (!Application.isBatchMode || Directory.Exists(output) || File.Exists(output) || Hash(sourceWalk) != WalkHash ||
                mask.sourceSha256 != BodyHash || Hash(Path.Combine(Application.dataPath, Source.Substring(7))) != BodyHash || mask.baselineSha256 != BaselineHash || Hash(baseline) != BaselineHash ||
                Hash(corrected) != mask.cacheSha256 || mask.vertices == null || mask.vertices.Length == 0 ||
                mask.vertices.Any(i => i < 0 || i >= SkirtVertices) || mask.vertices.Distinct().Count() != mask.vertices.Length)
                throw new InvalidDataException("Invalid local garment intake, receipt, archive or output directory.");
            var scene = SceneManager.GetActiveScene();
            if (scene.isDirty || !string.IsNullOrEmpty(scene.path) || SceneManager.sceneCount != 1)
                throw new InvalidOperationException("Start from a clean private batch scene.");
            Directory.CreateDirectory(output);
            string folder = "Assets/IcarusGarmentStudy-" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(folder));
            var sampled = new Mesh();
            try
            {
                string walkPath = folder + "/OriginalWalk.anim";
                File.Copy(sourceWalk, Path.Combine(Application.dataPath, walkPath.Substring(7)));
                AssetDatabase.ImportAsset(walkPath, ImportAssetOptions.ForceSynchronousImport);
                var walk = AssetDatabase.LoadAssetAtPath<AnimationClip>(walkPath);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Source);
                if (prefab == null || walk == null) throw new InvalidDataException("Original VRM or private walk failed to import.");
                var actor = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                var animator = actor.GetComponentInChildren<Animator>();
                animator.avatar = AssetDatabase.LoadAssetAtPath<Avatar>("Assets/Aetheria/ArtStudies/Icarus/Modular/IcarusReviewAvatar.asset");
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                animator.runtimeAnimatorController = null;
                var vrm = actor.GetComponent<Vrm10Instance>();
                vrm.UpdateType = Vrm10Instance.UpdateTypes.None;
                var skins = actor.GetComponentsInChildren<SkinnedMeshRenderer>();
                var skirt = skins.Single(s => s.name == "Spring_06_skirt");
                var originalMesh = skirt.sharedMesh;
                var mesh = Object.Instantiate(originalMesh);
                mesh.name = "Original skirt with walk-only corrections";
                AssetDatabase.CreateAsset(mesh, folder + "/Garment.asset");
                var director = CinematicStudio.CreateBoundTimeline(animator, walk, CinematicStudio.Sequence.SkillShowcase, folder + "/Motion.playable");
                var timeline = (TimelineAsset)director.playableAsset;
                var motion = timeline.GetOutputTracks().OfType<AnimationTrack>().Single();
                director.RebuildGraph();
                var poses = LoadSkirt(baseline);
                var target = LoadSkirt(corrected);
                var selected = new bool[SkirtVertices];
                foreach (int index in mask.vertices) selected[index] = true;
                for (int frame = 0; frame < Frames; frame++)
                    for (int v = 0; v < SkirtVertices; v++)
                    {
                        float difference = Vector3.Distance(target[frame][v], poses[frame][v]);
                        if (!float.IsFinite(difference) || difference > (selected[v] ? .01201f : .000001f))
                            throw new InvalidDataException("The cache moved a protected vertex or exceeded the 12 mm limit.");
                    }
                var report = new Report { scene = folder + "/Garment.unity", affectedVertices = mask.vertices.Length };
                var joints = skirt.bones;
                var weights = mesh.boneWeights;
                var binds = mesh.bindposes;
                var correctiveClip = new AnimationClip { name = "Localized garment clearance", frameRate = 24 };
                float TimeAt(int frame) => Mathf.Min(walk.length - .0001f, walk.length * frame / (Frames - 1));
                for (int frame = 0; frame < Frames; frame++)
                {
                    director.time = TimeAt(frame);
                    director.Evaluate();
                    skirt.BakeMesh(sampled);
                    var world = sampled.vertices.Select(skirt.transform.TransformPoint).ToArray();
                    var transforms = joints.Select((joint, i) => joint.localToWorldMatrix * binds[i]).ToArray();
                    var deltas = new Vector3[SkirtVertices];
                    foreach (int v in mask.vertices)
                    {
                        report.maxBaselineMismatchMeters = Mathf.Max(report.maxBaselineMismatchMeters, Vector3.Distance(poses[frame][v], world[v]));
                        var w = weights[v];
                        var matrix = Matrix4x4.identity;
                        for (int row = 0; row < 3; row++)
                            for (int col = 0; col < 3; col++)
                                matrix[row,col] = transforms[w.boneIndex0][row,col] * w.weight0 + transforms[w.boneIndex1][row,col] * w.weight1 +
                                    transforms[w.boneIndex2][row,col] * w.weight2 + transforms[w.boneIndex3][row,col] * w.weight3;
                        if (Mathf.Abs(matrix.determinant) < .00001f) throw new InvalidDataException("Singular skin transform.");
                        deltas[v] = matrix.inverse.MultiplyVector(target[frame][v] - poses[frame][v]);
                    }
                    string shape = $"WalkClearance{frame:D2}";
                    mesh.AddBlendShapeFrame(shape, 100, deltas, null, null);
                    var curve = new AnimationCurve(Enumerable.Range(0, Frames)
                        .Select(i => new Keyframe(TimeAt(i), i == frame ? 100 : 0)).ToArray());
                    for (int i = 0; i < curve.length; i++)
                    {
                        AnimationUtility.SetKeyLeftTangentMode(curve, i, AnimationUtility.TangentMode.Linear);
                        AnimationUtility.SetKeyRightTangentMode(curve, i, AnimationUtility.TangentMode.Linear);
                    }
                    correctiveClip.SetCurve(AnimationUtility.CalculateTransformPath(skirt.transform, animator.transform),
                        typeof(SkinnedMeshRenderer), "blendShape." + shape, curve);
                }
                if (report.maxBaselineMismatchMeters > .001f)
                    throw new InvalidDataException($"Original walk does not match the supplied captures ({report.maxBaselineMismatchMeters} m).");
                AssetDatabase.CreateAsset(correctiveClip, folder + "/Clearance.anim");
                EditorUtility.SetDirty(mesh);
                AssetDatabase.SaveAssetIfDirty(mesh);
                skirt.sharedMesh = mesh;
                PrefabUtility.RecordPrefabInstancePropertyModifications(skirt);
                PrefabUtility.RecordPrefabInstancePropertyModifications(animator);
                PrefabUtility.RecordPrefabInstancePropertyModifications(vrm);
                var layer = timeline.CreateTrack<AnimationTrack>(motion, "Private clearance overlay");
                var take = layer.CreateClip(correctiveClip);
                take.duration = walk.length;
                EditorUtility.SetDirty(layer);
                EditorUtility.SetDirty(take.asset);
                EditorUtility.SetDirty(motion);
                EditorUtility.SetDirty(timeline);
                AssetDatabase.SaveAssetIfDirty(timeline);
                director.RebuildGraph();
                string reimport = Path.Combine(output, "unity-corrected.bin");
                IcarusLayerSurfaceExport.Write(reimport, skins, director, 0, walk.length);
                var actual = LoadSkirt(reimport);
                for (int frame = 0; frame < Frames; frame++)
                    for (int i = 0; i < SkirtVertices; i++)
                        report.maxCorrectiveErrorMeters = Mathf.Max(report.maxCorrectiveErrorMeters,
                            Vector3.Distance(target[frame][i], actual[frame][i]));
                if (report.maxCorrectiveErrorMeters > .001f)
                    throw new InvalidDataException($"Native Timeline overlay differs from target ({report.maxCorrectiveErrorMeters} m).");
                if (render)
                {
                    void CaptureWalk(string name)
                    {
                        string path = Path.Combine(output, name);
                        Directory.CreateDirectory(path);
                        var captureRoot = new GameObject("Private garment comparison");
                        try
                        {
                            director.time = 0;
                            director.Evaluate();
                            IcarusCharakuruMotionReview.Capture(director, 0, walk.length, skins, captureRoot.transform,
                                vrm, path, out _, captureMovingPelvis: true);
                        }
                        finally { Object.DestroyImmediate(captureRoot); }
                    }
                    layer.muted = true;
                    skirt.sharedMesh = originalMesh;
                    director.RebuildGraph();
                    CaptureWalk("original");
                    skirt.sharedMesh = mesh;
                    layer.muted = false;
                    director.RebuildGraph();
                    CaptureWalk("corrected");
                }
                director.Stop();
                director.playOnAwake = true;
                if (!EditorSceneManager.SaveScene(scene, report.scene)) throw new IOException("Private garment study could not be saved.");
                File.WriteAllText(Path.Combine(output, "garment-study.json"), JsonUtility.ToJson(report, true));
            }
            catch { AssetDatabase.DeleteAsset(folder); throw; }
            finally { Object.DestroyImmediate(sampled); }
        }

        static Vector3[][] LoadSkirt(string path)
        {
            using var file = new BinaryReader(File.OpenRead(path));
            if (file.ReadInt32() != 0x314C4349) throw new InvalidDataException("Expected ICL1.");
            foreach (int expected in new[] { BodyVertices, BodyVertices, SkirtVertices })
            {
                if (file.ReadInt32() != expected) throw new InvalidDataException("Unexpected skin vertex count.");
                int indices = file.ReadInt32();
                if (indices <= 0 || indices >= 1000000 || indices % 3 != 0) throw new InvalidDataException("Unexpected indices.");
                file.BaseStream.Seek(indices * 4L, SeekOrigin.Current);
            }
            if (file.ReadInt32() != Frames) throw new InvalidDataException("Unexpected walk sampling.");
            var output = new Vector3[Frames][];
            for (int frame = 0; frame < Frames; frame++)
            {
                file.BaseStream.Seek(2L * BodyVertices * 12, SeekOrigin.Current);
                output[frame] = Enumerable.Range(0, SkirtVertices)
                    .Select(_ => new Vector3(file.ReadSingle(), file.ReadSingle(), file.ReadSingle())).ToArray();
            }
            if (file.BaseStream.Position != file.BaseStream.Length) throw new InvalidDataException("Trailing pose data.");
            return output;
        }

        static string Hash(string path)
        {
            using var sha = SHA256.Create();
            using var file = File.OpenRead(path);
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
        }
    }
}
