using System;
using System.IO;
using System.Linq;
using Aetheria.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.SceneManagement;
using UnityEngine.Timeline;

namespace Aetheria.Tests
{
    public sealed class CinematicStudioTests
    {
        private const string SyntheticModel = "Synthetic test fixture (no production art)";
        private const string ProbePath = "SyntheticRig/Probe";

        private string folder;
        private Scene previousScene, scene;
        private AnimationClip clip;

        [SetUp]
        public void CreateSyntheticFixture()
        {
            var name = "CinematicStudioFixture-" + Guid.NewGuid().ToString("N");
            folder = "Assets/" + name;
            AssetDatabase.CreateFolder("Assets", name);
            previousScene = SceneManager.GetActiveScene();
            scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            clip = new AnimationClip { name = "Synthetic transform animation (test fixture)" };
            AnimationUtility.SetEditorCurve(clip,
                EditorCurveBinding.FloatCurve(ProbePath, typeof(Transform), "m_LocalPosition.x"),
                AnimationCurve.Linear(0, 0, 1, 2));
            AssetDatabase.CreateAsset(clip, folder + "/SyntheticMotion.anim");
            AssetDatabase.SaveAssetIfDirty(clip);
        }

        [TearDown]
        public void RemoveSyntheticFixture()
        {
            if (scene.IsValid() && scene.isLoaded)
            {
                foreach (var root in scene.GetRootGameObjects()) Undo.ClearUndo(root);
                EditorSceneManager.CloseScene(scene, true);
            }
            if (previousScene.IsValid() && previousScene.isLoaded)
                SceneManager.SetActiveScene(previousScene);
            if (AssetDatabase.IsValidFolder(folder)) AssetDatabase.DeleteAsset(folder);
        }

        [TestCase(CinematicStudio.Sequence.CharacterIntro, .35, .50)]
        [TestCase(CinematicStudio.Sequence.SkillShowcase, 0, .20)]
        [TestCase(CinematicStudio.Sequence.Ultimate, .55, .35)]
        [TestCase(CinematicStudio.Sequence.GachaReveal, .20, .90)]
        public void SavedTimelineAnimatesOnlyItsBoundSyntheticModelAfterReopen(
            CinematicStudio.Sequence sequence, double lead, double tail)
        {
            var model = AddModel(SyntheticModel);
            var unrelated = AddModel("Unbound synthetic test fixture");
            var playablePath = folder + "/" + sequence + ".playable";
            var director = CinematicStudio.CreateBoundTimeline(model, clip, sequence, playablePath);
            var guid = AssetDatabase.AssetPathToGUID(playablePath);

            Assert.That(director.gameObject.scene, Is.EqualTo(scene));
            Assert.That(director.playOnAwake, Is.False);
            Assert.That(CinematicStudio.CreateBoundTimeline(model, clip, sequence, playablePath), Is.SameAs(director));
            Assert.Throws<InvalidOperationException>(() =>
                CinematicStudio.CreateBoundTimeline(unrelated, clip, sequence, playablePath));

            var scenePath = folder + "/SyntheticMotionFixture.unity";
            Assert.That(EditorSceneManager.SaveScene(scene, scenePath), Is.True);
            Undo.ClearUndo(director.gameObject);
            EditorSceneManager.CloseScene(scene, true);
            scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Additive);
            director = scene.GetRootGameObjects().Select(root => root.GetComponent<PlayableDirector>())
                .Single(component => component != null);
            model = scene.GetRootGameObjects().Single(root => root.name == SyntheticModel).GetComponent<Animator>();
            unrelated = scene.GetRootGameObjects().Single(root => root.name == "Unbound synthetic test fixture")
                .GetComponent<Animator>();
            var timeline = AssetDatabase.LoadAssetAtPath<TimelineAsset>(playablePath);
            var track = (AnimationTrack)timeline.GetOutputTracks().Single();
            var take = track.GetClips().Single();

            Assert.That(AssetDatabase.AssetPathToGUID(playablePath), Is.EqualTo(guid));
            Assert.That(director.playableAsset, Is.EqualTo(timeline));
            Assert.That(director.GetGenericBinding(track), Is.EqualTo(model));
            Assert.That(take.animationClip, Is.EqualTo(clip));
            Assert.That(take.start, Is.EqualTo(lead).Within(.0001));
            Assert.That(take.duration, Is.EqualTo(1).Within(.0001));
            Assert.That(timeline.duration, Is.EqualTo(lead + 1 + tail).Within(.0001));

            director.RebuildGraph();
            director.time = lead + .5;
            director.Evaluate();
            Assert.That(model.transform.Find(ProbePath).localPosition.x, Is.EqualTo(1).Within(.02));
            Assert.That(unrelated.transform.Find(ProbePath).localPosition.x, Is.Zero.Within(.001));
            director.time = lead + 1 + tail / 2;
            director.Evaluate();
            Assert.That(model.transform.Find(ProbePath).localPosition.x, Is.EqualTo(2).Within(.02));
            director.Stop();
        }

        [Test]
        public void ExistingTimelineIsPreservedAndCanBeReboundAfterItsDirectorIsRemoved()
        {
            var model = AddModel(SyntheticModel);
            var path = folder + "/SyntheticIntro.playable";
            var director = CinematicStudio.CreateBoundTimeline(model, clip, CinematicStudio.Sequence.CharacterIntro, path);
            var timeline = director.playableAsset;
            var guid = AssetDatabase.AssetPathToGUID(path);

            Assert.Throws<IOException>(() =>
                CinematicStudio.CreateBoundTimeline(model, clip, CinematicStudio.Sequence.Ultimate, path));
            Undo.ClearUndo(director.gameObject);
            UnityEngine.Object.DestroyImmediate(director.gameObject);
            var rebound = CinematicStudio.CreateBoundTimeline(model, clip, CinematicStudio.Sequence.CharacterIntro, path);

            Assert.That(rebound.playableAsset, Is.SameAs(timeline));
            Assert.That(AssetDatabase.AssetPathToGUID(path), Is.EqualTo(guid));
            Assert.That(rebound.GetGenericBinding(((TimelineAsset)timeline).GetOutputTracks().Single()), Is.EqualTo(model));
        }

        private Animator AddModel(string label)
        {
            var root = new GameObject(label);
            if (root.scene != scene) SceneManager.MoveGameObjectToScene(root, scene);
            var rig = new GameObject("SyntheticRig").transform;
            rig.SetParent(root.transform, false);
            var probe = new GameObject("Probe").transform;
            probe.SetParent(rig, false);
            var animator = root.AddComponent<Animator>();
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            return animator;
        }
    }
}
