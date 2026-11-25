using System;
using Aetheria.Networking;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Scene adapter for the cooperative HUD. A lobby supplies the admitted
    // CoopNativePlaySession; this component renders only committed projections
    // and forwards intents. It never computes damage, rewards or turn order.
    [RequireComponent(typeof(UIDocument))]
    public sealed class CoopNativeHud : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        private CoopNativePlaySession session;
        private int selected = -1;
        private ulong renderedVersion = ulong.MaxValue;

        // Scene bootstrap may create the component before assigning the document.
        public void Attach(UIDocument target) { document = target; }

        public void Bind(CoopNativePlaySession admitted)
        {
            session = admitted;
            selected = -1;
            renderedVersion = ulong.MaxValue;
            Refresh();
        }

        private void Update()
        {
            var view = session?.State?.Coop;
            if (view == null || view.Version == renderedVersion) return;
            renderedVersion = view.Version;
            Render(view);
        }

        private void Refresh()
        {
            var view = session?.State?.Coop;
            if (view == null) return;
            renderedVersion = view.Version;
            Render(view);
        }

        public void Render(CoopNativeView view)
        {
            if (view == null) return;
            var target = document != null ? document.rootVisualElement : null;
            if (target == null) return;
            target.Clear();
            target.Add(CoopNativePresentation.Build(view, Select, Cast));
            if (session != null && session.NeedsRefresh)
            {
                var reconnect = new Button(() => _ = ReconnectAsync()) { text = "Reconnect", name = "coop-reconnect" };
                target.Add(reconnect);
            }
            if (session != null && session.HasPendingCommand)
            {
                var retry = new Button(() => _ = RetryAsync()) { text = "Retry pending command", name = "coop-retry" };
                target.Add(retry);
            }
        }

        private async System.Threading.Tasks.Task ReconnectAsync()
        {
            try { if (session != null) await session.ReconnectAsync(); }
            catch (NativeFailure failure) { Debug.LogWarning("Coop reconnect failed: " + failure.Reason); }
            finally { Refresh(); }
        }

        private async System.Threading.Tasks.Task RetryAsync()
        {
            try { if (session != null) await session.RetryAsync(); }
            catch (NativeFailure failure) { Debug.LogWarning("Coop retry failed: " + failure.Reason); }
            finally { Refresh(); }
        }

        private void Select(int cell)
        {
            var view = session?.State?.Coop;
            if (view == null || view.Terminal || !CoopNativePresenter.CanAct(view)) return;
            if (selected < 0)
            {
                selected = cell;
                Render(view);
                return;
            }
            if (selected == cell) { selected = -1; Render(view); return; }
            if (!view.CanSwap(selected, cell))
            {
                selected = cell;
                Render(view);
                return;
            }
            var first = selected;
            selected = -1;
            _ = SwapAsync(first, cell);
        }

        private async System.Threading.Tasks.Task SwapAsync(int first, int second)
        {
            try { if (session != null) await session.SwapAsync(first, second); }
            catch (NativeFailure failure) { Debug.LogWarning("Coop swap rejected: " + failure.Reason); }
            finally { Refresh(); }
        }

        private async void Cast(string kind)
        {
            var current = session;
            if (current == null) return;
            try
            {
                switch (kind)
                {
                    case "guard": await current.GuardAsync(); break;
                    case "skill": await current.SkillAsync(); break;
                    case "signature": await current.SignatureAsync(); break;
                    case "ultimate": await current.UltimateAsync(); break;
                }
            }
            catch (NativeFailure failure) { Debug.LogWarning("Coop action rejected: " + failure.Reason); }
            finally { Refresh(); }
        }
    }
}
