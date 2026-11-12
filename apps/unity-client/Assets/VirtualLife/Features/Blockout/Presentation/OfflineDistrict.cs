using UnityEngine;

namespace VirtualLife.Blockout
{
    public sealed class OfflineDistrict : MonoBehaviour
    {
        public CharacterController Player { get; private set; }
        public Transform Activity { get; private set; }
        public System.Action NativeInteraction { get; set; }
        public bool InputCaptured { get; set; }
        public int RehearsalTurns { get; private set; }
        private string feedback = "WASD to walk. Approach the blue terminal and press E.";

        private void Awake()
        {
            var colors = new[] {new Color(0.45f, 0.5f, 0.46f), new Color(0.65f, 0.55f, 0.4f), new Color(0.6f, 0.3f, 0.65f), new Color(0.2f, 0.5f, 0.85f)};
            for (var index = 0; index < BlockoutGeometry.Boxes.Count; index++) {
                var box = BlockoutGeometry.Boxes[index];
                var created = CreateBox(box.Name, new Vector3(box.X, box.Y, box.Z), new Vector3(box.Width, box.Height, box.Depth), colors[index]);
                if (box.Name == "Activity terminal") Activity = created.transform;
            }
            var avatar = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            avatar.name = "Developer capsule";
            var spawn = BlockoutGeometry.Anchors[0];
            avatar.transform.position = new Vector3(spawn.X, 1.1f, spawn.Z);
            ApplyDeveloperMaterial(avatar, new Color(0.8f, 0.85f, 0.9f));
            Destroy(avatar.GetComponent<CapsuleCollider>());
            Player = avatar.AddComponent<CharacterController>();
            Player.height = 2f;
            Player.radius = 0.4f;

            var camera = new GameObject("District camera").AddComponent<Camera>();
            camera.transform.position = new Vector3(0f, 22f, -24f);
            camera.transform.LookAt(Vector3.zero);
            camera.tag = "MainCamera";
            var light = new GameObject("Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        private static GameObject CreateBox(string label, Vector3 position, Vector3 scale, Color color)
        {
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = label;
            box.transform.position = position;
            box.transform.localScale = scale;
            ApplyDeveloperMaterial(box, color);
            return box;
        }

        private static void ApplyDeveloperMaterial(GameObject primitive, Color color)
        {
            var renderer = primitive.GetComponent<Renderer>();
            renderer.sharedMaterial = Resources.Load<Material>("BlockoutLit");
            var properties = new MaterialPropertyBlock();
            properties.SetColor("_BaseColor", color);
            renderer.SetPropertyBlock(properties);
        }

        private void Update()
        {
            if (InputCaptured) return;
            var direction = Vector3.zero;
            if (Input.GetKey(KeyCode.W)) direction.z += 1;
            if (Input.GetKey(KeyCode.S)) direction.z -= 1;
            if (Input.GetKey(KeyCode.A)) direction.x -= 1;
            if (Input.GetKey(KeyCode.D)) direction.x += 1;
            Move(direction, Time.deltaTime);
            if (Input.GetKeyDown(KeyCode.E)) TryInteract();
        }

        public void Move(Vector3 direction, float deltaSeconds)
        {
            var step = Vector3.ClampMagnitude(direction, 1f) * District.WalkSpeed * Mathf.Clamp(deltaSeconds, 0f, 0.1f);
            var position = Player.transform.position;
            step.x = District.Clamp(position.x + step.x) - position.x;
            step.z = District.Clamp(position.z + step.z) - position.z;
            step.y = -2f * Mathf.Clamp(deltaSeconds, 0f, 0.1f);
            Player.Move(step);
        }

        public bool TryInteract()
        {
            var position = Player.transform.position;
            if (!District.CanInteract(position.x, position.z, Activity.position.x, Activity.position.z))
            {
                feedback = "Move closer to the terminal.";
                return false;
            }
            if (NativeInteraction != null) {
                NativeInteraction(); feedback = "Native terminal selected. See the connection panel."; return true;
            }
            RehearsalTurns = (RehearsalTurns + 1) % 4;
            feedback = RehearsalTurns == 3 ? "Offline rehearsal complete." : "Offline rehearsal turn " + RehearsalTurns + "/3";
            return true;
        }

        private void OnGUI()
        {
            GUI.Box(new Rect(16, 16, 470, 70), NativeInteraction == null ? "Aurora Plaza — offline developer blockout" : "Aurora Plaza — native developer blockout");
            GUI.Label(new Rect(28, 45, 450, 35), feedback);
        }

        private void OnDestroy()
        {
            if (Player != null) Destroy(Player.gameObject);
            if (Activity != null) Destroy(Activity.gameObject);
        }
    }
}
