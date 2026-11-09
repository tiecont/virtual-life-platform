# ADR0140 — Declare the software compositor for browser measurements

Status: accepted for scoped browser measurement implementation;qualification requires actual runs. Date:2026-11-09.

The existing Chromium CPU4x/40ms/12Mbps Deadline/sandbox measurements fail on the default headless environment. Retain the original100ms p95 cap,>10samples,loading/bytes/cache/idle/remount/heap assertions and every historical failure. Changing a recording setting did not resolve the failure:predeclared standard/off/off/standard/no-capture runs all failed at133.4–150.1ms. Timeline observations locate2712.65ms in19 GLES2::ReadPixels calls during main-thread layer updates;CPU samples alone did not identify that cause.

The observed default backend is ANGLE/Vulkan SwiftShader with gpu_compositing=disabled_software. An empty-canvas diagnostic with explicit --enable-gpu/--use-angle=swiftshader retains the same SwiftShader renderer while enabling compositing. One subsequently declared diagnostic Deadline run observed100samples/p9516.8ms and passed all existing assertions. This single result is diagnostic,not qualification or a measured application speedup.

Move the two unchanged performance cases to dedicated worker-scoped specs in the rendering CI group;Playwright disallows launchOptions inside a describe. Only these two existing browser performance cases use the separately identified chromium-swiftshader-compositor-v1 measurement context. They assert the actual selected SwiftShader renderer and enabled compositor before measuring,and record the context alongside every observation. Missing/unexpected backend fails closed. Ordinary functional tests retain their original launch settings. No runtime renderer,world floor,quality/resolution,authority,sampling algorithm,retry,threshold or budget file changes.

New results are source-bound evidence for this declared environment. They do not replace historical default-compositor failures,physical/native/final-art qualification,controlled3D loading failures or hosted CI results. Actual desktop/mobile Deadline and sandbox executions are required before claiming the new profile is verified. Raw diagnostic protocol/results remain under private artifacts/vnext/n06-04/web-v1;repository evidence records their hashes.

Rollback:revert the scoped test launch/profile helper;retain both generations of measurements. Do not lower the existing limits or silently fall back to a different renderer.

Qualification checkpoint:ec81262 Deadline desktop/mobile PASS p9516.8ms;Sandbox desktop166.7ms/mobile150ms FAIL100ms. Therefore the profile is NOT fully qualified. Both cases remain in required CI and N06-04 stays IN_PROGRESS. See docs/plans/platform-vnext/audit/N06-04-RAF-PROFILE-CHECKPOINT.json.
