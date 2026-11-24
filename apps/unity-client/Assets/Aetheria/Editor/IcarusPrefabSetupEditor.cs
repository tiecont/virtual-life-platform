using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using Aetheria.Icarus;

namespace Aetheria.Editor
{
    public static class IcarusPrefabSetupEditor
    {
        private const string CharacterFolder = "Assets/Aetheria/ArtStudies/Icarus";
        private const string ReviewVrmPath = CharacterFolder + "/Source/Icarus.vrm";
        private const string ModularFolder = CharacterFolder + "/Modular";
        private const string AvatarPath = ModularFolder + "/IcarusReviewAvatar.asset";
        private const string AccessoriesFolder = ModularFolder + "/Accessories";
        private const float BowStringHalfLength = .55f;
        public const string PrefabPath = CharacterFolder + "/Modular/Icarus.prefab";

        [MenuItem("Aetheria/Icarus/Build or update modular prefab")]
        public static void BuildSelected() => Build(Selection.activeObject as GameObject, PrefabPath);

        [MenuItem("Aetheria/Icarus/Build offline VRM review prefab")]
        public static void BuildVrmReview()
        {
            AssetDatabase.ImportAsset(ReviewVrmPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            AssetDatabase.ImportAsset($"{AccessoriesFolder}/Icarus_Wings.glb",
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            AssetDatabase.ImportAsset($"{AccessoriesFolder}/Icarus_Bow.glb",
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var selected = AssetDatabase.LoadAssetAtPath<GameObject>(
                AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath) != null ? PrefabPath : ReviewVrmPath);
            Build(selected, PrefabPath);
        }

        private static void Build(GameObject selected, string output)
        {
            if (selected == null || !EditorUtility.IsPersistent(selected))
                throw new InvalidOperationException("Select the reviewed Generic FBX or Generic rig prefab in the Project window.");
            string source = AssetDatabase.GetAssetPath(selected);
            bool buildFromReviewVrm = source == ReviewVrmPath && output == PrefabPath;
            if (AssetDatabase.LoadMainAssetAtPath(source) != selected ||
                source.StartsWith(CharacterFolder + "/Review/", StringComparison.Ordinal))
                throw new InvalidOperationException("Select a Generic source asset; archived Icarus studies are preserved.");

            GameObject existing = AssetDatabase.LoadAssetAtPath<GameObject>(output);
            if (existing != null && source != output)
                throw new InvalidOperationException("Select the existing modular Icarus prefab to update its sockets in place.");
            if (existing == null && AssetDatabase.LoadMainAssetAtPath(output) != null)
                throw new InvalidOperationException("The prefab path is already occupied.");

            GameObject root;
            if (existing != null)
            {
                root = PrefabUtility.LoadPrefabContents(output);
            }
            else
            {
                var importer = AssetImporter.GetAtPath(source);
                if (importer is ModelImporter modelImporter)
                {
                    if (!source.EndsWith(".fbx", StringComparison.OrdinalIgnoreCase) ||
                        modelImporter.animationType != ModelImporterAnimationType.Generic)
                        throw new InvalidOperationException("Icarus requires a Generic FBX; leave the model import contract unchanged.");
                }
                else if (!buildFromReviewVrm && !source.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("A VRM importer or another source format is outside the Generic prefab contract.");
                }
                // Preview scene keeps the user's open scene and its dirty state untouched.
                var scene = UnityEditor.SceneManagement.EditorSceneManager.NewPreviewScene();
                try
                {
                    root = (GameObject)PrefabUtility.InstantiatePrefab(selected, scene);
                    if (root == null) throw new InvalidOperationException("Could not instantiate the selected Icarus source.");
                    root.name = "Icarus";
                }
                catch
                {
                    UnityEditor.SceneManagement.EditorSceneManager.ClosePreviewScene(scene);
                    throw;
                }
            }
            try
            {
                if (existing != null && root.GetComponent<IcarusWingController>() == null)
                    throw new InvalidOperationException("The existing prefab was not built by this tool. Review it before adding sockets.");
                if (output == PrefabPath && !AssetDatabase.IsValidFolder(ModularFolder))
                    AssetDatabase.CreateFolder(CharacterFolder, "Modular");
                if (buildFromReviewVrm) BindReviewAvatar(root);
                SetUp(root, output == PrefabPath);
                // Use the original path on update so references and the asset GUID are preserved.
                var saved = PrefabUtility.SaveAsPrefabAsset(root, output, out bool success);
                if (!success || saved == null) throw new InvalidOperationException("Could not save " + output);
                Debug.Log("Icarus modular prefab saved. Check socket fit against the authorized model in Unity.", saved);
            }
            finally
            {
                if (existing != null) PrefabUtility.UnloadPrefabContents(root);
                else UnityEditor.SceneManagement.EditorSceneManager.ClosePreviewScene(root.scene);
            }
        }

        private static void BindReviewAvatar(GameObject root)
        {
            var animator = root.GetComponentsInChildren<Animator>(true).Single();
            if (!animator.isHuman || animator.GetBoneTransform(HumanBodyBones.Hips) == null)
                throw new InvalidOperationException("The offline VRM review source needs a mapped hips transform.");

            Avatar avatar = AssetDatabase.LoadAssetAtPath<Avatar>(AvatarPath);
            if (avatar == null)
            {
                avatar = AvatarBuilder.BuildGenericAvatar(animator.gameObject, animator.GetBoneTransform(HumanBodyBones.Hips).name);
                if (!avatar.isValid || avatar.isHuman)
                    throw new InvalidOperationException("Unable to build the offline Generic VRM review avatar.");
                avatar.name = "IcarusReviewAvatar";
                AssetDatabase.CreateAsset(avatar, AvatarPath);
            }
            animator.avatar = avatar;
            animator.applyRootMotion = false;

            // This offline Generic study uses the imported renderers and bones without VRM Humanoid playback.
            var vrm = root.GetComponent<UniVRM10.Vrm10Instance>();
            if (vrm != null) vrm.enabled = false;
        }

        private static void SetUp(GameObject root, bool attachAccessories)
        {
            Animator[] animators = root.GetComponentsInChildren<Animator>(true);
            if (animators.Length != 1 || animators[0].avatar == null ||
                !animators[0].avatar.isValid || animators[0].avatar.isHuman || animators[0].applyRootMotion)
                throw new InvalidOperationException("Bind one valid Generic Avatar with root motion off.");
            if ((root.transform.lossyScale - Vector3.one).sqrMagnitude > .000001f)
                throw new InvalidOperationException("Set the character root scale to (1, 1, 1) before placing metre-based sockets.");

            Transform chest = FindBone(animators[0].transform, "UpperChest", "upper_chest", "upperChest");
            Transform head = FindBone(animators[0].transform, "Head", "head");
            Transform hand = FindBone(animators[0].transform, "RightHand", "hand.R", "right_hand");
            Transform wings = Socket(root.transform, chest, "Socket_Wings", new Vector3(0, .015f, -.10f));
            // The attachment +Z axes point rearward and out from the shoulder blades.
            Socket(root.transform, wings, "Socket_Wing_L", new Vector3(-.105f, 0, 0), Quaternion.Euler(0, -142, 0));
            Socket(root.transform, wings, "Socket_Wing_R", new Vector3(.105f, 0, 0), Quaternion.Euler(0, 142, 0));
            Transform halo = Socket(root.transform, head, "Socket_Halo", new Vector3(0, .205f, 0));
            Transform bow = Socket(root.transform, hand, "Socket_Bow", Vector3.zero, Quaternion.identity);
            if (attachAccessories)
            {
                AttachAccessory(wings, "Icarus_Wings");
                AttachAccessory(bow, "Icarus_Bow");
            }
            Transform bowTop = Socket(root.transform, bow, "Socket_BowString_Top",
                new Vector3(0, BowStringHalfLength, 0), refreshPosition: true);
            Transform bowBottom = Socket(root.transform, bow, "Socket_BowString_Bottom",
                new Vector3(0, -BowStringHalfLength, 0), refreshPosition: true);

            var controller = root.GetComponent<IcarusWingController>() ?? root.AddComponent<IcarusWingController>();
            if (root.GetComponent<IcarusSignaturePresentation>() == null) root.AddComponent<IcarusSignaturePresentation>();
            if (root.GetComponent<IcarusFireZonePresentation>() == null) root.AddComponent<IcarusFireZonePresentation>();
            var bowString = root.GetComponent<IcarusBowString>() ?? root.AddComponent<IcarusBowString>();
            var fields = new SerializedObject(controller);
            fields.FindProperty("wingSocket").objectReferenceValue = wings;
            fields.FindProperty("haloSocket").objectReferenceValue = halo;
            fields.ApplyModifiedPropertiesWithoutUndo();
            var stringFields = new SerializedObject(bowString);
            stringFields.FindProperty("upperEndpoint").objectReferenceValue = bowTop;
            stringFields.FindProperty("lowerEndpoint").objectReferenceValue = bowBottom;
            stringFields.FindProperty("defaultOff").boolValue = true;
            stringFields.ApplyModifiedPropertiesWithoutUndo();
            wings.gameObject.SetActive(false);
        }

        private static void AttachAccessory(Transform socket, string name)
        {
            Transform existing = socket.Find(name);
            if (existing != null)
            {
                if (existing.GetComponentsInChildren<Renderer>(true).Length == 0)
                    throw new InvalidOperationException($"{name} is attached but has no renderers.");
                return;
            }

            string path = $"{AccessoriesFolder}/{name}.glb";
            GameObject asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (asset == null)
                throw new InvalidOperationException($"Import failed for {path}.");
            if (asset.GetComponentsInChildren<Renderer>(true).Length == 0)
                throw new InvalidOperationException($"{path} contains no renderable geometry.");

            var attachment = (GameObject)PrefabUtility.InstantiatePrefab(asset, socket);
            if (attachment == null)
                throw new InvalidOperationException($"Could not instantiate {path}.");
            attachment.name = name;
            attachment.transform.localPosition = Vector3.zero;
            attachment.transform.localRotation = Quaternion.identity;
            attachment.transform.localScale = Vector3.one;
        }

        private static Transform FindBone(Transform rig, params string[] names)
        {
            var matches = rig.GetComponentsInChildren<Transform>(true)
                .Where(node => names.Contains(node.name, StringComparer.OrdinalIgnoreCase) &&
                    node.GetComponent<Renderer>() == null).ToArray();
            if (matches.Length != 1)
                throw new InvalidOperationException($"Exactly one {names[0]} bone is required; found {matches.Length}.");
            return matches[0];
        }

        private static Transform Socket(Transform rig, Transform parent, string name, Vector3 rootOffset,
            Quaternion? orientation = null, bool refreshPosition = false)
        {
            var matches = rig.GetComponentsInChildren<Transform>(true).Where(node => node.name == name).ToArray();
            if (matches.Length == 1 && matches[0].parent == parent)
            {
                Transform existing = matches[0];
                if (refreshPosition) existing.localPosition = rootOffset;
                return existing;
            }
            if (matches.Length != 0) throw new InvalidOperationException($"Socket '{name}' is duplicated or attached to the wrong bone.");
            var socket = new GameObject(name).transform;
            socket.SetParent(parent, false);
            socket.SetPositionAndRotation(parent.position + rig.TransformVector(rootOffset),
                orientation.HasValue ? rig.rotation * orientation.Value : name == "Socket_Bow" ? parent.rotation : rig.rotation);
            return socket;
        }
    }
}
