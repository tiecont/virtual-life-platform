type LifecyclePorts = {
  beginDrain: () => void;
  closeApp: () => Promise<void>;
  closePool: () => Promise<void>;
  deadlineMs?: number;
};

// Process-local orchestration only. Domain transactions and RoomAuthority keep
// their existing guards; a deadline is a failed stop, never a successful drain.
export class RuntimeLifecycle {
  #state: 'running' | 'draining' | 'closed' | 'failed' = 'running';
  #timers = new Set<ReturnType<typeof setInterval>>();
  #active = new Set<Promise<void>>();
  #stopping?: Promise<void>;
  constructor(private ports: LifecyclePorts) {
    const ms = ports.deadlineMs ?? 12000;
    if (!Number.isInteger(ms) || ms < 1 || ms > 12000) throw Error('Invalid shutdown deadline');
  }
  get state() {return this.#state;}
  run(work: () => Promise<unknown>, onError: () => void): Promise<void> | undefined {
    if (this.#state !== 'running') return;
    const task = Promise.resolve().then(work).then(() => {}, () => {
      try {onError();} catch { /* Logging cannot break maintenance settlement. */ }
    }).finally(() => {this.#active.delete(task);});
    this.#active.add(task); return task;
  }
  every(intervalMs: number, work: () => Promise<unknown>, onError: () => void, keepAlive = false) {
    if (this.#state !== 'running' || !Number.isInteger(intervalMs) || intervalMs < 1) throw Error('Cannot schedule maintenance');
    let busy = false;
    const timer = setInterval(() => {
      if (busy || this.#state !== 'running') return;
      busy = true;
      void this.run(work, onError)?.finally(() => {busy = false;});
    }, intervalMs);
    if (!keepAlive) timer.unref(); this.#timers.add(timer);
  }
  stop(): Promise<void> {
    if (this.#stopping) return this.#stopping;
    this.#state = 'draining';
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers.clear();
    try {this.ports.beginDrain();} catch (error) {this.#state = 'failed'; return this.#stopping = Promise.reject(error);}
    let deadline!: ReturnType<typeof setTimeout>;
    const assertDraining = () => {if (this.#state !== 'draining') throw Error('Runtime shutdown no longer active');};
    const settle = async () => {
      await Promise.all([...this.#active]); assertDraining();
      await this.ports.closeApp(); assertDraining();
      await this.ports.closePool(); assertDraining();
    };
    const expired = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {this.#state = 'failed'; reject(Error('Runtime shutdown deadline exceeded'));}, this.ports.deadlineMs ?? 12000);
    });
    this.#stopping = Promise.race([settle(), expired]).then(() => {this.#state = 'closed';}, error => {this.#state = 'failed'; throw error;}).finally(() => {clearTimeout(deadline);});
    return this.#stopping;
  }
}
