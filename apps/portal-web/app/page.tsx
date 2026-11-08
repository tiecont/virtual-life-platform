import { ReadinessSchema } from '@virtual-city/contracts';
import CityMap from './components/CityMap';
export const dynamic = 'force-dynamic';
export default async function Home() {
  let ready = false;
  try {
    const response = await fetch(new URL('/health/ready', process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4300'), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const result = ReadinessSchema.parse(await response.json());
    ready = response.ok && result.status === 'ready';
  } catch { /* Truthful unavailable state; never expose infrastructure details. */ }
  return <main><header><span className="mark" aria-hidden="true">VC</span><span className="brand-name">VIRTUAL LIFE PLATFORM</span><span className="tag">LOCAL FOUNDATION</span></header>
    <section><p className="eyebrow">A shared place, taking shape.</p><h1>A city begins<br/>with a connection.</h1><p className="intro">Explore places listed for your session. Real world rollout remains closed while local experiences are verified.</p>
    <div className="status-card"><div className="status-heading"><span className={ready ? 'dot ready' : 'dot'} aria-hidden="true"/><h2>Platform status</h2></div>
      <p role="status">{ready ? 'Database connected · schema v1' : 'Platform unavailable · try again shortly'}</p>
      <p className="muted">This status comes from the platform API and PostgreSQL. It does not indicate that a world is open.</p><a href="/">Refresh status <span aria-hidden="true">↗</span></a></div><a href="/identity">Create or manage your city identity →</a>
    </section><p><a href="/character">Create your animal character →</a></p><CityMap/><footer>Development preview · Real world rollout closed · No public release</footer></main>;
}
