# External technology comparison, facts and caveats (retrieved 2026-11-09)

| Tech | Why considered | Verified docs / caution |
|---|---|---|
| Unity 6.3 LTS + URP | strong native animation/editor/Android-iOS tooling | Unity says 6.3 LTS supported to Dec 2027; commercial license + mobile performance tests needed: https://unity.com/releases/unity-6/support |
| Unity Web | one codebase theoretical | web browser limitations: managed threading, networking, cache behavior; don't make only web plan: https://docs.unity.com/en-us/engine/6000.7/manual/platform-specific/webgl/intro/technical-overview |
| Babylon.js | WebGPU/WebGL and animation features | specs incl scene graph/animation/WebGL2/WebGPU: https://www.babylonjs.com/specifications/ ; compare existing Three via benchmark |
| Rust Tokio | async low-latency network tasks | CPU-bound work can't block async executor: https://docs.rs/tokio/latest/tokio/task/ |
| Rust tonic | high-performance gRPC interop with Nest | https://docs.rs/tonic/latest/tonic/ ; https://docs.nestjs.com/microservices/grpc |
| glTF 2.0 + KTX2 | portable source asset export and web streaming | https://registry.khronos.org/glTF/ and https://registry.khronos.org/KTX/ |
| ARKit blendshapes | reference facial channel taxonomy, NOT face-tracking requirement | https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapes |
| WCAG 2.2 | accessibility target for UI | https://www.w3.org/TR/WCAG22/ |
| WebSocket delivery | requires app-level ACK/retry/resync | https://socket.io/docs/v4/delivery-guarantees/ |

**Not verified:** actual Unity license tier/revenue, tool compatibility for owner's hardware, GPU numbers, Apple team account, hosting capacity and migration detail at repo HEAD. Approval gate must inspect current product docs/pricing/terms before commercial choice.

## 2026 desktop-first source additions (official documentation)
- Unity 6.3 LTS and support: https://unity.com/releases/unity-6/support
- Unity 6.3 release notes/update positioning: https://unity.com/blog/unity-6-3-lts-is-now-available
- GPU instancing, batching and URP optimization: https://unity.com/how-to/gpu-optimization
- Shader variant stripping (URP): https://docs.unity.com/en-us/engine/6000.3/manual/materials-and-shaders/built-in/shaders-in-universalrp/shader-stripping/check
- Unity Web memory: https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/memory
- Unity Web limitations: https://learn.unity.com/tutorial/getting-started-with-unity-web?publish=true
- Unity Addressables remote content: https://docs.unity.cn/Packages/com.unity.addressables%402.9/manual/remote-content-intro.html
- Tauri 2 updater signing: https://v2.tauri.app/plugin/updater/
- Windows Smart App Control signing: https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control
These references support capabilities/limitations, not actual VirtualLife performance results.
