'use client';
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {browserPlatform} from '@virtual-city/client-sdk';
import {QueuePanel} from '@virtual-city/game-client';
import '@virtual-city/game-client/styles.css';
export default function QueueClient(){const router=useRouter(),platform=useMemo(()=>browserPlatform(()=>{},path=>router.push(path)),[router]);return <QueuePanel platform={platform}/>;}
