# Identity Socket.IO protocol v1 (M03-06)

Authentication-only gateway mounted on platform API /socket.io, WebSocket transport. No room, seat, travel, chat or world command is implemented by this module. M06 extends this gateway after its prerequisites are verified.

Handshake: exact WEB_ORIGIN, signed host-only city cookie and strict auth `{schemaVersion:1,csrfToken}`. No account, role, age proof or raw token in query/auth payload. Server loads IdentityContext from the authoritative session row. Raw credential remains in a private WeakMap, not socket.data/events. Handshakes cap at 30/IP/min and 1000 active engine connections; per-session cap four sockets. Aborted/disconnected transports release reservations; commands are rate bounded and schemas strict.

Only `session.check` accepts `{schemaVersion:1,requestId:<UUID>}` and ACKs versioned success with own accountId/kind or a safe code. Every command reauthenticates against DB, even if an external revocation bypassed the in-process notification hook. Unknown events disconnect; future command allowlisting is a trusted composition API and does not authorize any client by itself. M06 must call the same authorize guard and add membership/world policy.

Post-commit logout/rotation/upgrade/delete notification emits only `{schemaVersion:1,reason:'session-ended'}` to affected sockets then disconnects them. Expiry timers close idle sockets; long TTLs use bounded timer intervals to avoid 32-bit timeout overflow. Close hooks disconnect transports and release engine/adapter resources before Fastify shutdown. Reconnect needs fresh cookie/CSRF if a session changed. Registration grants no moderator or adult eligibility.

Actual network tests (not mocked Socket.IO) cover valid/forged/legacy/cross-origin/CSRF handshakes, invalid version/forged command authority, logout across two sockets, renewal, external DB revocation, command/session connection caps and cleanup, upgrade/deletion, idle expiry, clock expiry and shutdown. Browser identity UI currently uses HTTP + local tab refresh; room sockets and travel consumers are future modules. No production TLS/proxy, load benchmark or public-release claim.
