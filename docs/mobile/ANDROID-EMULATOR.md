# Isolated Android Emulator development

Owner authorized a local emulator. [Pinned configuration](ANDROID-EMULATOR.json) uses Emulator37.2.13, Google APIs Android35 x86_64revision9,4cores/2048MiB/2GiB data and an explicit private AVD/port5580. Existing JDK21/SDK preparation is reused; environment overrides `ANDROID_SDK_ROOT` and `JAVA_HOME` support another reviewed installation. Start refuses wrong versions, insufficient free RAM/disk or an occupied emulator serial. SDK installation is a separate explicit step; start does not silently download or upgrade it.

Implemented commands (actual results belong in task evidence):

```sh
pnpm mobile:emulator:start
pnpm mobile:emulator:smoke --apk artifacts/mobile-android-build-6fea6009/app-debug.apk
pnpm mobile:emulator:status
pnpm mobile:emulator:stop
```

The example APK is the preserved N06-08 logged-out landscape preview, not3D or authenticated gameplay. For later work build a new DEBUG APK and select its exact preserved path/hash; never label the old bundle as the new renderer. Smoke defaults to the local Gradle debug output only if that file exists. It accepts only local repository artifact/debug-output APKs.

Start creates only `vlp_n10_05_api35` under private artifacts, checks acceleration and waits at most180seconds for actual boot. It records the PID/start ticks/AVD/port and graphics/WebView diagnostics privately. The emulator process continues during active development until stopped; stop verifies the exact owned PID lifetime and arguments before targeting that emulator. It refuses unknown/reused PIDs, never chooses a USB phone, changes global host rotation or wipes a device. No promise of unattended work between agent turns is implied; the agent closes its instance after qualification.

Smoke verifies `ro.kernel.qemu=1` and the expected AVD name before installing a development APK. It checks installed hash, focused own-app accessibility controls, real emulated IME/touch-close, opposite landscape rotations, panel/fallback Back and Home/resume. Temporary UI dumps are removed. Own app screenshots/raw logs remain private; keys, tokens, AVD userdata and owner USB identity are excluded from repository evidence. Physical-only scripts still require an actual authorized USB device and cannot silently fall back to this emulator.

[Android acceleration documentation](https://developer.android.com/studio/run/emulator-acceleration) distinguishes CPU/KVM from graphics. Requested host GPU mode is not proof of the renderer actually used; read its diagnostics. Software GPU, virtualization timing and emulated sensors cannot establish real-phone frame-time/thermal/battery/energy or support-floor coverage. No iOS Simulator is supplied on Linux. N10-04 physical30minute gameplay and N14 Mac/Xcode/iPhone remain separate gates. Three-dimensional animals/fur/animation are N06-10/11/07/04/09 work; this emulator only provides an execution environment.
