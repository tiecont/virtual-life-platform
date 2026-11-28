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
        private bool replaceRunnerScene;
        private NewSceneSetup runnerSetup;
        private AnimationClip clip;

        [SetUp]
        public void CreateSyntheticFixture()
        {
            var name = "CinematicStudioFixture-" + Guid.NewGuid().ToString("N");
            folder = "Assets/" + name;
            AssetDatabase.CreateFolder("Assets", name);
            previousScene = SceneManager.GetActiveScene();
            scene = default;
            replaceRunnerScene = false;
            if (SceneManager.sceneCount == 1 && string.IsNullOrEmpty(previousScene.path))
            {
                // Unity Test Framework starts EditMode in a default, untitled scene
                // and restores the user's original scene setup after its run.
                var roots = previousScene.GetRootGameObjects();
                bool defaultRoots = roots.Length == 2 && roots.All(root => root.transform.childCount == 0) &&
                    roots.Any(root => root.name == "Main Camera" && root.GetComponent<Camera>() != null) &&
                    roots.Any(root => root.name == "Directional Light" && root.GetComponent<Light>() != null);
                Assert.That(roots.Length == 0 || defaultRoots && !previousScene.isDirty, Is.True,
                    "The runner's untitled scene contains unsaved changes.");
                runnerSetup = defaultRoots ? NewSceneSetup.DefaultGameObjects : NewSceneSetup.EmptyScene;
                replaceRunnerScene = true;
            }
            scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,
                replaceRunnerScene ? NewSceneMode.Single : NewSceneMode.Additive);
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
                if (replaceRunnerScene) EditorSceneManager.NewScene(runnerSetup, NewSceneMode.Single);
                else EditorSceneManager.CloseScene(scene, true);
            }
            if (previousScene.IsValid() && previousScene.isLoaded)
                SceneManager.SetActiveScene(previousScene);
            if (AssetDatabase.IsValidFolder(folder)) AssetDatabase.DeleteAsset(folder);
        }

        [TestCase(CinematicStudio.Sequence.CharacterIntro, .35, .50)]
        [TestCase(CinematicStudio.Sequence.SkillShowcase, 0, .20)]
        [TestCase(CinematicStudio.Sequence.Ultimate, .55, .35)]
        [TestCase(CinematicStudio.Sequence.GachaReveal, .20, .90)]
        [TestCase(CinematicStudio.Sequence.BossIntro, .60, .45)]
        [TestCase(CinematicStudio.Sequence.BossPhaseTransition, .15, .25)]
        [TestCase(CinematicStudio.Sequence.Victory, .10, .75)]
        [TestCase(CinematicStudio.Sequence.Defeat, .20, .60)]
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
            if (replaceRunnerScene) scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            else EditorSceneManager.CloseScene(scene, true);
            scene = EditorSceneManager.OpenScene(scenePath,
                replaceRunnerScene ? OpenSceneMode.Single : OpenSceneMode.Additive);
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

        [Test]
        public void SavedPerformanceTakeBlendsThreeInstancesAndReopensWithItsOwnCueBindings()
        {
            var actor = AddModel("Body test fixture");
            var camera = AddModel("Camera test fixture");
            var source = actor.gameObject.AddComponent<AudioSource>();
            var particles = camera.gameObject.AddComponent<ParticleSystem>();
            var voice = AssetDatabase.LoadAssetAtPath<AudioClip>(
                "Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Audio/Vocals/icarus_kit_signature.ogg");

            AnimationClip Constant(string name, float value, float duration)
            {
                var motion = new AnimationClip {name = name};
                AnimationUtility.SetEditorCurve(motion,
                    EditorCurveBinding.FloatCurve(ProbePath, typeof(Transform), "m_LocalPosition.x"),
                    AnimationCurve.Constant(0, duration, value));
                AssetDatabase.CreateAsset(motion, folder + "/" + name + ".anim");
                return motion;
            }
            var idle = Constant("Idle", 0, 4);
            var walk = Constant("Walk", 2, 1);
            var shot = Constant("Shot", 3, 12);
            var timelinePath = folder + "/Performance.playable";
            var director = PerformanceSequence.Create(actor, idle, walk, camera, shot, source, voice, particles, timelinePath);
            Assert.Throws<InvalidOperationException>(() =>
                PerformanceSequence.Create(actor, idle, walk, camera, shot, source, voice, particles, timelinePath));
            var scenePath = folder + "/Performance.unity";
            Assert.That(EditorSceneManager.SaveScene(scene, scenePath), Is.True);
            if (!replaceRunnerScene) EditorSceneManager.CloseScene(scene, true);
            scene = EditorSceneManager.OpenScene(scenePath, replaceRunnerScene ? OpenSceneMode.Single : OpenSceneMode.Additive);

            director = scene.GetRootGameObjects().Select(root => root.GetComponent<PlayableDirector>()).Single(item => item != null);
            var timeline = (TimelineAsset)director.playableAsset;
            var body = timeline.GetOutputTracks().OfType<AnimationTrack>().Single(track => track.name != "Choreography");
            var clips = body.GetClips().OrderBy(instance => instance.start).ToArray();
            Assert.That(clips.Select(instance => instance.animationClip), Is.EqualTo(new[] { idle, walk, idle }));
            Assert.That(clips[0].end - clips[1].start, Is.EqualTo(PerformanceSequence.Transition).Within(.00001));
            Assert.That(clips[1].end - clips[2].start, Is.EqualTo(PerformanceSequence.Transition).Within(.00001));
            var vocal = timeline.GetOutputTracks().OfType<AudioTrack>().Single();
            var burst = timeline.GetOutputTracks().OfType<ControlTrack>().Single().GetClips().Single();
            Assert.That(vocal.GetClips().Single().start, Is.EqualTo(burst.start).Within(.00001));
            var boundActor = (Animator)director.GetGenericBinding(body);
            var boundCamera = (Animator)director.GetGenericBinding(timeline.GetOutputTracks().Single(track => track.name == "Choreography"));
            Assert.That(((AudioSource)director.GetGenericBinding(vocal)).gameObject, Is.SameAs(boundActor.gameObject));
            Assert.That(((ControlPlayableAsset)burst.asset).sourceGameObject.Resolve(director), Is.SameAs(boundCamera.gameObject));

            director.RebuildGraph();
            float Position(double time)
            {
                director.time = time;
                director.Evaluate();
                return boundActor.transform.Find(ProbePath).localPosition.x;
            }
            Assert.That(Position(clips[1].start - .01), Is.EqualTo(0).Within(.02));
            Assert.That(Position(clips[1].start + PerformanceSequence.Transition / 2), Is.InRange(.25f, 1.75f));
            Assert.That(Position(clips[1].start + .5), Is.EqualTo(2).Within(.02));
            Assert.That(Position(clips[2].start + PerformanceSequence.Transition / 2), Is.InRange(.25f, 1.75f));
            Assert.That(Position(clips[2].start + .5), Is.EqualTo(0).Within(.02));
            director.Stop();
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
