package life.virtualcity.spike;

import org.junit.Test;
import static org.junit.Assert.*;

public class OrientationLeaseTest {
    @Test public void exitRestoresTheOriginalWindowPolicy() {
        OrientationLease lease = new OrientationLease();
        assertEquals(6, lease.acquire("first", -1, 6));
        assertEquals(Integer.valueOf(-1), lease.release("first"));
        assertNull(lease.release("first"));
    }
    @Test public void staleCleanupCannotUnlockTheReplacementRoute() {
        OrientationLease lease = new OrientationLease();
        lease.acquire("old-route", -1, 6);
        assertEquals(8, lease.acquire("new-route", 6, 8));
        assertNull(lease.release("old-route"));
        assertEquals(Integer.valueOf(-1), lease.release("new-route"));
    }
    @Test public void aLaterLifetimeCapturesItsOwnBaseline() {
        OrientationLease lease = new OrientationLease();
        lease.acquire("first", -1, 6);
        lease.release("first");
        lease.acquire("later", 1, 8);
        assertEquals(Integer.valueOf(1), lease.release("later"));
    }
    @Test public void destroyIsIdempotentAndDoesNotInventAPolicy() {
        OrientationLease lease = new OrientationLease();
        assertNull(lease.clear());
        lease.acquire("active", -1, 6);
        assertEquals(Integer.valueOf(-1), lease.clear());
        assertNull(lease.clear());
    }
}
