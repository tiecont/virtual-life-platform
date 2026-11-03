'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { FocusResult } from '@virtual-city/contracts';
import { completionSummary } from './summary';
export { completionSummary } from './summary';
export type FocusTimerProps = {
  observation: FocusResult | null;
  canStart: boolean;
  busy: boolean;
  uncertain: boolean;
  message: string;
  retryable: boolean;
  onStart: (duration: 900 | 1500 | 3000) => void;
  onCommand: (action: 'pause' | 'resume' | 'cancel') => void;
  onRefresh: () => void;
  onRetry: () => void;
};
export function FocusTimer(props: FocusTimerProps) {
  const [duration, setDuration] = useState<900 | 1500 | 3000>(900), [elapsed, setElapsed] = useState(0), [sharing, setSharing] = useState(false), [copied, setCopied] = useState('');
  const durationId = useId();
  const refresh = useRef(props.onRefresh); refresh.current = props.onRefresh;
  const session = props.observation?.session, running = session?.phase === 'active' || session?.phase === 'paused';
  const remaining = session ? Math.max(0, session.remainingMs - (session.phase === 'active' ? elapsed : 0)) : duration * 1000;
  const seconds = Math.ceil(remaining / 1000), digits = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  useEffect(() => {
    setElapsed(0); const base = performance.now(); let requested = false;
    const tick = () => { const delta = Math.max(0, performance.now() - base); setElapsed(delta); if (!requested && session?.phase === 'active' && delta >= session.remainingMs) { requested = true; refresh.current(); } };
    if (session?.phase !== 'active' || props.uncertain) return;
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [props.observation, props.uncertain, session]);
  useEffect(() => { setSharing(false); setCopied(''); }, [session?.id, session?.phase, props.uncertain]);
  const summary = session && session.phase === 'completed' && !props.uncertain ? completionSummary(session) : null;
  const phase = props.uncertain ? 'Timer unconfirmed' : !props.observation ? 'Checking timer' : !session ? 'No active timer' : session.phase === 'active' ? 'Focus in progress' : session.phase === 'paused' ? 'Timer paused' : session.phase === 'completed' ? 'Timer completed' : 'Timer cancelled';
  return <section className="focus-timer" aria-label="Private focus timer" data-focus-id={session?.id ?? ''}>
    <div className="focus-heading"><h2>Focus</h2><span className="focus-private">Private</span></div>
    <p className="focus-phase" aria-live="polite">{phase}</p>
    <div className="focus-clock" role="timer" aria-live="off" aria-label={props.uncertain ? 'Time unconfirmed' : `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}>{props.uncertain ? '--:--' : digits}</div>
    {!props.uncertain && session?.phase === 'active' && seconds === 0 && <p className="focus-note">Confirming completion...</p>}
    {!running && <fieldset className="focus-durations" disabled={props.busy || props.uncertain || !props.observation}><legend>Duration</legend>{([900, 1500, 3000] as const).map(value => <label key={value}><input type="radio" name={durationId} value={value} checked={duration === value} onChange={() => setDuration(value)}/>{value / 60} min</label>)}</fieldset>}
    <div className="focus-actions">
      {!running && <button disabled={!props.canStart || props.busy || props.uncertain || !props.observation || props.retryable} onClick={() => props.onStart(duration)}>Start focus</button>}
      {running && <>{session?.canPause && <button disabled={props.busy || props.uncertain || props.retryable} onClick={() => props.onCommand(session.phase === 'paused' ? 'resume' : 'pause')}>{session.phase === 'paused' ? 'Resume timer' : 'Pause timer'}</button>}<button disabled={props.busy || props.uncertain || props.retryable} onClick={() => props.onCommand('cancel')}>Cancel timer</button></>}
      <button disabled={props.busy} onClick={props.onRefresh}>Refresh timer</button>
      {props.retryable && <button disabled={props.busy} onClick={props.onRetry}>Retry timer request</button>}
    </div>
    {!running && !props.canStart && <p className="focus-note">No confirmed focus seat</p>}
    {props.message && <p className="focus-message" aria-live="polite">{props.message}</p>}
    {summary && <div className="focus-sharing"><label><input type="checkbox" checked={sharing} onChange={event => { setSharing(event.target.checked); setCopied(''); }}/>Create a completion summary</label>{sharing && <><blockquote aria-label="Completion summary">{summary}</blockquote><button onClick={() => { if (!navigator.clipboard) { setCopied('Clipboard unavailable.'); return; } void navigator.clipboard.writeText(summary).then(() => setCopied('Summary copied.'), () => setCopied('Clipboard unavailable.')); }}>Copy summary</button>{copied && <p aria-live="polite">{copied}</p>}</>}</div>}
  </section>;
}
