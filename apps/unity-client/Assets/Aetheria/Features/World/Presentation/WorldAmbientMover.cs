using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Gentle, bounded ambient motion for modular kit pieces. It reads the
    // presentation-only reduced-motion switch and restores the authored pose
    // when motion is reduced.
    public sealed class WorldAmbientMover : MonoBehaviour
    {
        [SerializeField] private WorldAmbientMotion motion = WorldAmbientMotion.Bob;
        [SerializeField] private float amplitude = .5f;
        [SerializeField] private float speed = 1f;
        [SerializeField] private float phase;

        private Vector3 basePosition;
        private Quaternion baseRotation;
        private Vector3 baseScale;
        private bool cached;

        public WorldAmbientMotion Motion => motion;
        public float Amplitude => amplitude;
        public float Speed => speed;

        public void Configure(WorldAmbientMotion kind, float motionAmplitude, float motionSpeed, float motionPhase)
        {
            motion = kind;
            amplitude = motionAmplitude;
            speed = motionSpeed;
            phase = motionPhase;
            Cache();
            Apply(0f);
        }

        private void Awake() => Cache();

        private void Cache()
        {
            basePosition = transform.localPosition;
            baseRotation = transform.localRotation;
            baseScale = transform.localScale;
            cached = true;
        }

        private void Update()
        {
            if (!cached) Cache();
            if (WorldPresentationSettings.ReducedMotion)
            {
                Apply(0f);
                return;
            }
            Apply(Time.time);
        }

        private void Apply(float time)
        {
            switch (motion)
            {
                case WorldAmbientMotion.Rotate:
                    transform.localRotation = baseRotation * Quaternion.Euler(0f, time * speed, 0f);
                    break;
                case WorldAmbientMotion.Bob:
                    transform.localPosition = basePosition +
                        Vector3.up * (Mathf.Sin(time * speed + phase) * amplitude);
                    break;
                case WorldAmbientMotion.Sway:
                    transform.localRotation = baseRotation *
                        Quaternion.Euler(0f, 0f, Mathf.Sin(time * speed + phase) * amplitude);
                    break;
                case WorldAmbientMotion.Pulse:
                    var scale = 1f + Mathf.Sin(time * speed + phase) * amplitude;
                    transform.localScale = baseScale * scale;
                    break;
            }
        }
    }
}
