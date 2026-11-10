package life.virtualcity.spike;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeWorldHttpsTest {
    @Test public void dedicatedWorldReadsTravelReceiptsAndStaleAccountTicket() throws Exception {
        assertTrue(BuildConfig.DEBUG);assertEquals("https://localhost:18443",BuildConfig.NATIVE_API_ORIGIN);
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();NativeSessionEngine session=new NativeSessionEngine(context,BuildConfig.NATIVE_API_ORIGIN);session.clear();
        try {
            JSONObject initial=session.bootstrap("guest",new JSONObject().put("requestId",UUID.randomUUID().toString()).put("displayName","Native World Fixture").put("avatarKey","fern"),"Owned synthetic AVD");
            String account=initial.getJSONObject("me").getJSONObject("profile").getString("id"),wrong=UUID.randomUUID().toString();
            JSONObject catalog=session.world(account,"catalog",null,null,null);assertEquals(200,catalog.getInt("status"));assertEquals(200,session.world(account,"compatibility",null,null,null).getInt("status"));assertEquals(200,session.world(account,"visit",null,null,null).getInt("status"));
            JSONObject world=null;JSONArray worlds=catalog.getJSONObject("body").getJSONArray("worlds");for(int i=0;i<worlds.length();i++)if(worlds.getJSONObject(i).getString("slug").equals("deadline"))world=worlds.getJSONObject(i);assertNotNull(world);
            JSONObject input=new JSONObject().put("schemaVersion",1).put("source",JSONObject.NULL).put("destination",new JSONObject().put("worldSlug","deadline").put("worldVersion",world.getString("version")).put("sceneVersion",world.getJSONObject("sceneRef").getString("version")));
            String request=UUID.randomUUID().toString();JSONObject created=session.world(account,"travel-create",null,request,input);assertEquals(201,created.getInt("status"));String intent=created.getJSONObject("body").getString("intentId");
            assertEquals(intent,session.world(account,"travel-create",null,request,input).getJSONObject("body").getString("intentId"));assertEquals(200,session.world(account,"travel-read",intent,null,null).getInt("status"));
            assertEquals(200,session.world(account,"travel-cancel",intent,UUID.randomUUID().toString(),null).getInt("status"));
            try{session.world(account,"travel-read",intent+"/../other",null,null);fail("Receipt path injection accepted");}catch(IllegalArgumentException expected){}
            try{session.world(account,"arbitrary-url",null,null,null);fail("Unbounded world operation accepted");}catch(IllegalArgumentException expected){}
            try{session.request("GET","/v1/worlds",null,null);fail("Generic HTTP expanded");}catch(IllegalArgumentException expected){}
            try{session.world(wrong,"catalog",null,null,null);fail("Wrong account read");}catch(IllegalStateException expected){}
            JSONObject protocol=new JSONObject().put("nonce",UUID.randomUUID().toString()).put("versions",new JSONArray().put(1)).put("sceneSchemaVersions",new JSONArray().put(1)).put("requiredCapabilities",new JSONArray());
            try{session.roomTicket(wrong,protocol);fail("Stale displayed account ticket");}catch(IllegalStateException expected){}
            JSONObject ticket=session.roomTicket(account,protocol);assertEquals(protocol.getString("nonce"),ticket.getJSONObject("selection").getString("nonce"));assertTrue(ticket.getString("ticket").startsWith("nt1."));
        }finally{session.logout();session.clear();}
    }
}
