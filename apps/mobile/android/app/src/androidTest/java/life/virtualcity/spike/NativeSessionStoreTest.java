package life.virtualcity.spike;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import static org.junit.Assert.*;

/** Synthetic credentials on the task-owned AVD only; no raw credential output. */
@RunWith(AndroidJUnit4.class)
public class NativeSessionStoreTest {
    private static final String ORIGIN = "https://localhost:18443";
    private static final String DEVICE = "a0000000-0000-4000-8000-000000000001";
    private static final String REFRESH = "nr1." + DEVICE + "." + new String(new char[64]).replace('\0', 'a');
    private Context context;
    private NativeSessionStore store;
    @Before public void prepare() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(BuildConfig.DEBUG);
        store = new NativeSessionStore(context, ORIGIN); store.clear();
    }
    @After public void cleanup() { store.clear(); }
    @Test public void keystoreEncryptionSurvivesNewStoreAndIsNotExportable() throws Exception {
        store.save(DEVICE, REFRESH);
        byte[] encrypted = Files.readAllBytes(new File(context.getNoBackupFilesDir(), "native-session-v1.enc").toPath());
        assertFalse(new String(encrypted, StandardCharsets.ISO_8859_1).contains(REFRESH));
        assertTrue("Encrypted refresh round trip", REFRESH.equals(new NativeSessionStore(context, ORIGIN).read()));
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        assertNull(keys.getKey("vlp.native.refresh.v1", null).getEncoded());
    }
    @Test public void originBindingFailsClosedAndRemovesCiphertext() throws Exception {
        store.save(DEVICE, REFRESH);
        try { new NativeSessionStore(context, "https://other.invalid").read(); fail("Wrong origin decrypted"); } catch (java.security.GeneralSecurityException expected) { }
        assertNull(store.read());
    }
    @Test public void tamperFailsClosedAndRemovesCiphertext() throws Exception {
        store.save(DEVICE, REFRESH);
        File path = new File(context.getNoBackupFilesDir(), "native-session-v1.enc");
        byte[] bytes = Files.readAllBytes(path.toPath()); bytes[bytes.length - 1] ^= 1;
        try (FileOutputStream stream = new FileOutputStream(path)) { stream.write(bytes); }
        try { store.read(); fail("Tampered storage decrypted"); } catch (java.security.GeneralSecurityException expected) { }
        assertNull(store.read());
    }
    @Test public void clearAndOversizedStorageNeverFallBackToPlaintext() throws Exception {
        store.save(DEVICE, REFRESH); store.clear(); assertNull(store.read());
        try (FileOutputStream stream = new FileOutputStream(new File(context.getNoBackupFilesDir(), "native-session-v1.enc"))) { stream.write(new byte[2048]); }
        try { store.read(); fail("Oversized storage accepted"); } catch (IllegalStateException expected) { }
        assertNull(store.read());
    }
}
