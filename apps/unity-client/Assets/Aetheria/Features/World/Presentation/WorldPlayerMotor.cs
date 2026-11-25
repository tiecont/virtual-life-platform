using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Local, offline developer locomotion for the hub and arena compositions.
    // The authoritative Rust movement path is untouched; this motor is bounded
    // to the authored walkable rectangle and only drives presentation scenes.
    [RequireComponent(typeof(CharacterController))]
    public sealed class WorldPlayerMotor : MonoBehaviour
    {
        [SerializeField] private float walkSpeed = 4.2f;
        [SerializeField] private Vector3 walkableMin = new Vector3(-13.2f, 0f, -13.2f);
        [SerializeField] private Vector3 walkableMax = new Vector3(13.2f, 6f, 13.2f);
        [SerializeField] private bool inputEnabled = true;

        private CharacterController controller;
        private float verticalVelocity = -2f;

        public CharacterController Controller => controller;
        public bool MovementLocked { get; set; }
        public Vector3 WalkableMin => walkableMin;
        public Vector3 WalkableMax => walkableMax;
        public bool InputEnabled
        {
            get => inputEnabled;
            set => inputEnabled = value;
        }

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
        }

        public void ConfigureBounds(Vector3 minimum, Vector3 maximum)
        {
            walkableMin = minimum;
            walkableMax = maximum;
        }

        public void ConfigureSpeed(float speed)
        {
            walkSpeed = Mathf.Clamp(speed, .5f, 12f);
        }

        private void Update()
        {
            if (MovementLocked || !inputEnabled) return;
            var direction = Vector3.zero;
            if (Input.GetKey(KeyCode.W)) direction.z += 1f;
            if (Input.GetKey(KeyCode.S)) direction.z -= 1f;
            if (Input.GetKey(KeyCode.A)) direction.x -= 1f;
            if (Input.GetKey(KeyCode.D)) direction.x += 1f;
            Move(direction, Time.deltaTime);
        }

        public void Move(Vector3 direction, float deltaSeconds)
        {
            if (controller == null) controller = GetComponent<CharacterController>();
            var delta = Mathf.Clamp(deltaSeconds, 0f, .1f);
            var planar = Vector3.ClampMagnitude(new Vector3(direction.x, 0f, direction.z), 1f);
            var position = transform.position;
            var step = planar * walkSpeed * delta;
            step.x = Mathf.Clamp(position.x + step.x, walkableMin.x, walkableMax.x) - position.x;
            step.z = Mathf.Clamp(position.z + step.z, walkableMin.z, walkableMax.z) - position.z;
            verticalVelocity = controller.isGrounded ? -2f : verticalVelocity - 22f * delta;
            step.y = verticalVelocity * delta;
            controller.Move(step);
        }

        public void Teleport(Vector3 position, float yaw)
        {
            if (controller == null) controller = GetComponent<CharacterController>();
            var enabledState = controller.enabled;
            controller.enabled = false;
            transform.position = position;
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            controller.enabled = enabledState;
            verticalVelocity = -2f;
        }
    }
}
