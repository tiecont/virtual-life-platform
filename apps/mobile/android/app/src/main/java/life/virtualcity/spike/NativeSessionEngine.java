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
