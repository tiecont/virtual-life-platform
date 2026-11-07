package life.virtualcity.spike;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Only encrypted refresh custody; no plaintext/backup/export fallback. */
final class NativeSessionStore {
    private static final String ALIAS = "vlp.native.refresh.v1";
    private final AtomicFile file;
    private final byte[] aad;
    NativeSessionStore(Context context, String origin) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "native-session-v1.enc"));
        aad = ("vlp.native.refresh.v1\n" + origin).getBytes(StandardCharsets.UTF_8);
    }
    private SecretKey key(boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (keys.containsAlias(ALIAS)) return (SecretKey) keys.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Native storage unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    void save(String deviceId, String refreshToken) throws Exception {
        if (!deviceId.matches("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")
                || !refreshToken.matches("nr1\\." + deviceId + "\\.[a-f0-9]{64}"))
            throw new IllegalArgumentException("Native storage unavailable");
        byte[] plain = new JSONObject().put("deviceId", deviceId).put("refreshToken", refreshToken).toString().getBytes(StandardCharsets.UTF_8);
        FileOutputStream stream = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true)); cipher.updateAAD(aad);
            byte[] encrypted = cipher.doFinal(plain);
            stream = file.startWrite(); stream.write(1); stream.write(cipher.getIV()); stream.write(encrypted); file.finishWrite(stream);
        } catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
        finally { Arrays.fill(plain, (byte) 0); }
    }
    String read() throws Exception {
        if (!file.getBaseFile().exists()) return null;
        byte[] plain = null;
        try (java.io.FileInputStream input = file.openRead()) {
            byte[] bytes = new byte[1025]; int length = 0, count;
            while (length < bytes.length && (count = input.read(bytes, length, bytes.length - length)) > 0) length += count;
            if (length < 30 || length > 1024 || bytes[0] != 1) throw new IllegalStateException("Native storage unavailable");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 1, 13))); cipher.updateAAD(aad);
            plain = cipher.doFinal(Arrays.copyOfRange(bytes, 13, length));
            JSONObject value = new JSONObject(new String(plain, StandardCharsets.UTF_8));
            String device = value.getString("deviceId"), refresh = value.getString("refreshToken");
            if (!device.matches("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")
                || !refresh.matches("nr1\\." + device + "\\.[a-f0-9]{64}")) throw new IllegalStateException("Native storage unavailable");
            return refresh;
        } catch (Exception error) { clear(); throw error; }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); }
    }
    void clear() { file.delete(); }
}
