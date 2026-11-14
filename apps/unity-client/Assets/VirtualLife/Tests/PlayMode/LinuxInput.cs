using System;
using System.Collections;
using System.Runtime.InteropServices;
using NUnit.Framework;
using UnityEngine;

namespace VirtualLife.Blockout.Tests
{
    // Test-player only: XTest sends OS events to this process's XWayland window.
    // Neither scene methods nor adapters are invoked to simulate user input.
    internal sealed class LinuxInput : IDisposable
    {
        private readonly IntPtr display;
        private readonly UIntPtr window;
        private readonly UIntPtr root;
        private readonly float scale;
        public LinuxInput(int logicalWidth = 650, int logicalHeight = 390)
        {
            scale = Mathf.Min(1f, Screen.width / (float)logicalWidth, Screen.height / (float)logicalHeight);
            display = XOpenDisplay(IntPtr.Zero);
            Assert.That(display, Is.Not.EqualTo(IntPtr.Zero), "An X11/XWayland display is required");
            root = XDefaultRootWindow(display);
            window = Find(root, XInternAtom(display, "_NET_WM_PID", false));
            Assert.That(window, Is.Not.EqualTo(UIntPtr.Zero), "Find this Linux test player's own window");
            XRaiseWindow(display, window); XSetInputFocus(display, window, 2, UIntPtr.Zero); XSync(display, false);
        }
        private UIntPtr Find(UIntPtr parent, UIntPtr pidAtom)
        {
            if (XGetWindowProperty(display, parent, pidAtom, IntPtr.Zero, new IntPtr(1), false, new UIntPtr(6),
                out _, out var format, out var count, out _, out var data) == 0 && data != IntPtr.Zero) {
                var own = format == 32 && count.ToUInt64() == 1 && Marshal.ReadIntPtr(data).ToInt64() == System.Diagnostics.Process.GetCurrentProcess().Id;
                XFree(data); if (own) return parent;
            }
            if (XQueryTree(display, parent, out _, out _, out var children, out var length) == 0) return UIntPtr.Zero;
            try {
                for (var at = 0; at < length; at++) {
                    var child = new UIntPtr(unchecked((ulong)Marshal.ReadIntPtr(children, at * IntPtr.Size).ToInt64()));
                    var found = Find(child, pidAtom); if (found != UIntPtr.Zero) return found;
                }
            } finally { if (children != IntPtr.Zero) XFree(children); }
            return UIntPtr.Zero;
        }
        public IEnumerator Click(int x, int y)
        {
            x = Mathf.RoundToInt(x * scale); y = Mathf.RoundToInt(y * scale);
            Assert.That(XTranslateCoordinates(display, window, root, x, y, out var rx, out var ry, out _), Is.Not.EqualTo(0));
            XTestFakeMotionEvent(display, -1, rx, ry, UIntPtr.Zero);
            XTestFakeButtonEvent(display, 1, true, UIntPtr.Zero); XSync(display, false);
            yield return new WaitForSecondsRealtime(0.08f);
            XTestFakeButtonEvent(display, 1, false, UIntPtr.Zero); XSync(display, false);
            yield return new WaitForSecondsRealtime(0.08f);
        }
        public void Key(string key, bool down)
        {
            var code = XKeysymToKeycode(display, XStringToKeysym(key));
            Assert.That(code, Is.Not.EqualTo(0), "Key must exist in the active keyboard map");
            XTestFakeKeyEvent(display, code, down, UIntPtr.Zero); XSync(display, false);
        }
        public IEnumerator Type(string value)
        {
            foreach (var character in value) {
                var shifted = character == '_';
                if (shifted) { Key("Shift_L", true); yield return new WaitForSecondsRealtime(0.08f); }
                var name = shifted ? "minus" : character.ToString();
                Key(name, true); yield return new WaitForSecondsRealtime(0.08f);
                Key(name, false); if (shifted) Key("Shift_L", false);
                yield return new WaitForSecondsRealtime(0.08f);
            }
        }
        public void Dispose()
        {
            foreach (var key in new[] {"w", "a", "s", "d", "e", "Shift_L", "Control_L"}) Key(key, false);
            XCloseDisplay(display);
        }
        [DllImport("libX11.so.6")] private static extern IntPtr XOpenDisplay(IntPtr name);
        [DllImport("libX11.so.6")] private static extern int XCloseDisplay(IntPtr display);
        [DllImport("libX11.so.6")] private static extern UIntPtr XDefaultRootWindow(IntPtr display);
        [DllImport("libX11.so.6")] private static extern UIntPtr XInternAtom(IntPtr display, string name, bool only);
        [DllImport("libX11.so.6")] private static extern int XGetWindowProperty(IntPtr display, UIntPtr window, UIntPtr property, IntPtr offset, IntPtr length, bool delete, UIntPtr type, out UIntPtr actual, out int format, out UIntPtr count, out UIntPtr remaining, out IntPtr data);
        [DllImport("libX11.so.6")] private static extern int XQueryTree(IntPtr display, UIntPtr window, out UIntPtr root, out UIntPtr parent, out IntPtr children, out int count);
        [DllImport("libX11.so.6")] private static extern int XFree(IntPtr data);
        [DllImport("libX11.so.6")] private static extern int XRaiseWindow(IntPtr display, UIntPtr window);
        [DllImport("libX11.so.6")] private static extern int XSetInputFocus(IntPtr display, UIntPtr window, int revert, UIntPtr time);
        [DllImport("libX11.so.6")] private static extern int XSync(IntPtr display, bool discard);
        [DllImport("libX11.so.6")] private static extern int XTranslateCoordinates(IntPtr display, UIntPtr source, UIntPtr destination, int x, int y, out int dx, out int dy, out UIntPtr child);
        [DllImport("libX11.so.6")] private static extern UIntPtr XStringToKeysym(string name);
        [DllImport("libX11.so.6")] private static extern byte XKeysymToKeycode(IntPtr display, UIntPtr keysym);
        [DllImport("libXtst.so.6")] private static extern int XTestFakeKeyEvent(IntPtr display, uint code, bool down, UIntPtr delay);
        [DllImport("libXtst.so.6")] private static extern int XTestFakeButtonEvent(IntPtr display, uint button, bool down, UIntPtr delay);
        [DllImport("libXtst.so.6")] private static extern int XTestFakeMotionEvent(IntPtr display, int screen, int x, int y, UIntPtr delay);
    }
}
