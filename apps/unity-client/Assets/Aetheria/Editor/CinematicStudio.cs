using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.SceneManagement;
using UnityEngine.Timeline;

namespace Aetheria.Editor
{
    public sealed class CinematicStudio : EditorWindow
    {
        public enum Sequence { CharacterIntro, SkillShowcase, Ultimate, GachaReveal, BossIntro, BossPhaseTransition, Victory, Defeat }

        private const string UndoLabel = "Create cinematic sequence";
        private const string TrackPrefix = "Aetheria model motion · ";

        [SerializeField] private Animator model;
        [SerializeField] private AnimationClip clip;
        [SerializeField] private Sequence sequence;

        private string error;

        [MenuItem("Aetheria/Cinematic Studio")]
        private static void Open() => GetWindow<CinematicStudio>("Cinematic Studio");

        private void OnGUI()
        {
            EditorGUI.BeginChangeCheck();
            sequence = (Sequence)EditorGUILayout.EnumPopup("Sequence", sequence);
            model = (Animator)EditorGUILayout.ObjectField("Scene model", model, typeof(Animator), true);
            clip = (AnimationClip)EditorGUILayout.ObjectField("Motion clip", clip, typeof(AnimationClip), false);
            if (EditorGUI.EndChangeCheck()) error = null;

            if (!TryValidate(model, clip, out var reason))
                EditorGUILayout.HelpBox(reason, MessageType.Info);
            else
            {
                var composition = CompositionFor(sequence);
                EditorGUILayout.LabelField("Pose holds", FormattableString.Invariant(
                    $"{composition.Lead:0.##} s before · {composition.Tail:0.##} s after"));
            }

            using (new EditorGUI.DisabledScope(reason != null))
                if (GUILayout.Button("Create bound Timeline")) Create();
            if (!string.IsNullOrEmpty(error)) EditorGUILayout.HelpBox(error, MessageType.Error);
        }

        private void Create()
        {
            error = null;
            var name = model.name + "-" + sequence;
            var invalid = Path.GetInvalidFileNameChars();
            name = string.Concat(name.Select(ch => invalid.Contains(ch) || ch == '\\' ? '_' : ch));
            var path = EditorUtility.SaveFilePanelInProject("Save cinematic Timeline",
                name, "playable", "Choose a location for the bound Timeline.");
            if (string.IsNullOrEmpty(path)) return;
            try { Selection.activeGameObject = CreateBoundTimeline(model, clip, sequence, path).gameObject; }
            catch (Exception failure) when (failure is ArgumentException || failure is IOException ||
                failure is InvalidOperationException)
            {
                error = failure.Message;
            }
        }

        public static PlayableDirector CreateBoundTimeline(Animator model, AnimationClip clip,
            Sequence sequence, string path)
        {
            if (!TryValidate(model, clip, out var reason)) throw new ArgumentException(reason);
            ValidatePath(path);
            var composition = CompositionFor(sequence);
            var trackName = TrackPrefix + composition.Title;
            var targetScene = model.gameObject.scene;

            var existing = AssetDatabase.LoadMainAssetAtPath(path);
            if (existing != null)
            {
                if (existing is not TimelineAsset saved)
                    throw new IOException("The destination already contains another asset.");
                var track = FindMatchingTrack(saved, clip, trackName, composition);
                var directors = targetScene.GetRootGameObjects()
                    .SelectMany(root => root.GetComponentsInChildren<PlayableDirector>(true))
                    .Where(director => director.playableAsset == saved).ToArray();
                if (directors.Length == 0) return CreateDirector(targetScene, path, saved, track, model);
                if (directors.Length == 1 && directors[0].GetGenericBinding(track) == model)
                    return directors[0];
                throw new InvalidOperationException("The Timeline already has a different or ambiguous binding in this scene.");
            }

            var absolute = Path.Combine(Path.GetDirectoryName(Application.dataPath), path);
            if (File.Exists(absolute) || File.Exists(absolute + ".meta") || Directory.Exists(absolute))
                throw new IOException("The destination is occupied and cannot be safely reused.");

            var timeline = CreateInstance<TimelineAsset>();
            AnimationTrack createdTrack = null;
            TimelineClip motion = null;
            try
            {
                AssetDatabase.CreateAsset(timeline, path);
                if (AssetDatabase.GetAssetPath(timeline) != path)
                    throw new IOException("Unity could not create the Timeline asset.");
                createdTrack = timeline.CreateTrack<AnimationTrack>(trackName);
                createdTrack.trackOffset = TrackOffset.ApplySceneOffsets;
                motion = createdTrack.CreateClip(clip);
                if (motion == null) throw new InvalidOperationException("Unity could not add the motion clip.");
                motion.start = composition.Lead;
                motion.duration = clip.length;
                ((AnimationPlayableAsset)motion.asset).loop = AnimationPlayableAsset.LoopMode.Off;
                timeline.durationMode = TimelineAsset.DurationMode.FixedLength;
                timeline.fixedDuration = motion.end + composition.Tail;
                EditorUtility.SetDirty(motion.asset);
                EditorUtility.SetDirty(createdTrack);
                EditorUtility.SetDirty(timeline);
                AssetDatabase.SaveAssetIfDirty(timeline);
                return CreateDirector(targetScene, path, timeline, createdTrack, model);
            }
            catch
            {
                if (AssetDatabase.GetAssetPath(timeline) == path) AssetDatabase.DeleteAsset(path);
                else DestroyImmediate(timeline);
                throw;
            }
            finally
            {
                // The Timeline file is an explicit save. Undo controls the new
                // scene object and leaves its reusable file and track intact.
                if (motion?.asset != null) Undo.ClearUndo(motion.asset);
                if (createdTrack != null) Undo.ClearUndo(createdTrack);
                if (timeline != null) Undo.ClearUndo(timeline);
            }
        }

