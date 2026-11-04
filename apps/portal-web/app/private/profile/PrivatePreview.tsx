'use client';
import { useState } from 'react';
import type { Me } from '@virtual-city/contracts';
import PrivateProfilePanel from './PrivateProfilePanel';
import PrivateMatching from './PrivateMatching';
export default function PrivatePreview({me,socketOrigin}:{me:Me;socketOrigin:string}){const [fence,setFence]=useState(0),[withdrawing,setWithdrawing]=useState(false);return <><PrivateProfilePanel me={me} socketOrigin={socketOrigin} onWithdrawStart={()=>{setWithdrawing(true);setFence(value=>value+1);}} onWithdrawDone={confirmed=>{if(confirmed)setWithdrawing(false);}}/><PrivateMatching key={fence} me={me} socketOrigin={socketOrigin} profileWithdrawing={withdrawing}/></>;}
