using System.Collections.Generic;
using System.Linq;
using UniVRM10;
using UnityEditor;
using UnityEngine;

namespace Aetheria.Editor
{
    internal static class IcarusBodyPerformance
    {
        // Keep foot transforms at the imported rest pose. Lower the arms relative to
        // their real elbow directions instead of assuming local bone axes.
        public static AnimationClip BakeIdle(Animator model, Vrm10Instance vrm)
        {
            const int fps = 30, seconds = 4;
            var bones = new Dictionary<HumanBodyBones, Transform>();
            for (int index = 0; index < (int)HumanBodyBones.LastBone; index++)
                if (vrm.TryGetBoneTransform((HumanBodyBones)index, out var joint)) bones[(HumanBodyBones)index] = joint;
            var rest = bones.ToDictionary(pair => pair.Key, pair => pair.Value.localRotation);
            var curves = bones.ToDictionary(pair => pair.Key, _ =>
                Enumerable.Range(0, 4).Select(_ => new AnimationCurve()).ToArray());
            var clip = new AnimationClip { name = "Icarus quiet attention", frameRate = fps };
            var hips = bones[HumanBodyBones.Hips];
            void Turn(HumanBodyBones bone, Vector3 axis, float degrees)
            {
                if (bones.TryGetValue(bone, out var joint))
                    joint.rotation = Quaternion.AngleAxis(degrees, axis) * joint.rotation;
            }
            void Arm(HumanBodyBones upper, HumanBodyBones lower, HumanBodyBones hand, float side, float breath)
            {
                var arm = bones[upper];
                var elbow = bones[lower];
                Vector3 outward = model.transform.right * side;
                void Aim(Transform joint, Transform child, Vector3 direction) =>
                    joint.rotation = Quaternion.FromToRotation(child.position - joint.position, direction) * joint.rotation;
                Aim(arm, elbow, -model.transform.up + outward * (.34f + .022f * breath) +
                    model.transform.forward * .08f);
                Aim(elbow, bones[hand], -model.transform.up + outward * .02f +
                    model.transform.forward * (.31f + .035f * breath));
            }
            try
            {
                for (int frame = 0; frame <= fps * seconds; frame++)
                {
                    foreach (var pair in bones) pair.Value.localRotation = rest[pair.Key];
                    float time = frame / (float)fps;
                    float phase = 2 * Mathf.PI * time / seconds;
                    float breath = .5f - .5f * Mathf.Cos(phase);
                    // The gaze leads the head during an off-camera glance, then returns to camera.
                    float glance = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(.55f, .93f, time)) *
                        (1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(2.15f, 2.58f, time)));
                    float headTurn = .5f - .5f * Mathf.Cos(phase);
                    Turn(HumanBodyBones.Spine, model.transform.right, -.85f * breath);
                    Turn(HumanBodyBones.Chest, model.transform.right, -1.35f * breath);
                    Turn(HumanBodyBones.Neck, model.transform.up, 3f * headTurn);
                    Turn(HumanBodyBones.Head, model.transform.up, 4.5f * headTurn);
                    Turn(HumanBodyBones.Head, model.transform.forward, -1.3f * breath);
                    Turn(HumanBodyBones.LeftEye, model.transform.up, 5.5f * glance);
                    Turn(HumanBodyBones.RightEye, model.transform.up, 5.5f * glance);
                    float left = Mathf.Sign(Vector3.Dot(bones[HumanBodyBones.LeftUpperArm].position - hips.position,
                        model.transform.right));
                    Arm(HumanBodyBones.LeftUpperArm, HumanBodyBones.LeftLowerArm, HumanBodyBones.LeftHand, left, breath);
                    Arm(HumanBodyBones.RightUpperArm, HumanBodyBones.RightLowerArm, HumanBodyBones.RightHand, -left, breath);
                    foreach (var pair in bones)
                    {
                        Quaternion rot = pair.Value.localRotation;
                        for (int component = 0; component < 4; component++)
                            curves[pair.Key][component].AddKey(time, rot[component]);
                    }
                }
            }
            finally { foreach (var pair in bones) pair.Value.localRotation = rest[pair.Key]; }
            foreach (var pair in bones)
            {
                string path = AnimationUtility.CalculateTransformPath(pair.Value, model.transform);
                for (int axis = 0; axis < 4; axis++)
                    clip.SetCurve(path, typeof(Transform), "m_LocalRotation." + "xyzw"[axis], curves[pair.Key][axis]);
            }
            // Explicit hips translation gives both sides of the walk transition the same channel set.
            for (int axis = 0; axis < 3; axis++)
                clip.SetCurve(AnimationUtility.CalculateTransformPath(hips, model.transform), typeof(Transform),
                    "m_LocalPosition." + "xyz"[axis], AnimationCurve.Constant(0, seconds, hips.localPosition[axis]));
            clip.EnsureQuaternionContinuity();
            return clip;
        }
    }
}
