using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using VirtualLife.Networking;

namespace VirtualLife.NativeScene
{
    // Presentation only. Button presses create intents; no board/health/reward
    // is changed here. Letters and warning marks supplement tile colors.
    public sealed class PetArenaHud
    {
        private readonly PetArenaStage stage;
        private int selected = -1, hint = -1;
        private ulong version = ulong.MaxValue;
        private string notice = "";
        public bool ReducedMotion { get; private set; } = true;
        private static readonly string[] PetNames = {"Cinder", "Brook", "Briar", "Volt", "Kiln", "Mist", "Fern", "Prism"};
        private static readonly string[] SkillNames = {"Strike", "Mend", "Poison", "Empower", "Guard", "Slow", "Cleanse", "Break guard"};
        private static readonly string[] Tiles = {"E", "T", "G", "S"};
        private static readonly Color[] Colors = {new Color(1f, .65f, .36f), new Color(.45f, .8f, 1f), new Color(.58f, .9f, .55f), new Color(1f, .9f, .4f)};
        public PetArenaHud(PetArenaStage stage) { this.stage = stage; }
        public void Present(PlayState state)
        {
            if (state.Arena == null) return;
            if (version != state.Version) { selected = hint = -1; version = state.Version; }
            stage.Present(state.Arena, state.ReceiptId, ReducedMotion);
        }
        public void Clear() { selected = hint = -1; version = ulong.MaxValue; stage.Clear(); }
        public void Draw(PetArenaView view, bool open, bool canAct, PetArenaPlaySession session,
            Action<Func<CancellationToken, Task<PlayState>>> run, Action close)
        {
            var wrapped = new GUIStyle(GUI.skin.label) { wordWrap = true, fontSize = 15 };
            GUI.Box(new Rect(16, 386, 610, 160), "Pet District");
            GUI.Label(new Rect(28, 412, 570, 42), "Cinder / Ember     Brook / Tide     Briar / Grove", wrapped);
            var reduced = GUI.Toggle(new Rect(28, 470, 360, 26), ReducedMotion, "Reduced motion");
            if (reduced != ReducedMotion) { ReducedMotion = reduced; stage.SetReducedMotion(reduced); }
            GUI.Label(new Rect(28, 502, 570, 28), open ? "Training PvE" : "Aurora Plaza", wrapped);
            if (!open) return;
            GUI.Box(new Rect(638, 100, 370, 642), "PET ARENA / Training PvE");
            if (view == null) { GUI.Label(new Rect(658, 142, 330, 50), "Connect to read your authorized battle state.", wrapped); return; }
            GUI.Label(new Rect(658, 134, 330, 24), PetNames[view.Pet] + "  /  Stage " + (view.Stage + 1) + "  /  Turn " + view.Turn);
            GUI.Label(new Rect(658, 162, 330, 24), "HP " + Hp(view.Health) + "  + shield " + Hp(view.Shield) + "    Enemy " + Hp(view.EnemyHealth));
            GUI.Label(new Rect(658, 190, 330, 28), view.Terminal ? (view.Phase == "won" ? "VICTORY" : "TRAINING ENDED") + " / " + view.Reward :
                view.Phase == "ready" ? "Ready" : "Warning !  " + new[] {"Row", "Column", "Cross"}[view.WarningPattern] + " / Turn " + view.ResolvesTurn, wrapped);
            GUI.Label(new Rect(658, 224, 330, 35), "E Ember / T Tide / G Grove / S Spark\n" + notice, new GUIStyle(wrapped) { fontSize = 12 });
            var enabled = GUI.enabled;
            GUI.enabled = canAct && view.Phase == "playing";
            var tileStyle = new GUIStyle(GUI.skin.button) { fontSize = 19, fontStyle = FontStyle.Bold };
            tileStyle.normal.background = tileStyle.hover.background = tileStyle.active.background = null;
            tileStyle.normal.textColor = tileStyle.hover.textColor = tileStyle.active.textColor = Color.black;
            for (var cell = 0; cell < 36; cell++) {
                var warn = false; foreach (var at in view.WarningCells) if (at == cell) warn = true;
                var rect = new Rect(660 + cell % 6 * 52, 270 + cell / 6 * 52, 48, 48);
                var old = GUI.color; GUI.color = cell == selected || cell == hint ? Color.cyan : warn ? new Color(1f, .3f, .15f) : Color.black;
                GUI.DrawTexture(rect, Texture2D.whiteTexture); GUI.color = Colors[view.Board[cell]];
                GUI.DrawTexture(new Rect(rect.x + 3, rect.y + 3, rect.width - 6, rect.height - 6), Texture2D.whiteTexture); GUI.color = old;
                if (GUI.Button(rect, (warn ? "!" : "") + Tiles[view.Board[cell]], tileStyle)) {
                    if (selected < 0) { selected = cell; hint = -1; }
                    else if (view.CanSwap(selected, cell)) {
                        var first = selected; var second = cell; selected = hint = -1;
                        run(token => session.SwapAsync(first, second, token));
                    } else { selected = cell; hint = -1; notice = "Invalid swap"; }
                }
            }
            GUI.enabled = canAct && view.Phase == "ready";
            if (view.Phase == "ready" && GUI.Button(new Rect(660, 594, 308, 30), "Start training")) run(session.AdvanceAsync);
            GUI.enabled = canAct && view.Phase == "playing" && view.Cooldown == 0;
            if (view.Phase != "ready" && GUI.Button(new Rect(660, 594, 148, 30), SkillNames[view.Pet] + "  [" + view.Cooldown + "]")) run(session.SkillAsync);
            GUI.enabled = canAct && view.Phase == "playing";
            if (view.Phase != "ready" && GUI.Button(new Rect(820, 594, 148, 30), "Pass turn")) run(session.PassAsync);
            if (GUI.Button(new Rect(660, 634, 148, 28), "Hint") && view.Hint(out var firstHint, out var secondHint)) { selected = firstHint; hint = secondHint; notice = "Legal swap selected"; }
            GUI.enabled = enabled;
            if (GUI.Button(new Rect(820, 634, 148, 28), "Return to plaza")) close();
            GUI.Label(new Rect(658, 676, 330, 54), "Your status: " + string.Join(", ", view.PlayerStatuses) + "\nEnemy status: " + string.Join(", ", view.EnemyStatuses), new GUIStyle(wrapped) { fontSize = 12 });
        }
        private static string Hp(int value) => (value / 1000f).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
    }
}
