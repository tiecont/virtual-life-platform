import assert from 'node:assert/strict';
import {pureSwap} from '../coop-visible-kind-swap.mjs';

// Each host turn is performed by the packaged player. Peers spend their own
// turns on ordinary board moves so the host sees naturally evolving boards.
export async function playFeedbackTurns({start,observe,peerSwap,chooseBasic,verifyHost,save,wait}) {
 let current=start;
 const turns=[];
 const wanted=['astral','frost','nature','heart','shield','mana','rage','special','sword'];
 for(let attempt=1;attempt<=6;attempt++){
  while(current.state.phase==='playing'&&current.state.activeSeat!==0){
   await peerSwap(current,chooseBasic(current.state.board));
   current=await observe(current.version+1);
  }
  if(current.state.phase!=='playing')break;
  const board=current.state.board;
  const kind=wanted.find(kind=>pureSwap(board,kind,true));
  const move=kind?pureSwap(board,kind,true).action:chooseBasic(board);
  const prefix='feedback-'+attempt;
  await save(prefix+'.json',{version:current.version,state:current.state,move});
  const next=await observe(current.version+1);
  const receipt=await verifyHost(next.version,move);
  assert.ok(receipt.receiptHash&&receipt.fingerprint);
  turns.push({attempt,kind:kind??null,version:next.version,move,receipt});
  await save(prefix+'-committed.json',{version:next.version,phase:next.state.phase,
   turn:next.state.turn,activeSeat:next.state.activeSeat,deadlineUnixMs:next.state.turnDeadlineUnixMs});
  await wait(prefix+'-observed');
  if(kind)wanted.push(...wanted.splice(wanted.indexOf(kind),1));
  current=next;
 }
 assert.ok(turns.length>0,'Match ended before an additional packaged host action');
 await save('feedback-finished.json',{turns});
}
