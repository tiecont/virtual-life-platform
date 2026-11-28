using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace Aetheria.Editor
{
    // Author native Timeline clips. All scene references belong to the director instance,
    // so a saved take can be reopened, scrubbed and played without the Editor builder.
    public static class PerformanceSequence
    {
        public const double Transition = .36;
        public const double WalkStart = 3.25;
        public const double ClosingBeat = 1.18;

        public static PlayableDirector Create(Animator character, AnimationClip idle, AnimationClip walk,
            Animator cameraRig, AnimationClip shot, AudioSource voice, AudioClip cue, ParticleSystem particles,
            string destination)
        {
            if (walk == null || walk.legacy || !EditorUtility.IsPersistent(walk) || walk.length < 2 * Transition ||
                idle == null || idle.length < WalkStart + Transition)
                throw new ArgumentException("The idle and walk must cover the opening hold and both transitions.");
            if (character == null || cameraRig == null || voice == null || particles == null ||
                cameraRig.gameObject.scene != character.gameObject.scene || voice.gameObject.scene != character.gameObject.scene ||
                particles.gameObject.scene != character.gameObject.scene || shot == null || cue == null ||
                !EditorUtility.IsPersistent(shot) || !EditorUtility.IsPersistent(cue))
                throw new ArgumentException("Supply saved camera and audio clips and bindings from the character's scene.");
            // This is a multi-track extension of a fresh take, never an edit of an artist's existing Timeline.
            if (AssetDatabase.LoadMainAssetAtPath(destination) != null)
                throw new InvalidOperationException("Choose a new path for the performance take.");

            double closeStart = WalkStart + walk.length - Transition;
            double cueStart = closeStart + ClosingBeat;
            double duration = cueStart + cue.length + .25;
            if (shot.length + .001 < duration)
                throw new ArgumentException("Camera choreography ends before the closing beat.");

            var director = CinematicStudio.CreateBoundTimeline(character, idle, CinematicStudio.Sequence.CharacterIntro, destination);
            var timeline = (TimelineAsset)director.playableAsset;
            try
            {
                var body = timeline.GetOutputTracks().OfType<AnimationTrack>().Single();
                var opening = body.GetClips().Single();
                opening.start = 0;
                opening.duration = WalkStart + Transition;
                opening.blendOutDuration = Transition;
                var moving = body.CreateClip(walk);
                moving.start = WalkStart;
                moving.duration = walk.length;
                moving.blendInDuration = moving.blendOutDuration = Transition;
                ((AnimationPlayableAsset)moving.asset).loop = AnimationPlayableAsset.LoopMode.Off;
                var closing = body.CreateClip(idle);
                closing.start = closeStart;
                closing.duration = duration - closeStart;
                closing.blendInDuration = Transition;
                ((AnimationPlayableAsset)closing.asset).loop = AnimationPlayableAsset.LoopMode.On;

                var cameraTrack = timeline.CreateTrack<AnimationTrack>("Choreography");
                cameraTrack.trackOffset = TrackOffset.ApplyTransformOffsets;
                var cameraTake = cameraTrack.CreateClip(shot);
                cameraTake.duration = duration;
                director.SetGenericBinding(cameraTrack, cameraRig);

                var audio = timeline.CreateTrack<AudioTrack>("Voice");
                audio.CreateClip(cue).start = cueStart;
                director.SetGenericBinding(audio, voice);

                var fx = timeline.CreateTrack<ControlTrack>("Element cue");
                var burst = fx.CreateClip<ControlPlayableAsset>();
                burst.start = cueStart;
                burst.duration = Math.Min(cue.length, 1.2);
                var control = (ControlPlayableAsset)burst.asset;
                control.sourceGameObject = new ExposedReference<GameObject> { exposedName = new PropertyName("ElementBurst") };
                control.updateDirector = false;
                control.updateITimeControl = false;
                control.particleRandomSeed = 719;
                director.SetReferenceValue(control.sourceGameObject.exposedName, particles.gameObject);

                timeline.fixedDuration = duration;
                director.extrapolationMode = DirectorWrapMode.Hold;
                foreach (var track in timeline.GetOutputTracks())
                {
                    EditorUtility.SetDirty(track);
                    foreach (var clip in track.GetClips()) EditorUtility.SetDirty(clip.asset);
                }
                EditorUtility.SetDirty(timeline);
                EditorUtility.SetDirty(director);
                AssetDatabase.SaveAssetIfDirty(timeline);
                return director;
            }
            catch
            {
                UnityEngine.Object.DestroyImmediate(director.gameObject);
                AssetDatabase.DeleteAsset(destination);
                throw;
            }
        }
    }
}
