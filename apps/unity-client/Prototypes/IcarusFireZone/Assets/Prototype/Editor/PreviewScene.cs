using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.IcarusPrototype
{
    public static class PreviewScene
    {
        private const string Prefab = "Assets/VirtualLife/ArtStudies/Icarus/Review/IcarusStudy.prefab";
        private const string ShaderPath = "Assets/Prototype/IcarusEmber.shader";

        [MenuItem("Aetheria/Icarus/Create Preview Scene")]
        public static void Create()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            ConfigureScene();
            if (!EditorSceneManager.SaveScene(scene, "Assets/Prototype/IcarusPreview.unity"))
                throw new InvalidOperationException("Could not save the preview scene.");
        }

        private static IcarusPreview ConfigureScene()
        {
            var pipeline = GraphicsSettings.currentRenderPipeline;
            var rendererData = pipeline == null ? null : new SerializedObject(pipeline).FindProperty("m_RendererDataList");
            if (rendererData == null || rendererData.arraySize != 1 ||
                AssetDatabase.GetAssetPath(rendererData.GetArrayElementAtIndex(0).objectReferenceValue) !=
                "Assets/VirtualLife/Settings/BlockoutRenderer.asset")
                throw new InvalidOperationException("The preview requires the pinned Universal Renderer.");
            var study = AssetDatabase.LoadAssetAtPath<GameObject>(Prefab);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
            if (study == null || shader == null || ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException("The study prefab and compiled effect shader are required.");
            var skin = study.GetComponentsInChildren<SkinnedMeshRenderer>(true).Single();
            Require(skin.sharedMesh != null && skin.sharedMaterials.Length == skin.sharedMesh.subMeshCount &&
                skin.sharedMaterials.All(material => material != null && material.shader.name == "Aetheria/StudyVertexColor"),
                "Study skin material slots");
            var animator = study.GetComponent<Animator>();
            var controller = animator?.runtimeAnimatorController as AnimatorController;
            Require(controller != null && controller.layers.Length == 1, "Study Animator controller");
            var states = controller.layers[0].stateMachine.states.Select(entry => entry.state).ToArray();
            foreach (string name in new[] { "idle", "intro", "normal", "rage", "signature" })
                Require(states.Count(state => state.name == name && state.motion is AnimationClip clip &&
                    clip.length > 0 && (clip.name == name || clip.name.EndsWith("|" + name, StringComparison.Ordinal))) == 1,
                    "Imported study clip " + name);
            var preview = new GameObject("Icarus Fire Zone Preview").AddComponent<IcarusPreview>();
            preview.Configure(study, shader);
            return preview;
        }

        public static void Verify()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var preview = ConfigureScene();
            try
            {
                preview.Initialize();
                var root = preview.transform;
                RendererBinding(root.Find("Charge and impact ring").GetComponent<MeshRenderer>(), 1);
                RendererBinding(root.Find("Embers").GetComponent<ParticleSystemRenderer>(), 0);
                RendererBinding(root.Find("Arrow trail").GetComponent<TrailRenderer>(), 2);
                var marker = root.Find(FireZone.Opcode);
                var renderer = marker.GetComponent<MeshRenderer>();
                RendererBinding(renderer, 3);
                var vertices = marker.GetComponent<MeshFilter>().sharedMesh.vertices;
                Require(vertices.Length == 16 * 4 && root.Find("10 x 10 board")
                    .GetComponent<MeshFilter>().sharedMesh.vertexCount == 100 * 4, "Grid and zone mesh counts");
                Require((vertices[0] - new Vector3(3.04f, .025f, 4.04f)).sqrMagnitude < 1e-8f, "Authorized grid anchor");
                foreach (MotionMode mode in Enum.GetValues(typeof(MotionMode)))
                {
                    preview.SetMotion(mode);
                    preview.ResetReplay();
                    Require(renderer.enabled, mode + " first turn");
                    preview.NextSnapshot();
                    Require(renderer.enabled, mode + " second turn");
                    preview.NextSnapshot();
                    Require(!renderer.enabled, mode + " expired");
                }
                Debug.Log("ICARUS_PROTOTYPE_PASS");
            }
            finally { UnityEngine.Object.DestroyImmediate(preview.gameObject); }
        }

        private static void RendererBinding(Renderer renderer, int shape)
        {
            var material = renderer.sharedMaterial;
            Require(material != null && material.shader.name == "Aetheria/Prototype/IcarusEmber" &&
                material.GetFloat("_Shape") == shape, "Renderer material on " + renderer.name);
        }

        private static void Require(bool valid, string label)
        {
            if (!valid) throw new InvalidOperationException("Icarus prototype verification failed: " + label);
        }
    }
}
