package life.virtualcity.spike;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.util.UUID;
import org.json.JSONObject;
import static org.junit.Assert.*;

/** Run only with the isolated fixture, never a public endpoint or USB fallback. */
@RunWith(AndroidJUnit4.class)
public class NativeSessionHttpsTest {
    private NativeSessionHttp transport() {
        assertTrue(BuildConfig.DEBUG); assertEquals("https://localhost:18443", BuildConfig.NATIVE_API_ORIGIN);
        return new NativeSessionHttp(BuildConfig.NATIVE_API_ORIGIN);
    }
    @Test public void cookieJarIsIndependentOfProcessGlobalCookieHandler() throws Exception {
        NativeSessionHttp http = transport(); CookieHandler previous = CookieHandler.getDefault();
        try {
            CookieManager ambient = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
            ambient.getCookieStore().add(URI.create(BuildConfig.NATIVE_API_ORIGIN), new HttpCookie("synthetic", "ambient"));
            CookieHandler.setDefault(ambient);
            NativeSessionHttp.Reply reply = http.send("GET", "/v1/fixture/headers", null, null, null, null);
            assertEquals(200, reply.status); assertFalse(reply.body.getBoolean("cookiePresent")); assertFalse(reply.body.getBoolean("originPresent"));
            assertSame(ambient, CookieHandler.getDefault());
        } finally { CookieHandler.setDefault(previous); }
    }
    @Test public void redirectsCookiesAndOversizedResponsesFailClosed() throws Exception {
        NativeSessionHttp http = transport();
        for (String path : new String[]{"/v1/fixture/redirect", "/v1/fixture/cookie", "/v1/fixture/oversized"}) {
            try { http.send("GET", path, null, null, null, null); fail("Unsafe response accepted"); }
            catch (IllegalStateException expected) { }
        }
    }
    @Test public void testCaDoesNotAuthorizeAnIpDestination() throws Exception {
        transport(); NativeSessionHttp wrongHost = new NativeSessionHttp("https://127.0.0.1:18443");
        try { wrongHost.send("GET", "/v1/fixture/headers", null, null, null, null); fail("Wrong TLS destination accepted"); }
        catch (javax.net.ssl.SSLException expected) { }
    }
    private JSONObject guest() throws Exception {
        return new JSONObject().put("requestId", UUID.randomUUID().toString()).put("displayName", "Native AVD Visitor").put("avatarKey", "fern");
    }
    @Test public void encryptedRestoreRotationAccountMutationAndDeviceRevoke() throws Exception {
        transport(); Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeSessionEngine first = new NativeSessionEngine(context, BuildConfig.NATIVE_API_ORIGIN); first.clear();
        NativeSessionEngine restored = new NativeSessionEngine(context, BuildConfig.NATIVE_API_ORIGIN);
        try {
            JSONObject initial = first.bootstrap("guest", guest(), "Synthetic Android AVD"); assertTrue(initial.getBoolean("authenticated"));
            assertFalse(initial.toString().contains("na1.")); assertFalse(initial.toString().contains("nr1.")); assertFalse(initial.toString().contains("ni1."));
            String account = initial.getJSONObject("me").getJSONObject("profile").getString("id");
            JSONObject next = restored.restore(); assertTrue(next.getBoolean("authenticated"));
            assertEquals(account, next.getJSONObject("me").getJSONObject("profile").getString("id"));
            JSONObject mutation = restored.request("PATCH", "/v1/me", new JSONObject().put("displayName", "Native AVD Renamed"), UUID.randomUUID().toString());
            assertEquals(200, mutation.getInt("status")); assertEquals("Native AVD Renamed", mutation.getJSONObject("body").getJSONObject("profile").getString("displayName"));
            JSONObject device = restored.devices().getJSONArray("devices").getJSONObject(0); assertTrue(device.getBoolean("current"));
            assertTrue(restored.revoke(device.getString("deviceId")).getBoolean("revoked"));
            assertFalse(restored.restore().getBoolean("authenticated"));
        } finally { restored.logout(); first.clear(); }
    }
    @Test public void upgradeLoginAndLogoutDoNotExposeReusableCredentials() throws Exception {
        transport(); Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeSessionEngine session = new NativeSessionEngine(context, BuildConfig.NATIVE_API_ORIGIN); session.clear();
        String loginName = "avd_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        JSONObject login = new JSONObject().put("loginName", loginName).put("password", "N10 synthetic fixture password only");
        try {
            JSONObject created = session.bootstrap("guest", guest(), "Synthetic Android AVD");
            String account = created.getJSONObject("me").getJSONObject("profile").getString("id");
            JSONObject upgraded = session.upgrade(login, UUID.randomUUID().toString()); assertEquals("registered", upgraded.getJSONObject("me").getString("kind"));
            assertTrue(session.logout().getBoolean("remoteRevoked"));
            JSONObject signedIn = session.bootstrap("login", new JSONObject(login.toString()).put("requestId", UUID.randomUUID().toString()), "Synthetic Android AVD");
            assertEquals(account, signedIn.getJSONObject("me").getJSONObject("profile").getString("id"));
            assertFalse(signedIn.toString().contains("na1.")); assertFalse(signedIn.toString().contains("nr1."));
            assertTrue(session.logout().getBoolean("remoteRevoked")); assertFalse(session.restore().getBoolean("authenticated"));
        } finally { session.logout(); }
    }
}
