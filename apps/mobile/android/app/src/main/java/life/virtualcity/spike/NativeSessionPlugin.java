package life.virtualcity.spike;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeSession")
public class NativeSessionPlugin extends Plugin {
    private static final ExecutorService QUEUE = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(32), new ThreadPoolExecutor.AbortPolicy());
    private static NativeSessionEngine engine;
    private interface Work { JSONObject run(NativeSessionEngine session) throws Exception; }
    private void dispatch(PluginCall call, Work work) {
        try { QUEUE.execute(() -> {
            try {
                if (BuildConfig.NATIVE_API_ORIGIN.isEmpty()) { call.reject("Native sign-in unavailable", "NOT_AVAILABLE"); return; }
                if (engine == null) engine = new NativeSessionEngine(getContext().getApplicationContext(), BuildConfig.NATIVE_API_ORIGIN);
                call.resolve(new JSObject(work.run(engine).toString()));
            } catch (Exception error) { call.reject("Native session unavailable", "NATIVE_SESSION_UNAVAILABLE"); }
        }); } catch (RejectedExecutionException error) { call.reject("Please wait before trying again", "NATIVE_SESSION_BUSY"); }
    }
    @PluginMethod public void restore(PluginCall call) { dispatch(call, session -> session.restore()); }
    @PluginMethod public void destination(PluginCall call) { dispatch(call, session -> new JSONObject().put("schemaVersion", 1).put("origin", session.http.policy.origin)); }
    @PluginMethod public void guest(PluginCall call) { dispatch(call, session -> session.bootstrap("guest", call.getObject("guest"), call.getString("deviceLabel"))); }
    @PluginMethod public void login(PluginCall call) { dispatch(call, session -> session.bootstrap("login", call.getObject("login"), call.getString("deviceLabel"))); }
    @PluginMethod public void upgrade(PluginCall call) { dispatch(call, session -> session.upgrade(call.getObject("upgrade"), call.getString("requestId"))); }
    @PluginMethod public void ticket(PluginCall call) { dispatch(call, session -> session.ticket(call.getObject("protocol"))); }
    @PluginMethod public void roomTicket(PluginCall call) { dispatch(call, session -> session.roomTicket(call.getString("expectedAccountId"), call.getObject("protocol"))); }
    @PluginMethod public void world(PluginCall call) { dispatch(call, session -> session.world(call.getString("expectedAccountId"), call.getString("operation"), call.getString("intentId"), call.getString("requestId"), call.getObject("input"))); }
    @PluginMethod public void request(PluginCall call) { dispatch(call, session -> session.request(call.getString("method", "GET"), call.getString("path"), call.getObject("body"), call.getString("requestId"))); }
    @PluginMethod public void devices(PluginCall call) { dispatch(call, session -> session.devices()); }
    @PluginMethod public void safetyState(PluginCall call) { dispatch(call, session -> session.safetyState(call.getString("expectedAccountId"))); }
    @PluginMethod public void avatarState(PluginCall call) { dispatch(call, session -> session.avatarState(call.getString("expectedAccountId"))); }
    @PluginMethod public void saveAvatar(PluginCall call) { dispatch(call, session -> session.saveAvatar(call.getString("expectedAccountId"), call.getString("requestId"), call.getObject("save"))); }
    @PluginMethod public void report(PluginCall call) { dispatch(call, session -> session.report(call.getString("expectedAccountId"), call.getString("requestId"), call.getObject("report"))); }
    @PluginMethod public void setBlock(PluginCall call) {
        Object blocked = call.getData().opt("blocked");
        if (!(blocked instanceof Boolean)) { call.reject("Choose a block action", "CONFIRMATION_REQUIRED"); return; }
        dispatch(call, session -> session.setBlock(call.getString("expectedAccountId"), call.getString("requestId"), call.getString("targetId"), Boolean.TRUE.equals(blocked)));
    }
    @PluginMethod public void revoke(PluginCall call) { dispatch(call, session -> session.revoke(call.getString("deviceId"))); }
    @PluginMethod public void logout(PluginCall call) { dispatch(call, session -> session.logout()); }
    @PluginMethod public void deleteAccount(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getData().opt("confirmDelete"))) { call.reject("Explicit account confirmation required", "CONFIRMATION_REQUIRED"); return; }
        dispatch(call, session -> session.deleteAccount(call.getString("requestId"), call.getString("expectedAccountId"), true));
    }
}
