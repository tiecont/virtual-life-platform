// Single-instance bounded window limiter. Never persist or log raw IP keys.
export class WindowLimiter {
  private windows = new Map<string, { count: number; until: number }>();
  constructor(private now = Date.now, private maxKeys = 10000) {}
  take(key: string, limit: number, windowMs = 60000): boolean {
    const now = this.now();
    let current = this.windows.get(key);
    if (current && current.until > now) {
      if (current.count >= limit) return false;
      current.count++; return true;
    }
    if (this.windows.size >= this.maxKeys) {
      for (const [key, value] of this.windows) if (value.until <= now) this.windows.delete(key);
      if (this.windows.size >= this.maxKeys) return false;
    }
    current = { count: 1, until: now + windowMs };
    this.windows.set(key, current); return true;
  }
}
