using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Small, readable developer HUD shared by the hub and arenas. It exposes
    // the content stage, the nearest portal and the reduced-motion switch.
    public sealed class WorldHud : MonoBehaviour
    {
        [SerializeField] private WorldSceneControllerBase controller;

        private GUIStyle titleStyle;
        private GUIStyle bodyStyle;

        public void Bind(WorldSceneControllerBase value) => controller = value;

        private void EnsureController()
        {
            if (controller == null) controller = GetComponent<WorldSceneControllerBase>();
        }

        private void OnGUI()
        {
            EnsureController();
            if (controller == null) return;
            if (titleStyle == null)
            {
                titleStyle = new GUIStyle(GUI.skin.label)
                {
                    fontSize = 17,
                    fontStyle = FontStyle.Bold,
                    normal = { textColor = new Color(1f, .88f, .62f) }
                };
                bodyStyle = new GUIStyle(GUI.skin.label) { fontSize = 13, wordWrap = true };
            }
            GUI.Box(new Rect(16f, 16f, 610f, 116f), GUIContent.none);
            var title = controller.HudTitle;
            if (controller.Identity != null) title += "  [" + controller.Identity.ContentStage + "]";
            GUI.Label(new Rect(30f, 22f, 580f, 24f), title, titleStyle);
            GUI.Label(new Rect(30f, 48f, 580f, 40f), controller.Feedback, bodyStyle);
            var portal = controller.FindPortalInRange();
            GUI.Label(new Rect(30f, 94f, 400f, 22f),
                portal != null
                    ? "E: " + portal.Label + " [" + portal.Status + "]"
                    : "WASD walk / E portal / M ambience", bodyStyle);
            if (GUI.Button(new Rect(452f, 92f, 158f, 26f),
                    controller.ReducedMotion ? "Motion: reduced" : "Motion: full"))
                controller.SetReducedMotion(!controller.ReducedMotion);
        }
    }
}
