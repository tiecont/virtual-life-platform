package life.virtualcity.spike;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GameplayOrientation")
public class GameplayOrientationPlugin extends Plugin {
    private final OrientationLease lease = new OrientationLease();

    private boolean validId(String id) {
        return id != null && id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");
    }

    @PluginMethod
    public void acquire(PluginCall call) {
        String id = call.getString("leaseId");
        String mode = call.getString("mode", "sensor");
        if (!validId(id) || !(mode.equals("sensor") || mode.equals("primary") || mode.equals("secondary"))) {
            call.reject("Orientation request unavailable");
            return;
        }
        int policy = mode.equals("primary") ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            : mode.equals("secondary") ? ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
        if (getActivity() == null) { call.reject("Orientation request unavailable"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                int requested = lease.acquire(id, getActivity().getRequestedOrientation(), policy);
                getActivity().setRequestedOrientation(requested);
                JSObject result = new JSObject();
                result.put("requestedPolicy", requested);
                // Requested policy is not proof that the OS applied it; layout stays adaptive.
                call.resolve(result);
            } catch (RuntimeException error) {
                Integer previous = lease.release(id);
                if (previous != null) {
                    try { getActivity().setRequestedOrientation(previous); } catch (RuntimeException ignored) { }
                }
                call.reject("Orientation request unavailable");
            }
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        String id = call.getString("leaseId");
        if (!validId(id)) { call.reject("Orientation request unavailable"); return; }
        if (getActivity() == null) { call.reject("Orientation request unavailable"); return; }
        getActivity().runOnUiThread(() -> {
            Integer previous = lease.release(id);
            try {
                if (previous != null) getActivity().setRequestedOrientation(previous);
                JSObject result = new JSObject();
                result.put("restored", previous != null);
                call.resolve(result);
            } catch (RuntimeException error) { call.reject("Orientation request unavailable"); }
        });
    }

    @Override
    protected void handleOnDestroy() {
        Integer previous = lease.clear();
        if (previous != null) {
            try { getActivity().setRequestedOrientation(previous); } catch (RuntimeException ignored) { }
        }
        super.handleOnDestroy();
    }
}
