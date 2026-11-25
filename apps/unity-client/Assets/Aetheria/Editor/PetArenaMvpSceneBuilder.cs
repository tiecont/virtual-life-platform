using System;
using System.Linq;
using Aetheria.PetArena.Presentation;
using Aetheria.Pets.Presentation;
using Aetheria.RemoteContent;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.Editor
{
    public static class PetArenaMvpSceneBuilder
    {
        public const string ScenePath = "Assets/Aetheria/Scenes/PetArenaPve.unity";
        public const string IcarusProfilePath =
            "Assets/Aetheria/Features/Pets/Content/PetEvolution_Icarus.asset";
        public const string RemoteSettingsPath =
            "Assets/Aetheria/Features/RemoteContent/Content/R2RemoteContentSettings.asset";
        private const string MaterialPath =
            "Assets/Aetheria/Features/Pets/Content/IcarusAscendant.mat";

        [MenuItem("Aetheria/Pet Arena/Build playable MVP scene")]
        public static void Build()
        {
            EnsureFolder("Assets/Aetheria/Features/Pets/Content");
            EnsureFolder("Assets/Aetheria/Features/RemoteContent/Content");
            EnsureFolder("Assets/Aetheria/Scenes");
            var material = EnsureMaterial();
            var profile = EnsureIcarusProfile(material);
            var remote = EnsureRemoteSettings();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var root = new GameObject("Pet Arena PvE");
            var controller = root.AddComponent<PetArenaMvpController>();
            var serialized = new SerializedObject(controller);
            serialized.FindProperty("playerEvolution").objectReferenceValue = null;
            serialized.FindProperty("evolutionProfile").objectReferenceValue = profile;
            serialized.FindProperty("remoteSettings").objectReferenceValue = remote;
            serialized.FindProperty("reducedMotion").boolValue = true;
            serialized.FindProperty("buildDeveloperStage").boolValue = true;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            SceneManager.SetActiveScene(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.ImportAsset(ScenePath, ImportAssetOptions.ForceSynchronousImport |
                ImportAssetOptions.ForceUpdate);
            var reopened = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            EditorSceneManager.SaveScene(reopened, ScenePath);
            EnsureBuildEntry(ScenePath);
            AssetDatabase.SaveAssets();
            Selection.activeObject = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
            Debug.Log("Pet Arena MVP scene saved at " + ScenePath +
                " with Icarus profile " + profile.PetId + ".");
        }

        private static PetEvolutionProfile EnsureIcarusProfile(Material material)
        {
            var profile = AssetDatabase.LoadAssetAtPath<PetEvolutionProfile>(IcarusProfilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<PetEvolutionProfile>();
                AssetDatabase.CreateAsset(profile, IcarusProfilePath);
            }
            profile.Configure(new PetEvolutionProfileValues(
                "pet-v3-fire-icarus",
                "pets/pet-v3-fire-icarus",
                "Icarus",
                "Socket_Bow",
                "Socket_Halo",
                "Socket_Wings",
                "Aura",
                "MaxVFX",
                material));
            EditorUtility.SetDirty(profile);
            return profile;
        }

        private static R2RemoteContentSettings EnsureRemoteSettings()
        {
            var settings = AssetDatabase.LoadAssetAtPath<R2RemoteContentSettings>(RemoteSettingsPath);
            if (settings == null)
            {
                settings = ScriptableObject.CreateInstance<R2RemoteContentSettings>();
                AssetDatabase.CreateAsset(settings, RemoteSettingsPath);
            }
            settings.Configure(false, string.Empty);
            EditorUtility.SetDirty(settings);
            return settings;
        }

        private static Material EnsureMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (material == null)
            {
                var shader = Shader.Find("Universal Render Pipeline/Lit");
                if (shader == null) throw new InvalidOperationException("URP Lit shader is unavailable.");
                material = new Material(shader) {name = "Icarus Ascendant"};
                material.SetColor("_BaseColor", new Color(1f, .52f, .06f));
                material.SetColor("_EmissionColor", new Color(.45f, .08f, .01f));
                material.EnableKeyword("_EMISSION");
                AssetDatabase.CreateAsset(material, MaterialPath);
            }
            return material;
        }

        // The canonical registry owns the player build list; keep this call site
        // so rebuilding the arena scene still refreshes build settings.
        private static void EnsureBuildEntry(string scenePath)
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(scenePath) == null)
                throw new InvalidOperationException("Arena scene asset is missing: " + scenePath);
            ProjectScenes.ApplyEditorBuildSettings();
            AssetDatabase.SaveAssets();
        }

        private static void EnsureFolder(string path)
        {
            var segments = path.Split('/');
            var current = segments[0];
            for (var index = 1; index < segments.Length; index++)
            {
                var next = current + "/" + segments[index];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, segments[index]);
                current = next;
            }
        }
    }
}
