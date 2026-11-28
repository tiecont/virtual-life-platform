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
    // Pose-only take trials for the existing garment springs. Each root uses a
    // constant pelvis-local adjustment, so the original walk remains smooth.
    internal static class IcarusSkirtClearanceReview
    {
        internal static void Export(Vrm10Instance model, Animator animator, PlayableDirector director,
            TimelineClip take, AnimationClip original, AnimationClip baseline, SkinnedMeshRenderer[] skins,
            string folder, string output)
        {
            if (!model.TryGetBoneTransform(HumanBodyBones.Hips,out var hips))
                throw new InvalidOperationException("The private garment take requires the original hips.");
            var springs = model.SpringBone.Springs.Where(spring=>spring.Name.StartsWith("skirt_",StringComparison.Ordinal)).ToArray();
            if (springs.Length!=8 || springs.Any(spring=>spring.Joints.Count<2))
                throw new InvalidOperationException("The eight original skirt chains are required.");
            var playable = (AnimationPlayableAsset)take.asset;
            try
            {
                playable.clip=baseline;
                director.RebuildGraph();
                director.time=take.start+.001;
                director.Evaluate();
                var panels = springs.Select(spring=>{
                    var root = spring.Joints[0].transform;
                    var tail = spring.Joints[1].transform;
                    var outward = Vector3.ProjectOnPlane(root.position-hips.position,hips.up);
                    if (outward.sqrMagnitude<.000025f)
                        outward = Vector3.ProjectOnPlane(tail.position-hips.position,hips.up);
                    Vector3 axis = Vector3.Cross(tail.position-root.position,outward);
                    if (axis.sqrMagnitude<.00000001f)
                        throw new InvalidOperationException("Undefined authored skirt swing plane at "+spring.Name);
                    return (Name:spring.Name,Root:root,Axis:root.parent.InverseTransformDirection(axis.normalized),
                        RestRotation:root.localRotation);
                }).ToArray();
                IcarusLayerSurfaceExport.Write(Path.Combine(output,"skirt-baseline.bin"),skins,director,take.start,baseline.length);
                foreach (string region in new[] {"front","all"})
                    foreach (int degrees in new[] {4,8,12})
                    {
                        var clip=Object.Instantiate(baseline);
                        clip.name=$"IcarusWalkSkirt-{region}-{degrees}";
                        var bindings=new List<EditorCurveBinding>();
                        var curves=new List<AnimationCurve>();
                        foreach (var panel in panels)
                        {
                            if (region=="front" && !panel.Name.StartsWith("skirt_Front",StringComparison.Ordinal)) continue;
                            string path=AnimationUtility.CalculateTransformPath(panel.Root,animator.transform);
                            var rotation=Quaternion.AngleAxis(degrees,panel.Axis)*panel.RestRotation;
                            for (int channel=0;channel<4;channel++)
                            {
                                bindings.Add(EditorCurveBinding.FloatCurve(path,typeof(Transform),"m_LocalRotation."+"xyzw"[channel]));
                                curves.Add(AnimationCurve.Constant(0,baseline.length,rotation[channel]));
                            }
                        }
                        AnimationUtility.SetEditorCurves(clip,bindings.ToArray(),curves.ToArray());
                        clip.EnsureQuaternionContinuity();
                        var file=clip.name+".anim";
                        AssetDatabase.CreateAsset(clip,folder+"/"+file);
                        AssetDatabase.SaveAssetIfDirty(clip);
                        playable.clip=clip;
                        director.RebuildGraph();
                        IcarusLayerSurfaceExport.Write(Path.Combine(output,$"skirt-{region}-{degrees}.bin"),skins,director,take.start,baseline.length);
                        File.Copy(Path.Combine(Path.GetDirectoryName(Application.dataPath),folder,file),Path.Combine(output,file));
                        // Replace the preview graph before measuring the next
                        // region so unsampled root curves return to rest.
                        playable.clip=baseline;
                        director.RebuildGraph();
                        foreach (var panel in panels) panel.Root.localRotation=panel.RestRotation;
                    }
            }
            finally
            {
                playable.clip=original;
                director.RebuildGraph();
            }
        }
    }
}
