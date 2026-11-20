using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.IcarusPrototype
{
    internal enum Cue { Summon, Normal, Rage, Signature }

    internal sealed class IcarusEffects
    {
        private readonly MeshRenderer ring;
        private readonly ParticleSystem sparks;
        private readonly TrailRenderer trail;
        private readonly MaterialPropertyBlock tint = new MaterialPropertyBlock();
        private static readonly int Tint = Shader.PropertyToID("_Tint");
        private Vector3 origin, target, previous;
        private float elapsed;
        private bool running, impacted;
        private MotionMode mode;
        private Timing timing;

        private readonly struct Timing
        {
            internal readonly float Windup, Flight, Recovery, Height, Radius;
            internal readonly int Count;
            internal readonly Color Color;

            internal Timing(float windup, float flight, float recovery, float height, float radius, int count, Color color)
            {
                Windup = windup;
                Flight = flight;
                Recovery = recovery;
                Height = height;
                Radius = radius;
                Count = count;
                Color = color;
            }
        }

        internal IcarusEffects(Transform parent, PreviewMeshes meshes)
        {
            ring = meshes.Surface(parent, "Charge and impact ring", meshes.Material("Solar ring", Color.white, 1), 4, out var quad);
            PreviewMeshes.PaintQuad(quad, Vector3.zero, .5f);

            var emitter = new GameObject("Embers", typeof(ParticleSystem));
            emitter.transform.SetParent(parent, false);
            sparks = emitter.GetComponent<ParticleSystem>();
            sparks.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = sparks.main;
            main.playOnAwake = false;
            main.loop = true;
            main.maxParticles = 64;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.useUnscaledTime = true;
            main.gravityModifier = .48f;
            var emission = sparks.emission;
            emission.enabled = false;
            var fade = sparks.colorOverLifetime;
            fade.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(.75f, .45f), new GradientAlphaKey(0, 1) });
            fade.color = gradient;
            var particleRenderer = emitter.GetComponent<ParticleSystemRenderer>();
            particleRenderer.renderMode = ParticleSystemRenderMode.Billboard;
            particleRenderer.SetActiveVertexStreams(new List<ParticleSystemVertexStream> {
                ParticleSystemVertexStream.Position, ParticleSystemVertexStream.Color, ParticleSystemVertexStream.UV
            });
            particleRenderer.sharedMaterial = meshes.Material("Ember billboard", Color.white, 0);
            particleRenderer.shadowCastingMode = ShadowCastingMode.Off;
            particleRenderer.sortingOrder = 6;

            var ribbon = new GameObject("Arrow trail", typeof(TrailRenderer));
            ribbon.transform.SetParent(parent, false);
            trail = ribbon.GetComponent<TrailRenderer>();
            trail.sharedMaterial = meshes.Material("Bow trail strip", Color.white, 2);
            trail.emitting = false;
            trail.time = .21f;
            trail.textureMode = LineTextureMode.Stretch;
            trail.widthCurve = AnimationCurve.Linear(0, 1, 1, 0);
            trail.numCapVertices = 2;
            trail.shadowCastingMode = ShadowCastingMode.Off;
            trail.sortingOrder = 5;
            Stop();
        }

        internal void Play(Cue cue, MotionMode motion, Vector3 bow, Vector3 ground, Vector3 destination)
        {
            Stop();
            if (motion == MotionMode.Off) return;
            mode = motion;
            timing = cue switch
            {
                Cue.Summon => new Timing(.50f, 0, .70f, 0, 2.6f, 28, new Color(1, .78f, .38f)),
                Cue.Normal => new Timing(.16f, .26f, .25f, .45f, .95f, 12, new Color(1, .75f, .40f)),
                Cue.Rage => new Timing(.28f, .34f, .52f, 1.3f, 2.3f, 32, new Color(1, .42f, .23f)),
                _ => new Timing(.46f, .38f, .65f, 1.8f, 3.0f, 44, new Color(1, .59f, .26f))
            };
            origin = cue == Cue.Summon ? ground : bow;
            target = cue == Cue.Summon ? ground : destination;
            previous = origin;
            elapsed = 0;
            impacted = false;
            running = true;
            trail.widthMultiplier = cue == Cue.Signature ? .26f : .15f;
            trail.startColor = timing.Color;
            trail.endColor = new Color(timing.Color.r, timing.Color.g, timing.Color.b, 0);
            sparks.Play();
            Tick(0);
        }

        internal void Tick(float delta)
        {
            if (!running) return;
            elapsed += delta;
            bool fullMotion = mode == MotionMode.Normal;
            float impact = timing.Windup + timing.Flight;
            if (fullMotion && timing.Flight > 0 && elapsed >= timing.Windup && !impacted)
            {
                if (!trail.enabled)
                {
                    trail.enabled = true;
                    trail.AddPosition(origin);
                }
                float u = Mathf.Clamp01((elapsed - timing.Windup) / timing.Flight);
                var point = Vector3.Lerp(origin, target + Vector3.up * .15f, u)
                    + Vector3.up * (4 * u * (1 - u) * timing.Height);
                if ((point - previous).sqrMagnitude > .0001f)
                {
                    trail.AddPosition(point);
                    previous = point;
                }
            }
            if (elapsed < timing.Windup)
            {
                float charge = elapsed / timing.Windup;
                DrawRing(origin + Vector3.up * .04f, fullMotion ? .45f + charge * timing.Radius : .95f,
                    fullMotion ? .45f + charge * .30f : .47f);
            }
            else if (elapsed < impact)
                ring.enabled = false;
            else
            {
                if (!impacted)
                {
                    Burst(fullMotion);
                    impacted = true;
                }
                float decay = (elapsed - impact) / timing.Recovery;
                if (decay < 1)
                    DrawRing(target + Vector3.up * .05f, fullMotion ? timing.Radius * (.65f + .50f * decay) : .95f,
                        (fullMotion ? .72f : .51f) * (1 - decay));
                else
                    ring.enabled = false;
                if (elapsed >= impact + Mathf.Max(timing.Recovery, .72f)) Stop();
            }
        }

        private void DrawRing(Vector3 center, float diameter, float alpha)
        {
            ring.enabled = true;
            ring.transform.localPosition = center;
            ring.transform.localScale = new Vector3(diameter, 1, diameter);
            var color = timing.Color;
            color.a = alpha;
            tint.SetColor(Tint, color);
            ring.SetPropertyBlock(tint);
        }

        private void Burst(bool fullMotion)
        {
            int count = fullMotion ? timing.Count : 4;
            for (int i = 0; i < count; i++)
            {
                float angle = i * 2.399963f;
                var radial = new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle));
                var grain = new ParticleSystem.EmitParams {
                    position = target + Vector3.up * .20f + radial * (.08f + (i % 4) * .10f),
                    velocity = (radial * (1.4f + (i % 5) * .25f) + Vector3.up * (1.2f + (i % 7) * .23f))
                        * (fullMotion ? 1 : .13f),
                    startColor = timing.Color, startSize = .08f + (i % 3) * .04f,
                    startLifetime = (fullMotion ? .42f : .28f) + (i % 4) * .07f
                };
                sparks.Emit(grain, 1);
            }
        }

        internal void Stop()
        {
            running = false;
            ring.enabled = false;
            trail.Clear();
            trail.enabled = false;
            sparks.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        }
    }
}
