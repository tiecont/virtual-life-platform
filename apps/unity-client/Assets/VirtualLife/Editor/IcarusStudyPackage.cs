using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace VirtualLife.Editor
{
    // Review assets only: never registered with Resources, Addressables or a player scene.
    public static class IcarusStudyPackage
    {
        public const string Folder = "Assets/VirtualLife/ArtStudies/Icarus/Review";
        public const string PrefabPath = Folder + "/IcarusStudy.prefab";
        private static readonly string[] Actions = { "idle", "intro", "normal", "rage", "signature" };

        public static void Prepare()
        {
            const string modelPath = "Assets/VirtualLife/ArtStudies/Icarus/icarus-study.fbx";
            const string controllerPath = Folder + "/IcarusStudy.controller";
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(modelPath);
            var shader = Shader.Find("Aetheria/StudyVertexColor");
            if (model == null || shader == null || !shader.isSupported)
                throw new InvalidOperationException("Imported study model and supported study shader required");
            if (!AssetDatabase.IsValidFolder(Folder))
                AssetDatabase.CreateFolder("Assets/VirtualLife/ArtStudies/Icarus", "Review");
            var clips = AssetDatabase.LoadAllAssetsAtPath(modelPath).OfType<AnimationClip>()
                .Where(c => !c.name.StartsWith("__preview__", StringComparison.Ordinal)).ToArray();
            var selected = Actions.Select(name => clips.Single(c => c.name == name || c.name.EndsWith("|" + name, StringComparison.Ordinal))).ToArray();
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (controller == null)
            {
                controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
                controller.AddParameter("Action", AnimatorControllerParameterType.Int);
                var machine = controller.layers.Single().stateMachine;
                for (int i = 0; i < Actions.Length; i++)
                {
                    var state = machine.AddState(Actions[i], new Vector3(260, 40 + i * 70));
                    state.motion = selected[i];
                    var transition = machine.AddAnyStateTransition(state);
                    transition.canTransitionToSelf = false;
                    transition.hasExitTime = false;
                    transition.duration = 0.15f;
                    transition.AddCondition(AnimatorConditionMode.Equals, i, "Action");
                    if (i == 0) machine.defaultState = state;
                }
            }
            var states = controller.layers.Single().stateMachine.states.Select(s => s.state).ToArray();
            if (states.Length != Actions.Length || !controller.parameters.Any(p => p.name == "Action" && p.type == AnimatorControllerParameterType.Int))
                throw new InvalidOperationException("Unexpected existing review controller; inspect before replacing it");
            for (int i = 0; i < Actions.Length; i++)
                if (states.Single(s => s.name == Actions[i]).motion != selected[i])
                    throw new InvalidOperationException("Review controller action is not bound to the imported clip");

            var instance = UnityEngine.Object.Instantiate(model);
            try
            {
                instance.name = "IcarusStudy_DraftOnly";
                var skin = instance.GetComponentsInChildren<SkinnedMeshRenderer>().Single();
                skin.sharedMaterials = skin.sharedMaterials.Select(source =>
                {
                    string kind = source.name.Contains("FeatherSilk", StringComparison.Ordinal) ? "FeatherSilk" : source.name.Contains("Ornament", StringComparison.Ordinal) ? "Ornament" : "SkinHair";
                    float surface = kind == "FeatherSilk" ? 1 : kind == "Ornament" ? 2 : 0;
                    string path = Folder + "/" + kind + ".mat";
                    var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                    if (material == null)
                    {
                        material = new Material(shader);
                        material.SetFloat("_StudySurface", surface);
                        AssetDatabase.CreateAsset(material, path);
                    }
                    if (material.shader != shader || material.GetFloat("_StudySurface") != surface)
                        throw new InvalidOperationException("Existing review material changed; inspect before replacing it");
                    return material;
                }).ToArray();
                skin.updateWhenOffscreen = true;
                var animator = instance.GetComponent<Animator>();
                if (animator == null) animator = instance.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                animator.applyRootMotion = false;
                PrefabUtility.SaveAsPrefabAsset(instance, PrefabPath);
                AssetDatabase.SaveAssets();
            }
            finally { UnityEngine.Object.DestroyImmediate(instance); }
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            var importedSkin = prefab.GetComponentsInChildren<SkinnedMeshRenderer>().Single();
            if (importedSkin.sharedMaterials.Any(m => m == null || m.shader != shader) || importedSkin.bones.Length != 74 || prefab.GetComponent<Animator>().applyRootMotion)
                throw new InvalidOperationException("Saved study prefab failed reload validation");
            if (prefab.GetComponentsInChildren<MonoBehaviour>(true).Length != 0)
                throw new InvalidOperationException("Review prefab must have no gameplay scripts");
            var package = Environment.GetEnvironmentVariable("VL_ICARUS_PACKAGE_OUTPUT");
            if (!string.IsNullOrWhiteSpace(package))
            {
                if (!Path.IsPathRooted(package) || File.Exists(package) || !package.EndsWith(".unitypackage", StringComparison.Ordinal))
                    throw new InvalidOperationException("New absolute .unitypackage output required");
                const string artRoot = "Assets/VirtualLife/ArtStudies/Icarus/";
                var dependencies = AssetDatabase.GetDependencies(new[] { PrefabPath, controllerPath }, true);
                if (dependencies.Any(path => path.StartsWith("Assets/", StringComparison.Ordinal) && !path.StartsWith(artRoot, StringComparison.Ordinal)))
                    throw new InvalidOperationException("Unexpected dependency outside the review art folder");
                // URP remains a pinned Package Manager prerequisite, not vendored shader source.
                AssetDatabase.ExportPackage(dependencies.Where(path => path.StartsWith(artRoot, StringComparison.Ordinal)).ToArray(), package, ExportPackageOptions.Default);
                if (!File.Exists(package) || new FileInfo(package).Length == 0)
                    throw new InvalidOperationException("Study package was not created");
            }
            Debug.Log("ICARUS_STUDY_PACKAGE_PASS: prefab/materials/controller reloaded; five study actions; no gameplay registration");
        }
    }
}
