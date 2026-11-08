package life.virtualcity.spike;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import org.json.JSONObject;
import static org.junit.Assert.*;

/** Task-owned localhost HTTPS only;no USB or public endpoint fallback. */
@RunWith(AndroidJUnit4.class)
public class NativeAvatarHttpsTest {
    @Test public void accountBoundPartsReceiptRestoreAndGenericPortRejection() throws Exception {
        assertTrue(BuildConfig.DEBUG);assertEquals("https://localhost:18443",BuildConfig.NATIVE_API_ORIGIN);
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeSessionEngine session=new NativeSessionEngine(context,BuildConfig.NATIVE_API_ORIGIN);session.clear();
        try {
            JSONObject guest=new JSONObject().put("requestId",UUID.randomUUID().toString()).put("displayName","Native Avatar Fixture").put("avatarKey","fern");
            JSONObject initial=session.bootstrap("guest",guest,"Synthetic owned AVD");String account=initial.getJSONObject("me").getJSONObject("profile").getString("id");
            JSONObject own=session.avatarState(account);assertEquals(0,own.getInt("revision"));
            JSONObject parts=new JSONObject().put("species","rabbit").put("body","slender").put("head","wide").put("eyes","calm").put("muzzle","small").put("ears","long").put("tail","puff").put("fur","plum").put("marking","patch").put("hair","tuft").put("outfit","knit").put("accessory","scarf");
            JSONObject input=new JSONObject().put("schemaVersion",2).put("catalogVersion",own.getString("catalogVersion")).put("expectedAccountId",account).put("expectedRevision",0).put("parts",parts);String request=UUID.randomUUID().toString();
            JSONObject result=session.saveAvatar(account,request,input);assertEquals(200,result.getInt("status"));assertEquals(1,result.getJSONObject("body").getInt("savedRevision"));
            JSONObject replay=session.saveAvatar(account,request,input);assertEquals(200,replay.getInt("status"));assertEquals(1,replay.getJSONObject("body").getInt("savedRevision"));
            NativeSessionEngine restored=new NativeSessionEngine(context,BuildConfig.NATIVE_API_ORIGIN);JSONObject current=restored.avatarState(account);assertEquals(1,current.getInt("revision"));assertEquals("rabbit",current.getJSONObject("selected").getString("species"));
            assertFalse(current.toString().matches("(?s).*(na1\\.|nr1\\.|ni1\\.).*"));
            try {session.request("GET","/v1/me/avatar",null,null);fail("Generic port expanded");}catch(IllegalArgumentException expected){}
            try {session.avatarState(UUID.randomUUID().toString());fail("Stale displayed account accepted");}catch(IllegalStateException expected){}
            try {session.saveAvatar(account,UUID.randomUUID().toString(),new JSONObject(input.toString()).put("expectedAccountId",UUID.randomUUID().toString()));fail("Mismatched save body accepted");}catch(IllegalArgumentException expected){}
        } finally {session.logout();session.clear();}
    }
}
