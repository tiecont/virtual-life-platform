using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Authored cinematic framing for a world scene. A static framing keeps the
    // board, Pet, enemy and portals readable without camera motion, and remains
    // deterministic for rendered evidence.
    [RequireComponent(typeof(Camera))]
    public sealed class WorldCameraRig : MonoBehaviour
    {
        [SerializeField] private float fieldOfView = 45f;
        private Camera cameraComponent;

        public Camera Camera => cameraComponent != null ? cameraComponent : cameraComponent = GetComponent<Camera>();
        public float FieldOfView => fieldOfView;

        public void Configure(Vector3 position, Vector3 target, float fov, Color background)
        {
            var camera = Camera;
            transform.position = position;
            transform.LookAt(target);
            fieldOfView = fov;
            camera.fieldOfView = fov;
            camera.nearClipPlane = .3f;
            camera.farClipPlane = 260f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = background;
            camera.allowHDR = true;
            camera.allowMSAA = true;
        }

        private void Awake()
        {
            cameraComponent = GetComponent<Camera>();
            cameraComponent.tag = "MainCamera";
        }
    }
}
