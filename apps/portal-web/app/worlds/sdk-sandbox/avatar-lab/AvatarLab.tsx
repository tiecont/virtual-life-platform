'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AvatarKeySchema, AvatarOutfitSchema, AnimationStateSchema, type AvatarAppearance, type AnimationState } from '@virtual-city/contracts';
import { avatarFrame, avatarAtlasSpec } from '@virtual-city/pixi-scene';
import '../room.css';
import './avatar.css';

export default function AvatarLab() {
  const [palette, setPalette] = useState<AvatarAppearance['palette']>('mint');
  const [outfit, setOutfit] = useState<AvatarAppearance['outfit']>('casual');
  const [action, setAction] = useState<AnimationState>('idle'); const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false); const [reduced, setReduced] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(preference.matches); if (preference.matches) { setPlaying(false); setFrame(0); } };
    update(); preference.addEventListener('change', update); return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing || reduced) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % avatarAtlasSpec.frameCount), avatarAtlasSpec.frameDurationMs);
    return () => clearInterval(timer);
  }, [playing, reduced]);
  const at = avatarFrame({ schemaVersion: 1, core: 'starter-v1', palette, outfit }, action, frame);
  const reset = () => { setPlaying(false); setFrame(0); };
  return <main className="cafe-shell avatar-lab"><header className="cafe-nav"><Link href="/worlds/sdk-sandbox">Back to cafe</Link><span className="cafe-local">LOCAL ART PREVIEW</span></header>
    <div className="cafe-heading"><div><p className="cafe-eyebrow">Original starter collection</p><h1>Make yourself at home.</h1></div></div>
    <p className="avatar-intro">One little city resident, eight colors and a cafe apron. Preview the styles and movements below.</p>
    <div className="avatar-workbench"><div className="avatar-stage">
      {failed ? <p role="alert">Avatar artwork could not load.</p> : <div className="avatar-crop" role="img" aria-label={`${palette} avatar, ${outfit}, ${action}`} data-action={action} data-frame={frame} data-playing={playing && !reduced ? 'true' : 'false'}>
        <img src={avatarAtlasSpec.path} alt="" aria-hidden="true" width={avatarAtlasSpec.width * 4} height={avatarAtlasSpec.height * 4} style={{ left: -at.x * 4, top: -at.y * 4 }} onError={() => { setFailed(true); setPlaying(false); }}/>
      </div>}
      <p>{outfit === 'casual' ? 'City casual' : 'Cafe apron'} · {palette}</p></div>
      <div className="avatar-controls"><label htmlFor="avatar-palette">Color</label><select id="avatar-palette" value={palette} onChange={event => { reset(); setPalette(AvatarKeySchema.parse(event.target.value)); }}>{AvatarKeySchema.options.map(key => <option key={key} value={key}>{key}</option>)}</select>
        <label htmlFor="avatar-outfit">Outfit preview</label><select id="avatar-outfit" value={outfit} onChange={event => { reset(); setOutfit(AvatarOutfitSchema.parse(event.target.value)); }}><option value="casual">City casual</option><option value="cafe-apron">Cafe apron</option></select>
        <fieldset><legend>Movement preview</legend><div className="avatar-actions">{AnimationStateSchema.options.map(state => <button key={state} aria-pressed={action === state} onClick={() => { reset(); setAction(state); }}>{state[0].toUpperCase() + state.slice(1)}</button>)}</div></fieldset>
        <label className="avatar-reduced"><input type="checkbox" checked={reduced} onChange={event => { reset(); setReduced(event.target.checked); }}/>Reduce motion</label>
        <button disabled={reduced || failed} onClick={() => { setFrame(0); setPlaying(value => !value); }}>{playing ? 'Pause animation' : 'Play animation'}</button>
        <button disabled={playing || failed} onClick={() => setFrame(value => (value + 1) % avatarAtlasSpec.frameCount)}>Next pose frame</button>
        <p className="avatar-note" role="status">{reduced ? 'Reduced motion: still poses.' : playing ? 'Playing preview.' : 'Still preview.'}</p>
      </div></div>
    <p className="avatar-note">Preview only. Your saved color comes from Identity. The cafe applies its own visual outfit; clothing grants no staff permissions.</p>
    <p className="avatar-note">Original artwork created for this project. Release approval is pending. <a href="/assets/avatars/provenance.json">Asset provenance</a></p>
  </main>;
}
