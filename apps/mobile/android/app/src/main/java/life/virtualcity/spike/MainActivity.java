package life.virtualcity.spike;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle state) {
        registerPlugin(GameplayOrientationPlugin.class);
        registerPlugin(NativeSessionPlugin.class);
        super.onCreate(state);
    }
}