        private static bool TryValidate(Animator model, AnimationClip clip, out string reason)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                reason = "Stop Play Mode before authoring a cinematic.";
            else if (model == null || EditorUtility.IsPersistent(model) || !model.gameObject.scene.IsValid() ||
                !model.gameObject.scene.isLoaded || StageUtility.GetStageHandle(model.gameObject) != StageUtility.GetMainStageHandle())
                reason = "Choose an Animator in a loaded scene in the main stage.";
            else if (clip == null || !EditorUtility.IsPersistent(clip) || clip.legacy || clip.length <= 0 ||
                float.IsNaN(clip.length) || float.IsInfinity(clip.length))
                reason = "Choose a saved, non-legacy animation clip with a positive duration.";
            else reason = null;
            return reason == null;
        }

        private static void ValidatePath(string path)
        {
            if (string.IsNullOrEmpty(path) || !path.StartsWith("Assets/", StringComparison.Ordinal) ||
                !string.Equals(Path.GetExtension(path), ".playable", StringComparison.Ordinal) ||
                path.Contains('\\') || path.Split('/').Any(part => part.Length == 0 || part == "." || part == "..") ||
                !AssetDatabase.IsValidFolder(path[..path.LastIndexOf('/')]))
                throw new ArgumentException("Choose a .playable file in an existing Assets folder.", nameof(path));
        }

        private static AnimationTrack FindMatchingTrack(TimelineAsset timeline, AnimationClip clip,
            string trackName, Composition composition)
        {
            var tracks = timeline.GetRootTracks().ToArray();
            if (tracks.Length == 1 && tracks[0] is AnimationTrack track && track.name == trackName)
            {
                var clips = track.GetClips().ToArray();
                if (clips.Length == 1 && clips[0].animationClip == clip &&
                    CloseTime(clips[0].start, composition.Lead) && CloseTime(clips[0].duration, clip.length) &&
                    timeline.durationMode == TimelineAsset.DurationMode.FixedLength &&
                    CloseTime(timeline.duration, clips[0].end + composition.Tail))
                    return track;
            }
            throw new IOException("The destination contains a different Timeline. Choose a new file to preserve it.");
        }

        private static bool CloseTime(double first, double second) => Math.Abs(first - second) < .0001;

        private static PlayableDirector CreateDirector(Scene scene, string path,
            TimelineAsset timeline, AnimationTrack track, Animator model)
        {
            var activeScene = SceneManager.GetActiveScene();
            GameObject holder = null;
            try
            {
                if (activeScene != scene && !SceneManager.SetActiveScene(scene))
                    throw new InvalidOperationException("Unity could not activate the model's scene for authoring.");
                holder = new GameObject(Path.GetFileNameWithoutExtension(path));
                var director = holder.AddComponent<PlayableDirector>();
                director.playOnAwake = false;
                director.extrapolationMode = DirectorWrapMode.None;
                director.playableAsset = timeline;
                director.SetGenericBinding(track, model);
                Undo.RegisterCreatedObjectUndo(holder, UndoLabel);
                EditorSceneManager.MarkSceneDirty(scene);
                return director;
            }
            catch
            {
                if (holder != null) DestroyImmediate(holder);
                throw;
            }
            finally
            {
                if (activeScene != scene && activeScene.IsValid() && activeScene.isLoaded)
                    SceneManager.SetActiveScene(activeScene);
            }
        }

        private static Composition CompositionFor(Sequence sequence) => sequence switch
        {
            Sequence.CharacterIntro => new("Character intro", .35, .50),
            Sequence.SkillShowcase => new("Skill showcase", 0, .20),
            Sequence.Ultimate => new("Ultimate", .55, .35),
            Sequence.GachaReveal => new("Gacha reveal", .20, .90),
            Sequence.BossIntro => new("Boss intro", .60, .45),
            Sequence.BossPhaseTransition => new("Boss phase transition", .15, .25),
            Sequence.Victory => new("Victory", .10, .75),
            Sequence.Defeat => new("Defeat", .20, .60),
            _ => throw new ArgumentOutOfRangeException(nameof(sequence))
        };

        private readonly struct Composition
        {
            public readonly string Title;
            public readonly double Lead, Tail;

            public Composition(string title, double lead, double tail)
            { Title = title; Lead = lead; Tail = tail; }
        }
    }
}
