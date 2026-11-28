using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace Aetheria.Editor
{
    public sealed class CinematicStudio : EditorWindow
    {
        private enum Sequence { CharacterIntro, SkillShowcase, Ultimate, GachaReveal }

        [SerializeField] private Animator model;
        [SerializeField] private AnimationClip clip;
        [SerializeField] private Sequence sequence;

        [MenuItem("Aetheria/Cinematic Studio")]
        private static void Open() => GetWindow<CinematicStudio>("Cinematic Studio");

        private void OnGUI()
        {
            sequence = (Sequence)EditorGUILayout.EnumPopup("Sequence", sequence);
            model = (Animator)EditorGUILayout.ObjectField("Scene model", model, typeof(Animator), true);
            clip = (AnimationClip)EditorGUILayout.ObjectField("Motion clip", clip, typeof(AnimationClip), false);
            bool valid = model != null && model.gameObject.scene.IsValid() &&
                !EditorUtility.IsPersistent(model) && clip != null && !clip.legacy && clip.length > 0;
            if (!valid)
                EditorGUILayout.HelpBox("Choose a model in the scene and a non-legacy animation clip.", MessageType.Info);
            using (new EditorGUI.DisabledScope(!valid))
                if (GUILayout.Button("Create bound Timeline")) Create();
        }

        private void Create()
        {
            var path = EditorUtility.SaveFilePanelInProject("Save cinematic Timeline",
                model.name + "-" + sequence, "playable", "Choose a location for this sequence.");
            if (string.IsNullOrEmpty(path)) return;
            path = AssetDatabase.GenerateUniqueAssetPath(path);
            var timeline = CreateInstance<TimelineAsset>();
            AssetDatabase.CreateAsset(timeline, path);
            var track = timeline.CreateTrack<AnimationTrack>(null, model.name);
            var motion = track.CreateClip(clip);
            motion.start = 0;
            motion.duration = clip.length;
            EditorUtility.SetDirty(timeline);
            AssetDatabase.SaveAssets();

            var holder = new GameObject(Path.GetFileNameWithoutExtension(path));
            UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(holder, model.gameObject.scene);
            Undo.RegisterCreatedObjectUndo(holder, "Create cinematic sequence");
            var director = Undo.AddComponent<PlayableDirector>(holder);
            Undo.RecordObject(director, "Bind cinematic model");
            director.playOnAwake = false;
            director.extrapolationMode = DirectorWrapMode.None;
            director.playableAsset = timeline;
            director.SetGenericBinding(track, model);
            EditorSceneManager.MarkSceneDirty(holder.scene);
            Selection.activeGameObject = holder;
        }
    }
}
