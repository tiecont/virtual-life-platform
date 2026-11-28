using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UniVRM10;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    // Private walk retarget trials preserve the captured arm swing. Widen each
    // shoulder by a fixed angle and measure the resulting actual skin crossings.
    internal static class IcarusArmClearanceReview
    {
        internal static void Export(Vrm10Instance model, Animator animator, PlayableDirector director,
            TimelineClip take, AnimationClip input, SkinnedMeshRenderer[] skins, string folder, string output)
        {
            Transform Mapped(HumanBodyBones bone) => model.TryGetBoneTransform(bone, out var value) ? value :
                throw new InvalidOperationException("Missing Icarus bone " + bone);
            var arms = new[] { Mapped(HumanBodyBones.LeftUpperArm), Mapped(HumanBodyBones.RightUpperArm) };
            var wrists = new[] { Mapped(HumanBodyBones.LeftHand), Mapped(HumanBodyBones.RightHand) };
            var playable = (AnimationPlayableAsset)take.asset;
            int steps = Mathf.CeilToInt(input.length * input.frameRate);
            try
            {
                foreach (var degrees in new[] { 4, 8, 12 })
                {
                    playable.clip = input;
                    director.RebuildGraph();
                    var rotations = arms.Select(_ => new Quaternion[steps+1]).ToArray();
                    for (int i = 0; i <= steps; i++)
                    {
                        director.time = take.start + Math.Min(input.length - .0001f, input.length * i / steps);
                        director.Evaluate();
                        for (int side = 0; side < arms.Length; side++)
                        {
                            var arm = arms[side];
                            var outward = (arm.position - arms[1-side].position).normalized;
                            var along = (wrists[side].position - arm.position).normalized;
                            var axis = Vector3.Cross(along, outward);
                            if (axis.sqrMagnitude < .0001f) throw new InvalidOperationException("Undefined shoulder swing plane.");
                            rotations[side][i] = Quaternion.Inverse(arm.parent.rotation) *
                                Quaternion.AngleAxis(degrees, axis.normalized) * arm.rotation;
                        }
                    }
                    var clip = Object.Instantiate(input);
                    clip.name = "IcarusWalkShoulder" + degrees;
                    var bindings = new List<EditorCurveBinding>();
                    var curves = new List<AnimationCurve>();
                    for (int side = 0; side < arms.Length; side++)
                    {
                        string path = AnimationUtility.CalculateTransformPath(arms[side], animator.transform);
                        for (int channel = 0; channel < 4; channel++)
                        {
                            bindings.Add(EditorCurveBinding.FloatCurve(path, typeof(Transform), "m_LocalRotation." + "xyzw"[channel]));
                            curves.Add(new AnimationCurve(Enumerable.Range(0, steps+1).Select(i =>
                                new Keyframe(input.length*i/steps, rotations[side][i][channel])).ToArray()));
                        }
                    }
                    AnimationUtility.SetEditorCurves(clip, bindings.ToArray(), curves.ToArray());
                    clip.EnsureQuaternionContinuity();
                    string file = clip.name + ".anim";
                    AssetDatabase.CreateAsset(clip, folder + "/" + file);
                    AssetDatabase.SaveAssetIfDirty(clip);
                    playable.clip = clip;
                    director.RebuildGraph();
                    IcarusLayerSurfaceExport.Write(Path.Combine(output, "shoulder-" + degrees + ".bin"), skins,
                        director, take.start, input.length);
                    File.Copy(Path.Combine(Path.GetDirectoryName(Application.dataPath),folder,file), Path.Combine(output,file));
                }
            }
            finally
            {
                playable.clip = input;
                director.RebuildGraph();
            }
        }
    }
}
