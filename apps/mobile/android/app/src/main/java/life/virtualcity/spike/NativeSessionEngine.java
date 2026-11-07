package life.virtualcity.spike;

import android.content.Context;
import android.os.SystemClock;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Access/CSRF live in this native object only. Call exclusively on the plugin's
 * process-wide serial queue, including Activity recreation and refresh. */
final class NativeSessionEngine {
    final NativeSessionStore store;
    final NativeSessionHttp http;
    private String access, csrf, deviceId;
    private JSONObject me;
    private long accessDeadline;
    NativeSessionEngine(Context context, String origin) {
        store = new NativeSessionStore(context, origin); http = new NativeSessionHttp(origin);
    }
    private JSONObject client() throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("platform", "android").put("clientBuild", "android-debug-1")
            .put("protocol", new JSONObject().put("nonce", UUID.randomUUID().toString()).put("versions", new JSONArray().put(1))
                .put("sceneSchemaVersions", new JSONArray().put(1)).put("requiredCapabilities", new JSONArray()));
    }
    private JSONObject accepted(NativeSessionHttp.Reply reply) throws Exception {
        if (!reply.ok()) throw new IllegalStateException("Native session unavailable");
        JSONObject body = reply.body, tokens = body.getJSONObject("tokens"), nextMe = body.getJSONObject("me");
        String nextAccess = tokens.getString("accessToken"), nextCsrf = nextMe.getString("csrfToken"), nextDevice = tokens.getString("deviceId");
        if (body.getInt("schemaVersion") != 1 || !body.getString("platform").equals("android")
                || !nextAccess.matches("na1\\.[a-f0-9]{64}") || !nextCsrf.matches("[a-f0-9]{64}"))
            throw new IllegalStateException("Native response unavailable");
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); format.setLenient(false);
        long remaining = format.parse(tokens.getString("accessExpiresAt")).getTime() - System.currentTimeMillis();
        if (remaining <= 0 || remaining > 305000) throw new IllegalStateException("Native response unavailable");
        // Persist the rotated refresh BEFORE publishing success/access in memory.
        String refresh = tokens.getString("refreshToken");
        store.save(nextDevice, refresh);
        if (!refresh.equals(store.read())) throw new IllegalStateException("Native storage unavailable");
        access = nextAccess; csrf = nextCsrf; deviceId = nextDevice; me = nextMe;
        accessDeadline = SystemClock.elapsedRealtime() + Math.min(300000, remaining) - 5000;
        return publicState();
    }
    JSONObject publicState() throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("authenticated", me != null)
            .put("me", me == null ? JSONObject.NULL : new JSONObject(me.toString()));
    }
    void clear() { access = null; csrf = null; deviceId = null; me = null; accessDeadline = 0; store.clear(); }
    JSONObject bootstrap(String kind, JSONObject input, String label) throws Exception {
        if (store.read() != null) throw new IllegalStateException("Restore or sign out first");
        JSONObject body = client().put("deviceLabel", label).put(kind, input);
        try { return accepted(http.send("POST", "/v1/native/session/" + kind, body, null, null, null)); }
        catch (Exception error) { clear(); throw error; }
    }
    JSONObject restore() throws Exception {
        if (access != null && SystemClock.elapsedRealtime() < accessDeadline) return publicState();
        String refresh = store.read();
        if (refresh == null) { clear(); return publicState(); }
        // No retry on lost ACK: a refresh may already have rotated remotely.
        try { return accepted(http.send("POST", "/v1/native/session/refresh", client().put("refreshToken", refresh), null, null, null)); }
        catch (Exception error) { clear(); throw error; }
    }
    private void authenticated() throws Exception {
        restore(); if (access == null) throw new IllegalStateException("Native authentication required");
    }
    JSONObject upgrade(JSONObject input, String requestId) throws Exception {
        authenticated();
        try { return accepted(http.send("POST", "/v1/native/session/upgrade", client().put("upgrade", input).put("requestId", requestId), access, null, null)); }
        catch (Exception error) { clear(); throw error; }
    }
    JSONObject ticket(JSONObject protocol) throws Exception {
        authenticated(); JSONObject input = client().put("protocol", protocol);
        NativeSessionHttp.Reply reply = http.send("POST", "/v1/native/session/socket-ticket", input, access, null, null);
        if (!reply.ok()) { if (reply.status == 401) clear(); throw new IllegalStateException("Native connection unavailable"); }
        JSONObject body = reply.body;
        if (!body.getString("ticket").matches("nt1\\.[a-f0-9]{64}")) throw new IllegalStateException("Native connection unavailable");
        // The only credential JavaScript receives is short-lived and single use.
        return new JSONObject().put("schemaVersion", 1).put("ticket", body.getString("ticket"))
            .put("expiresAt", body.getString("expiresAt")).put("selection", body.getJSONObject("selection"));
    }
    JSONObject request(String method, String path, JSONObject body, String requestId) throws Exception {
        http.policy.publicRequest(method, path); authenticated();
        if (!method.equals("GET") && (requestId == null || !requestId.matches("[a-f0-9-]{36}")))
            throw new IllegalArgumentException("Native request unavailable");
        NativeSessionHttp.Reply reply = http.send(method, path, body, access, method.equals("GET") ? null : csrf, requestId);
        if (reply.status == 401) clear();
        if (reply.ok() && path.equals("/v1/me")) { me = reply.body; csrf = me.getString("csrfToken"); }
        return new JSONObject().put("status", reply.status).put("body", reply.body);
    }
    JSONObject devices() throws Exception {
        authenticated(); NativeSessionHttp.Reply reply = http.send("GET", "/v1/native/devices", null, access, null, null);
        if (!reply.ok()) { if (reply.status == 401) clear(); throw new IllegalStateException("Native devices unavailable"); }
        return reply.body;
    }
    private void safetyAccount(String expectedAccountId) throws Exception {
        if (expectedAccountId == null || !expectedAccountId.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))
            throw new IllegalArgumentException("Refresh your account");
        authenticated();
        if (!expectedAccountId.equals(me.getJSONObject("profile").getString("id")))
            throw new IllegalStateException("Account changed; refresh before continuing");
    }
    private JSONObject safetyReply(String method, String path, JSONObject body, String requestId, String expectedAccountId) throws Exception {
        safetyAccount(expectedAccountId);
        if (!method.equals("GET") && (requestId == null || !requestId.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")))
            throw new IllegalArgumentException("Safety request unavailable");
        // A lost acknowledgement is an error. The UI retains the exact request
        // key for an explicit retry; this layer never retries or claims success.
        NativeSessionHttp.Reply reply = http.send(method, path, body, access, method.equals("GET") ? null : csrf, requestId, expectedAccountId);
        if (!reply.ok()) { if (reply.status == 401) clear(); throw new IllegalStateException("Safety action not confirmed"); }
        return reply.body;
    }
    JSONObject safetyState(String expectedAccountId) throws Exception {
        JSONObject visit = safetyReply("GET", "/v1/me/room", null, null, expectedAccountId);
        JSONObject status = safetyReply("GET", "/v1/safety/status", null, null, expectedAccountId);
        JSONObject blocks = safetyReply("GET", "/v1/blocks", null, null, expectedAccountId);
        return new JSONObject().put("schemaVersion", 1).put("accountId", expectedAccountId).put("visit", visit)
            .put("reportsAvailable", status.getBoolean("reportsAvailable")).put("blocks", blocks.getJSONArray("items"));
    }
    JSONObject report(String expectedAccountId, String requestId, JSONObject input) throws Exception {
        return safetyReply("POST", "/v1/reports", input, requestId, expectedAccountId);
    }
    JSONObject setBlock(String expectedAccountId, String requestId, String targetId, boolean blocked) throws Exception {
        if (targetId == null || !targetId.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))
            throw new IllegalArgumentException("Choose a player");
        return safetyReply("POST", "/v1/blocks", new JSONObject().put("targetId", targetId).put("blocked", blocked), requestId, expectedAccountId);
    }
    JSONObject deleteAccount(String requestId, String expectedAccountId, boolean confirmed) throws Exception {
        String uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        if (!confirmed || requestId == null || !requestId.matches(uuid) || expectedAccountId == null || !expectedAccountId.matches(uuid))
            throw new IllegalArgumentException("Explicit account confirmation required");
        authenticated();
        if (!expectedAccountId.equals(me.getJSONObject("profile").getString("id")))
            throw new IllegalStateException("Account changed; refresh before confirming");
        NativeSessionHttp.Reply reply;
        try {
            JSONObject body = new JSONObject().put("schemaVersion", 1).put("requestId", requestId)
                .put("expectedAccountId", expectedAccountId).put("confirmDelete", true);
            reply = http.send("DELETE", "/v1/native/account", body, access, csrf, null);
        } catch (Exception error) {
            // The server may have committed before transport failed. Never
            // retry or infer success from an ended session/deleted local file.
            clear(); return deletionOutcome(false);
        }
        if (reply.status >= 400 && reply.status < 500) {
            if (reply.status == 401) clear();
            throw new IllegalStateException("Deletion rejected; refresh before confirming");
        }
        boolean deleted = reply.status == 200 && reply.body.length() == 2
            && Integer.valueOf(1).equals(reply.body.opt("schemaVersion")) && Boolean.TRUE.equals(reply.body.opt("deleted"));
        clear(); return deletionOutcome(deleted);
    }
    private JSONObject deletionOutcome(boolean deleted) throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("outcome", deleted ? "DELETED" : "UNCONFIRMED").put("localCleared", true);
    }
    JSONObject revoke(String id) throws Exception {
        authenticated(); NativeSessionHttp.Reply reply = http.send("POST", "/v1/native/devices/revoke", new JSONObject().put("schemaVersion", 1).put("deviceId", id), access, null, null);
        if (!reply.ok()) { if (reply.status == 401) clear(); throw new IllegalStateException("Native devices unavailable"); }
        if (id.equals(deviceId)) clear(); return reply.body;
    }
    JSONObject logout() throws Exception {
        boolean remote = false;
        try {
            String refresh = store.read();
            if (refresh != null) remote = http.send("POST", "/v1/native/session/logout", new JSONObject().put("schemaVersion", 1).put("refreshToken", refresh), null, null, null).ok();
        } catch (Exception ignored) { /* Local sign-out still works offline; remote revocation is not claimed. */ }
        finally { clear(); }
        return new JSONObject().put("schemaVersion", 1).put("authenticated", false).put("remoteRevoked", remote);
    }
}
