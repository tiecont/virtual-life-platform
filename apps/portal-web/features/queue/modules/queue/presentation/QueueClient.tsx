'use client';
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {browserPlatform} from '@aetheria/client-sdk';
import {QueuePanel} from '@aetheria/game-client';
import '@aetheria/game-client/styles.css';
export default function QueueClient(){const router=useRouter(),platform=useMemo(()=>browserPlatform(()=>{},path=>router.push(path)),[router]);return <QueuePanel platform={platform}/>;}
