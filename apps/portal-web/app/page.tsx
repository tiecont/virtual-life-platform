import { ReadinessSchema } from '@virtual-city/contracts';
export const dynamic = 'force-dynamic';
export default async function Home() {
  let ready = false;
  try {
    const response = await fetch(new URL('/health/ready', process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4300'), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const result = ReadinessSchema.parse(await response.json());
    ready = response.ok && result.status === 'ready';
  } catch { /* Truthful unavailable state; never expose infrastructure details. */ }
  return <main><header><span className="mark" aria-hidden="true">VC</span><span>VIRTUAL CITY</span><span className="tag">LOCAL FOUNDATION</span></header>
    <section><p className="eyebrow">A shared place, taking shape.</p><h1>A city begins<br/>with a connection.</h1><p className="intro">The platform foundation is under construction. Playable worlds and travel are not available yet.</p>
    <div className="status-card"><div className="status-heading"><span className={ready ? 'dot ready' : 'dot'} aria-hidden="true"/><h2>Platform status</h2></div>
      <p role="status">{ready ? 'Database connected · schema v1' : 'Platform unavailable · try again shortly'}</p>
      <p className="muted">This status comes from the platform API and PostgreSQL. It does not indicate that a world is open.</p><a href="/">Refresh status <span aria-hidden="true">↗</span></a></div><a href="/identity">Create or manage your city identity →</a>
    </section><footer>Development preview · All worlds closed · No public release</footer></main>;
}
