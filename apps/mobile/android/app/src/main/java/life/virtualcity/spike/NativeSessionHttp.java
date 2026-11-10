package life.virtualcity.spike;

import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.CookieJar;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.MediaType;
import okhttp3.Response;
import org.json.JSONObject;

/** Normal platform certificate/hostname checks; no cookie jar, redirects or retries. */
final class NativeSessionHttp {
    final NativeEndpointPolicy policy;
    // Capacitor installs a process-global java.net.CookieHandler. A separate
    // client with NO_COOKIES avoids sharing it without mutating browser policy.
    private final OkHttpClient client = new OkHttpClient.Builder().cookieJar(CookieJar.NO_COOKIES)
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).callTimeout(20, TimeUnit.SECONDS).build();
    static final class Reply {
        final int status; final JSONObject body;
        Reply(int status, JSONObject body) { this.status = status; this.body = body; }
        boolean ok() { return status >= 200 && status < 300; }
    }
    NativeSessionHttp(String origin) { policy = new NativeEndpointPolicy(origin); }
    Reply send(String method, String path, JSONObject body, String access, String csrf, String requestId) throws Exception {
        return send(method, path, body, access, csrf, requestId, null);
    }
    Reply send(String method, String path, JSONObject body, String access, String csrf, String requestId, String expectedAccountId) throws Exception {
        Request.Builder request = new Request.Builder().url(policy.endpoint(path)).header("Accept", "application/json");
        if (expectedAccountId != null) request.header("X-Native-Account-Id", expectedAccountId);
        if (access != null) request.header("Authorization", "Bearer " + access);
        if (csrf != null) request.header("X-CSRF-Token", csrf);
        if (requestId != null) request.header("Idempotency-Key", requestId);
        byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes != null && bytes.length > 16384) throw new IllegalArgumentException("Native request unavailable");
        RequestBody payload = bytes == null ? null : RequestBody.create(bytes, MediaType.get("application/json; charset=utf-8"));
        request.method(method, payload);
        try (Response response = client.newCall(request.build()).execute()) {
            int status = response.code();
            if (status >= 300 && status < 400 || response.header("Set-Cookie") != null)
                throw new IllegalStateException("Native response unavailable");
            InputStream input = response.body() == null ? null : response.body().byteStream();
            if (input == null) throw new IllegalStateException("Native response unavailable");
            try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = stream.read(buffer)) != -1) { output.write(buffer, 0, count); if (output.size() > 131072) throw new IllegalStateException("Native response unavailable"); }
                return new Reply(status, new JSONObject(output.toString(StandardCharsets.UTF_8.name())));
            }
        }
    }
}
