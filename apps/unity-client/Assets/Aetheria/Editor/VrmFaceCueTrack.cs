using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UniVRM10;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace Aetheria.Editor
{
    // Artist-authored cue times are in the original recording's seconds. The chosen
    // audio clip instance contributes its own trim, start and playback speed.
    public static class VrmFaceCueTrack
    {
        [Serializable] public sealed class Cue
        {
            public string preset;
            public float start, peak, end, weight;
        }

        [Serializable] public sealed class Sheet
        {
            public string audioAssetGuid, audioSha256;
            public double voiceStartSeconds;
            public Cue[] cues;
        }

        const string FaceTrackName = "Timed eyelids and visemes";

        [MenuItem("Aetheria/Character Performance/Add timed VRM face cues")]
        static void AddFromSelection()
        {
            var director = Selection.activeGameObject?.GetComponent<PlayableDirector>();
            if (director == null) throw new InvalidOperationException("Select the scene's performance director.");
            string file = EditorUtility.OpenFilePanel("Select the timed face cue sheet", "", "json");
            if (string.IsNullOrEmpty(file)) return;
            string target = EditorUtility.SaveFilePanelInProject("Save face performance", "FacePerformance", "anim",
                "Choose a new animation clip path.");
            if (!string.IsNullOrEmpty(target)) Add(director, JsonUtility.FromJson<Sheet>(File.ReadAllText(file)), target);
        }

        public static AnimationTrack Add(PlayableDirector director, Sheet sheet, string path)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || director == null ||
                director.playableAsset is not TimelineAsset timeline || !EditorUtility.IsPersistent(timeline))
                throw new ArgumentException("Choose a saved Timeline on a scene director in Edit Mode.");
            if (sheet?.cues == null || sheet.cues.Length == 0 || !double.IsFinite(sheet.voiceStartSeconds))
                throw new ArgumentException("A timed sheet requires at least one authored cue and a finite voice start.");
            string asset = AssetDatabase.GUIDToAssetPath(sheet.audioAssetGuid ?? "");
            var voice = AssetDatabase.LoadAssetAtPath<AudioClip>(asset);
            if (voice == null || !asset.StartsWith("Assets/", StringComparison.Ordinal))
                throw new InvalidDataException("The cue sheet does not identify a local voice asset.");
            using (var data = File.OpenRead(Path.Combine(Application.dataPath, asset.Substring(7))))
            using (var sha = SHA256.Create())
                if (!string.Equals(BitConverter.ToString(sha.ComputeHash(data)).Replace("-", ""), sheet.audioSha256,
                    StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Voice source fingerprint differs from this sheet.");

            var takes = timeline.GetOutputTracks().OfType<AudioTrack>().SelectMany(track => track.GetClips())
                .Where(clip => clip.asset is AudioPlayableAsset playable && playable.clip == voice &&
                    Math.Abs(clip.start - sheet.voiceStartSeconds) < .0001).ToArray();
            if (takes.Length != 1) throw new InvalidDataException("Select one matching Timeline voice instance by its start time.");
            var take = takes[0];
            var bodies = timeline.GetOutputTracks().OfType<AnimationTrack>().Where(track =>
                director.GetGenericBinding(track) is Animator actor && actor.GetComponent<Vrm10Instance>() != null).ToArray();
            if (bodies.Length != 1) throw new InvalidDataException("Bind exactly one VRM actor motion track on this director.");
            var body = bodies[0];
            var actor = (Animator)director.GetGenericBinding(body);
            var model = actor.GetComponent<Vrm10Instance>();
            if (model.isActiveAndEnabled && model.UpdateType != Vrm10Instance.UpdateTypes.None)
                throw new InvalidOperationException("Use a review instance with manual VRM updates so Timeline owns these mesh weights.");
            if (body.GetChildTracks().Any(track => track.name == FaceTrackName))
                throw new InvalidOperationException("This actor already has a timed face take.");
            if (string.IsNullOrEmpty(path) || !path.StartsWith("Assets/", StringComparison.Ordinal) ||
                !path.EndsWith(".anim", StringComparison.OrdinalIgnoreCase) || path.Contains('\\') ||
                path.Split('/').Any(part => part == ".." || part == "." || part.Length == 0) ||
                !AssetDatabase.IsValidFolder(path[..path.LastIndexOf('/')]))
                throw new ArgumentException("Choose a .anim file in an existing Assets folder.");
            var absolute = Path.Combine(Application.dataPath, path.Substring(7));
            if (File.Exists(absolute) || File.Exists(absolute + ".meta") || Directory.Exists(absolute))
                throw new IOException("Choose a new animation path to preserve the existing asset.");

            var face = Bake(model, sheet.cues, voice.length);
            AnimationTrack overlay = null;
            try
            {
                AssetDatabase.CreateAsset(face, path);
                overlay = timeline.CreateTrack<AnimationTrack>(body, FaceTrackName);
                var performance = overlay.CreateClip(face);
                performance.start = take.start;
                performance.clipIn = take.clipIn;
                performance.timeScale = take.timeScale;
                performance.duration = take.duration;
                ((AnimationPlayableAsset)performance.asset).loop = ((AudioPlayableAsset)take.asset).loop
                    ? AnimationPlayableAsset.LoopMode.On : AnimationPlayableAsset.LoopMode.Off;
                EditorUtility.SetDirty(body);
                EditorUtility.SetDirty(performance.asset);
                EditorUtility.SetDirty(overlay);
                EditorUtility.SetDirty(timeline);
                AssetDatabase.SaveAssetIfDirty(timeline);
                director.RebuildGraph();
                return overlay;
            }
            catch
            {
                if (overlay != null) timeline.DeleteTrack(overlay);
                if (AssetDatabase.GetAssetPath(face) == path) AssetDatabase.DeleteAsset(path);
                else UnityEngine.Object.DestroyImmediate(face);
                throw;
            }
        }

        public static AnimationClip Bake(Vrm10Instance model, Cue[] cues, float length)
        {
            if (model == null || model.Vrm == null || cues == null || cues.Length == 0 ||
                !float.IsFinite(length) || length <= 0)
                throw new ArgumentException("Provide a VRM actor, the voice duration and its timed cues.");

            var channels = new Dictionary<(string path, string shape), List<(Cue cue, float scale)>>();
            var confirmed = new HashSet<(Mesh mesh, int index)>();
            foreach (var cue in cues)
            {
                if (cue == null || !float.IsFinite(cue.weight) || !(cue.weight > 0 && cue.weight <= 1) ||
                    !(cue.start >= 0 && cue.start < cue.peak && cue.peak < cue.end && cue.end <= length))
                    throw new InvalidDataException("Each face cue needs 0 ≤ start < peak < end ≤ recording length and a weight in (0,1].");
                if (cue.preset is not ("aa" or "ih" or "ou" or "ee" or "oh" or "blink" or "blinkLeft" or "blinkRight"))
                    throw new InvalidDataException("Unsupported timed face preset " + cue.preset);
                var expression = model.Vrm.Expression.Clips.FirstOrDefault(entry => entry.Preset.ToString() == cue.preset).Clip;
                if (expression == null || expression.IsBinary || expression.MorphTargetBindings.Length == 0 ||
                    expression.NodeTransformBindings.Length != 0 || expression.MaterialUVBindings.Length != 0 ||
                    expression.MaterialColorBindings.Length != 0)
                    throw new InvalidDataException("A continuously weighted mesh expression is required for " + cue.preset);
                foreach (var binding in expression.MorphTargetBindings)
                {
                    var joint = string.IsNullOrEmpty(binding.RelativePath) ? model.transform : model.transform.Find(binding.RelativePath);
                    var skin = joint?.GetComponent<SkinnedMeshRenderer>();
                    var mesh = skin != null ? skin.sharedMesh : null;
                    if (mesh == null || !skin.enabled || !skin.gameObject.activeInHierarchy || binding.Index < 0 ||
                        binding.Index >= mesh.blendShapeCount || !(binding.Weight > 0 && binding.Weight <= 1))
                        throw new InvalidDataException("Missing active mesh target for " + cue.preset);
                    if (confirmed.Add((mesh, binding.Index)) && !Deforms(mesh, binding.Index))
                        throw new InvalidDataException("Mesh target contains no moving vertices for " + cue.preset);
                    var key = (AnimationUtility.CalculateTransformPath(joint, model.transform), mesh.GetBlendShapeName(binding.Index));
                    if (!channels.TryGetValue(key, out var entries)) channels[key] = entries = new();
                    entries.Add((cue, binding.Weight * 100));
                }
            }
            var clip = new AnimationClip { name = FaceTrackName, frameRate = 60 };
            try
            {
                foreach (var (target, entries) in channels)
                {
                    var times = entries.SelectMany(entry => new[] { entry.cue.start, entry.cue.peak, entry.cue.end })
                        .Append(0).Append(length).Distinct().OrderBy(time => time);
                    var curve = new AnimationCurve();
                    foreach (float time in times)
                    {
                        float value = 0;
                        foreach (var (cue, scale) in entries)
                            if (time > cue.start && time < cue.end)
                                value += scale * cue.weight * (time <= cue.peak
                                    ? (time - cue.start) / (cue.peak - cue.start) : (cue.end - time) / (cue.end - cue.peak));
                        if (value > 100.001f) throw new InvalidDataException("Overlapping cues exceed full weight on " + target.shape);
                        curve.AddKey(time, Mathf.Min(value, 100));
                    }
                    for (int i = 0; i < curve.length; i++)
                    {
                        AnimationUtility.SetKeyLeftTangentMode(curve, i, AnimationUtility.TangentMode.Linear);
                        AnimationUtility.SetKeyRightTangentMode(curve, i, AnimationUtility.TangentMode.Linear);
                    }
                    clip.SetCurve(target.path, typeof(SkinnedMeshRenderer), "blendShape." + target.shape, curve);
                }
                return clip;
            }
            catch { UnityEngine.Object.DestroyImmediate(clip); throw; }
        }

        static bool Deforms(Mesh mesh, int index)
        {
            var deltas = new Vector3[mesh.vertexCount];
            for (int i = 0; i < mesh.GetBlendShapeFrameCount(index); i++)
            {
                mesh.GetBlendShapeFrameVertices(index, i, deltas, null, null);
                if (deltas.Any(delta => delta.sqrMagnitude > 0)) return true;
            }
            return false;
        }
    }
}
