# Unity developer blockout

Open this project with Unity 6000.3.14f1 and URP 17.3.0. The pinned
manifest uses Unity Test Framework 1.4.6. The Editor prepares URP settings,
a resource material and the scene build list on import. Review and commit
the Editor-resolved Packages/packages-lock.json and generated settings after
the first licensed Editor import. Package resolution and C# compilation
remain pending until that import succeeds.

Open Assets/VirtualLife/Scenes/AuroraBlockout.unity and enter Play mode.
WASD moves the capsule. Approach the blue terminal and press E for the local
three-turn input rehearsal. The scene uses temporary developer primitives.
The client displays its offline mode. Native commands require the Rust
protocol integration tracked by VL-081.

## Linux validation

Set UNITY_EDITOR to the absolute executable path of the pinned, already
licensed Editor, then run from the repository root.

```sh
node scripts/unity-validate.mjs prepare
node scripts/unity-validate.mjs tests
node scripts/unity-validate.mjs linux
```

The runner writes batch logs and NUnit XML under ignored artifacts/unity/.
A missing Editor returns exit code 2 with MISSING_OPTIONAL_LOCAL_TOOLING.
Batch tests exercise rules, spawning, collision-controller movement and
interaction. Rendering and physical GPU performance require a separate
interactive player run.

CachyOS is a local compatibility trial. Unity lists Ubuntu 22.04 and 24.04
for supported Linux Editor workstations. A supported Ubuntu workstation
can run the same project and commands. Review license entitlement for the
person and runner before installing or activating an Editor.
[Unity system requirements](https://docs.unity3d.com/6000.3/Documentation/Manual/system-requirements.html)

## Windows qualification

```sh
node scripts/unity-validate.mjs windows-mono
```

This attempts a Windows Mono development build when the Editor has the
Windows Build Support module. The build method checks module support and
fails when it is absent. The pinned Editor release lists that module for
Linux. Test the resulting player on physical Windows hardware.
[Editor and module downloads](https://unity.com/releases/editor/whats-new/6000.3.14f1)

Windows IL2CPP requires the Windows build environment, C++ tools and Windows
SDK. Record signing, install/update, input, graphics and crash acceptance
with build hashes on the related Windows tasks.
[Windows build requirements](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/windows/requirements-and-compatibility)
