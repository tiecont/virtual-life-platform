package life.virtualcity.spike;

/** Own-window presentation policy only; an old cleanup cannot release a newer owner. */
final class OrientationLease {
    private String owner;
    private Integer previous;

    int acquire(String id, int currentPolicy, int requestedPolicy) {
        if (owner == null) previous = currentPolicy;
        owner = id;
        return requestedPolicy;
    }

    Integer release(String id) {
        if (owner == null || !owner.equals(id)) return null;
        Integer restore = previous;
        owner = null;
        previous = null;
        return restore;
    }

    Integer clear() {
        return owner == null ? null : release(owner);
    }
}
