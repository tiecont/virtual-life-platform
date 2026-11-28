using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UniVRM10;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    public static class IcarusExpressionReview
    {
        [Serializable] sealed class Facts
        {
            public string candidateSha256, graphics;
            public float[] weights = {0f, .5f, 1f, 0f};
            public float[] maximumDisplacementMeters = new float[4];
            public int[] movedVertices = new int[4];
        }
        public static void Capture()
        {
            const string expected = "828f2c1bca9005815b836185f68a2edc14367b2067b83a5c4541337d3847e938";
            string input = Environment.GetEnvironmentVariable("AETHERIA_EXPRESSION_CANDIDATE");
            string output = Environment.GetEnvironmentVariable("AETHERIA_EXPRESSION_OUTPUT");
            if (!Application.isBatchMode || SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null ||
                string.IsNullOrEmpty(input) || !Path.IsPathRooted(input) || string.IsNullOrEmpty(output) ||
                !Path.IsPathRooted(output) || Directory.Exists(output) || File.Exists(output))
                throw new InvalidOperationException("Supply a private source VRM and fresh output to the rendered batch Editor.");
            using var sha = SHA256.Create();
            using (var file = File.OpenRead(input))
                if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant() != expected)
                    throw new InvalidOperationException("Unexpected private smile candidate.");
            Directory.CreateDirectory(output);
            string leaf = "IcarusExpression-" + Guid.NewGuid().ToString("N");
            string folder = "Assets/" + leaf;
            AssetDatabase.CreateFolder("Assets",leaf);
            var stage = new GameObject("Private facial performance review");
            var target = new RenderTexture(720,720,24);
            var pixels = new Texture2D(720,720,TextureFormat.RGB24,false);
            var prior = RenderTexture.active;
            var previousPipeline = GraphicsSettings.defaultRenderPipeline;
            var previousQuality = QualitySettings.renderPipeline;
            Mesh[] baked = Array.Empty<Mesh>();
            try
            {
                var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Aetheria/Settings/BlockoutURP.asset");
                if (!pipeline) throw new InvalidOperationException("Missing URP review asset.");
                GraphicsSettings.defaultRenderPipeline = QualitySettings.renderPipeline = pipeline;
                string path = folder + "/Icarus.vrm";
                File.Copy(input,Path.Combine(Application.dataPath,leaf,"Icarus.vrm"));
                AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);
                var source = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var model = Object.Instantiate(source,stage.transform).GetComponentInChildren<Vrm10Instance>(true);
                if (!model.TryGetBoneTransform(HumanBodyBones.LeftEye,out var left) ||
                    !model.TryGetBoneTransform(HumanBodyBones.RightEye,out var right))
                    throw new InvalidOperationException("Missing eye landmarks.");
                var camera = new GameObject("Matched expression camera").AddComponent<Camera>();
                camera.transform.SetParent(stage.transform,false);
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(.16f,.17f,.22f);
                camera.orthographic = true;
                float separation = Vector3.Distance(left.position,right.position);
                camera.orthographicSize = separation*2.9f;
                var focus = (left.position+right.position)*.5f + Vector3.down*separation*.57f;
                camera.transform.position = focus + Vector3.forward;
                camera.transform.LookAt(focus);
                camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
                var key = new GameObject("Expression key").AddComponent<Light>();
                key.transform.SetParent(stage.transform,false);
                key.type = LightType.Directional;
                key.intensity = .48f;
                key.transform.rotation = Quaternion.Euler(22,156,0);
                var skins = model.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                var head = Array.FindIndex(skins, s => s.name == "Head");
                if (head < 0 || skins[head].sharedMesh.blendShapeCount != 1)
                    throw new InvalidOperationException("Expected the authored Head morph.");
                baked = skins.Select(s => new Mesh()).ToArray();
                var filters = skins.Select(s => {
                    var draw = new GameObject("Expression snapshot");
                    draw.transform.SetParent(s.transform,false);
                    draw.AddComponent<MeshRenderer>().sharedMaterials = s.sharedMaterials;
                    s.enabled = false;
                    return draw.AddComponent<MeshFilter>();
                }).ToArray();
                var facts = new Facts { candidateSha256 = expected, graphics = SystemInfo.graphicsDeviceType.ToString() };
                Vector3[] neutral = null;
                var expression = model.Runtime.Expression;
                for (int i = 0; i < facts.weights.Length; i++)
                {
                    expression.SetWeight(ExpressionKey.Happy,facts.weights[i]);
                    model.Runtime.Process();
                    for (int k = 0; k < skins.Length; k++)
                    {
                        skins[k].BakeMesh(baked[k]);
                        filters[k].sharedMesh = baked[k];
                    }
                    var current = baked[head].vertices;
                    neutral ??= current;
                    var deltas = current.Select((p,k) => Vector3.Distance(p,neutral[k])).ToArray();
                    facts.maximumDisplacementMeters[i] = deltas.Max();
                    facts.movedVertices[i] = deltas.Count(v => v > .00001f);
                    RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest {destination=target});
                    RenderTexture.active = target;
                    pixels.ReadPixels(new Rect(0,0,720,720),0,0);
                    pixels.Apply();
                    File.WriteAllBytes(Path.Combine(output,"expression-"+i+".png"),pixels.EncodeToPNG());
                }
                if (facts.maximumDisplacementMeters[1] <= .0005f || facts.maximumDisplacementMeters[2] <= facts.maximumDisplacementMeters[1] ||
                    facts.maximumDisplacementMeters[3] > .00001f)
                    throw new InvalidOperationException("The actual VRM expression did not rise and return to rest.");
                File.WriteAllText(Path.Combine(output,"expression-review.json"),JsonUtility.ToJson(facts,true));
            }
            finally
            {
                QualitySettings.renderPipeline = previousQuality;
                GraphicsSettings.defaultRenderPipeline = previousPipeline;
                RenderTexture.active = prior;
                Object.DestroyImmediate(stage);
                foreach (var mesh in baked) Object.DestroyImmediate(mesh);
                Object.DestroyImmediate(pixels);
                Object.DestroyImmediate(target);
                AssetDatabase.DeleteAsset(folder);
            }
        }
    }
}
