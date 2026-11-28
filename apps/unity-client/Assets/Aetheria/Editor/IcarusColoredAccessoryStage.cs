using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UniVRM10;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    // Private fitting scene using the original VRM and the color-approved GLB derivatives.
    public static class IcarusColoredAccessoryStage
    {
        const string Body = "Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm";
        const string BodySha = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a";
        const string WalkSha = "50b27c7363ff844ccb0b71373794326583a601128e90f14de0c3df7bfefe9161";

        [Serializable] sealed class Report
        {
            public string scene, bodySha256 = BodySha, wingSha256, bowSha256, unity = Application.unityVersion;
            public string wingMount, bowGrip;
            public string[] wingImportedMaps, bowImportedMaps;
            public int wingTriangles, bowTriangles;
            public float wingSpanMeters, bowHeightMeters, wingAnchorErrorMeters, bowAnchorErrorMeters;
            public IcarusBowGripFit.Evidence bowContact, bowWalkContact;
            public Vector3 handFrontCameraDirection, handRearCameraDirection;
        }

        static string Hash(string path)
        {
            using var sha = SHA256.Create();
            using var file = File.OpenRead(path);
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
        }

        static string StageFile(string folder, string variable, string filename, string expected)
        {
            var source = Environment.GetEnvironmentVariable(variable);
            if (string.IsNullOrEmpty(source) || !Path.IsPathRooted(source) || string.IsNullOrEmpty(expected) || Hash(source) != expected)
                throw new InvalidDataException("Missing or mismatched intake for " + variable);
            var path = folder + "/" + filename;
            File.Copy(source, Path.Combine(Application.dataPath, path.Substring(7)));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            return path;
        }

        static Bounds VisibleBounds(GameObject o)
        {
            var surfaces = o.GetComponentsInChildren<Renderer>().Where(r => r.enabled && r is MeshRenderer or SkinnedMeshRenderer).ToArray();
            if (surfaces.Length == 0) throw new InvalidDataException("Missing visible geometry on " + o.name);
            var bounds = surfaces[0].bounds;
            foreach (var r in surfaces.Skip(1)) bounds.Encapsulate(r.bounds);
            return bounds;
        }

        static GameObject Fit(GameObject actor, string socketName, string path, string anchorName, bool wing, Report report)
        {
            var socket = actor.GetComponentsInChildren<Transform>(true).Single(t => t.name == socketName);
            var vrm = actor.GetComponentInChildren<Vrm10Instance>();
            var parent = wing ? HumanBodyBones.UpperChest : HumanBodyBones.RightHand;
            if (!vrm.TryGetBoneTransform(parent, out var joint) || socket.parent != joint)
                throw new InvalidDataException("Unexpected attachment parent for " + socketName);
            socket.gameObject.SetActive(true);
            var imported = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!imported) throw new InvalidDataException("Could not import " + path);
            var model = Object.Instantiate(imported, socket);
            model.name = wing ? "Color-reviewed wings" : "Color-reviewed bow";
            model.transform.rotation = actor.transform.rotation * Quaternion.Euler(0, wing ? 180 : 65, 0);
            var original = VisibleBounds(model);
            if (!vrm.TryGetBoneTransform(HumanBodyBones.Head, out var head) ||
                !vrm.TryGetBoneTransform(HumanBodyBones.LeftFoot, out var foot))
                throw new InvalidDataException("Missing height reference joints.");
            float height = Mathf.Abs(head.position.y - foot.position.y);
            float extent = wing ? original.size.x : original.size.y;
            if (extent < .0001f) throw new InvalidDataException("Degenerate attachment extent.");
            model.transform.localScale *= height * (wing ? 1.20f : .78f) / extent;
            var anchor = model.GetComponentsInChildren<Transform>().Single(t => t.name == anchorName);
            Vector3 Anchor() => wing && anchor.GetComponent<Renderer>() != null ? VisibleBounds(anchor.gameObject).center : anchor.position;
            Vector3 target = socket.position;
            if (!wing && vrm.TryGetBoneTransform(HumanBodyBones.RightMiddleProximal, out var fingers))
                target = Vector3.Lerp(joint.position, fingers.position, .67f);
            model.transform.position += target - Anchor();
            var meshes = model.GetComponentsInChildren<MeshFilter>().Select(r => r.sharedMesh)
                .Concat(model.GetComponentsInChildren<SkinnedMeshRenderer>().Select(r => r.sharedMesh)).ToArray();
            int triangles = meshes.Sum(mesh => mesh.triangles.Length / 3);
            var materials = model.GetComponentsInChildren<Renderer>().SelectMany(r => r.sharedMaterials).Distinct().ToArray();
            var importedMaps = materials.Select(m => m && m.mainTexture
                ? $"{m.name} {m.mainTexture.width}x{m.mainTexture.height}" : "Missing base color").ToArray();
            if (wing) report.wingImportedMaps = importedMaps;
            else report.bowImportedMaps = importedMaps;
            // Unity may limit the in-memory size. Offline intake verifies the exact source image hashes.
            if (materials.Length == 0 || !materials.Any(m => m && m.mainTexture && m.mainTexture.width >= 1024) || materials.Any(m => !m || !m.mainTexture || m.mainTexture.width < (wing ? 1024 : 512)))
                throw new InvalidDataException(model.name + " failed the imported color check: " + string.Join(", ", importedMaps));
            var size = VisibleBounds(model).size;
            if (wing)
            {
                report.wingTriangles = triangles;
                report.wingSpanMeters = size.x;
                report.wingAnchorErrorMeters = Vector3.Distance(Anchor(), target);
                report.wingMount = anchorName;
            }
            else
            {
                report.bowContact = IcarusBowGripFit.Fit(model, anchor, vrm, true);
                report.bowTriangles = triangles;
                report.bowHeightMeters = report.bowContact.bowLengthMeters;
                report.bowAnchorErrorMeters = report.bowContact.riserPlacementErrorMeters;
                report.bowGrip = anchorName;
            }
            return model;
        }

        static void CaptureGrip(GameObject actor, GameObject bow, Vrm10Instance vrm, Camera camera,
            RenderTexture target, Texture2D pixels, string output, Report report)
        {
            var fit = report.bowContact;
            var outside = Vector3.ProjectOnPlane(fit.wrist - actor.transform.position, Vector3.up).normalized;
            report.handFrontCameraDirection = (outside + actor.transform.forward * .70f - Vector3.up * .12f).normalized;
            report.handRearCameraDirection = (outside - actor.transform.forward * .85f - Vector3.up * .42f).normalized;
            var contact = new Bounds(Vector3.Lerp(fit.riserCenter, fit.knuckleCenter, .4f), Vector3.one * .13f);
            void View(string name, Bounds frame, Vector3 direction) =>
                IcarusH2AccessoryMotionPreview.Capture(camera, target, pixels, frame, direction, Path.Combine(output, name + ".png"));

            View("hand-grip-assembled", contact, report.handFrontCameraDirection);
            View("hand-grip-assembled-opposite", contact, report.handRearCameraDirection);
            var hidden = actor.GetComponentsInChildren<Renderer>()
                .Where(r => r.enabled && !r.transform.IsChildOf(bow.transform)).ToArray();
            var (hand, mesh, handTriangles) = IcarusBowGripFit.Isolate(vrm);
            fit.isolatedHandTriangles = handTriangles;
            try
            {
                foreach (var renderer in hidden) renderer.enabled = false;
                View("hand-grip", contact, report.handFrontCameraDirection);
                View("hand-grip-opposite", contact, report.handRearCameraDirection);
                View("bow-side", VisibleBounds(bow), outside);
            }
            finally
            {
                foreach (var renderer in hidden) renderer.enabled = true;
                Object.DestroyImmediate(hand);
                Object.DestroyImmediate(mesh);
            }
        }

        public static void Capture()
        {
            var output = Environment.GetEnvironmentVariable("AETHERIA_COLORED_OUTPUT");
            var scene = SceneManager.GetActiveScene();
            if (!Application.isBatchMode || SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null ||
                string.IsNullOrEmpty(output) || !Path.IsPathRooted(output) || Directory.Exists(output) ||
                scene.isDirty || !string.IsNullOrEmpty(scene.path) || SceneManager.sceneCount != 1 || Hash(Path.Combine(Application.dataPath, Body.Substring(7))) != BodySha)
                throw new InvalidOperationException("Use the original Icarus and a fresh private graphics-enabled scene and output.");
            string folder = "Assets/PrivateIcarusFit-" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(folder));
            var target = new RenderTexture(960, 960, 24) { antiAliasing = 4 };
            var pixels = new Texture2D(960, 960, TextureFormat.RGB24, false);
            var pipeline = GraphicsSettings.defaultRenderPipeline;
            var quality = QualitySettings.renderPipeline;
            try
            {
                var urp = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
                if (!urp) throw new InvalidDataException("Missing review render pipeline.");
                GraphicsSettings.defaultRenderPipeline = QualitySettings.renderPipeline = urp;
                IcarusPrefabSetupEditor.RecoverReviewImports();
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(IcarusPrefabSetupEditor.PrefabPath);
                if (!AssetDatabase.GetDependencies(IcarusPrefabSetupEditor.PrefabPath).Contains(Body))
                    throw new InvalidDataException("The modular rig must contain the original Charakuru VRM.");
                var stage = new GameObject("Icarus fitting");
                var actor = Object.Instantiate(prefab, stage.transform);
                var sockets = actor.GetComponentsInChildren<Transform>(true)
                    .Where(t => t.name is "Socket_Wings" or "Socket_Bow").ToArray();
                foreach (var socket in sockets)
                    foreach (var child in socket.Cast<Transform>().ToArray()) Object.DestroyImmediate(child.gameObject);
                foreach (var line in actor.GetComponentsInChildren<LineRenderer>(true)) Object.DestroyImmediate(line);
                foreach (var control in actor.GetComponentsInChildren<Aetheria.Icarus.IcarusBowString>(true)) control.enabled = false;
                var report = new Report { scene = folder + "/Fitting.unity",
                    wingSha256 = Environment.GetEnvironmentVariable("AETHERIA_COLORED_WING_SHA"),
                    bowSha256 = Environment.GetEnvironmentVariable("AETHERIA_COLORED_BOW_SHA") };
                var walk = StageFile(folder, "AETHERIA_ICARUS_REVIEW_MOTION", "Walk.vrma", WalkSha);
                var vrm = actor.GetComponentInChildren<Vrm10Instance>();
                var (animator, clip, _) = IcarusH2AccessoryMotionPreview.Retarget(actor, vrm,
                    AssetDatabase.LoadAssetAtPath<GameObject>(Body), stage.transform, walk);
                AssetDatabase.CreateAsset(clip, folder + "/Walk.anim");
                var camera = IcarusH2AccessoryMotionPreview.Studio(stage.transform, target);
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(.19f, .19f, .19f);
                var ambient = new SphericalHarmonicsL2();
                ambient.AddAmbientLight(RenderSettings.ambientLight);
                RenderSettings.ambientProbe = ambient;
                foreach (var light in stage.GetComponentsInChildren<Light>())
                {
                    light.color = Color.white;
                    light.intensity = .34f;
                }
                clip.SampleAnimation(animator.gameObject, clip.length * .10f);
                var wing = StageFile(folder, "AETHERIA_COLORED_WING", "Wings.glb", report.wingSha256);
                Fit(actor, "Socket_Wings", wing, "tripo_part_56", true, report);
                GameObject fittedBow = null;
                Transform grip = null;
                if (!string.IsNullOrEmpty(report.bowSha256))
                {
                    var bow = StageFile(folder, "AETHERIA_COLORED_BOW", "Bow.glb", report.bowSha256);
                    fittedBow = Fit(actor, "Socket_Bow", bow, "BowGrip", false, report);
                    grip = fittedBow.GetComponentsInChildren<Transform>().Single(t => t.name == "BowGrip");
                }
                Directory.CreateDirectory(output);
                camera.transform.position = actor.transform.position - actor.transform.forward * 4 + Vector3.up;
                camera.transform.LookAt(actor.transform.position + Vector3.up);
                camera.orthographicSize = 1.3f;
                if (!EditorSceneManager.SaveScene(scene, report.scene)) throw new IOException("Could not save private assembly.");
                using var draw = new IcarusH2AccessoryMotionPreview.SampledSurfaceDraw(actor);
                draw.Refresh();
                var frame = VisibleBounds(actor);
                void Inspect(string file, Vector3 direction)
                {
                    IcarusH2AccessoryMotionPreview.Capture(camera, target, pixels, frame, direction, Path.Combine(output, file + ".png"));
                }
                Inspect("front", actor.transform.forward);
                Inspect("back", -actor.transform.forward);
                if (fittedBow) CaptureGrip(actor, fittedBow, vrm, camera, target, pixels, output, report);
                Inspect("rear-quarter", -actor.transform.forward + actor.transform.right * .65f + Vector3.up * .12f);
                clip.SampleAnimation(animator.gameObject, clip.length * .55f);
                if (fittedBow)
                    report.bowWalkContact = IcarusBowGripFit.Fit(fittedBow, grip, vrm, false);
                draw.Refresh();
                Inspect("walk-quarter", actor.transform.forward + actor.transform.right * .55f);
                File.WriteAllText(Path.Combine(output, "fitting.json"), JsonUtility.ToJson(report, true));
            }
            catch { AssetDatabase.DeleteAsset(folder); throw; }
            finally
            {
                GraphicsSettings.defaultRenderPipeline = pipeline;
                QualitySettings.renderPipeline = quality;
                target.Release();
                Object.DestroyImmediate(target);
                Object.DestroyImmediate(pixels);
            }
        }
    }
}
