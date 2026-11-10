'use client';
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {AnimalStudyPanel} from '@virtual-city/game-client';
import {browserPlatform} from '@virtual-city/client-sdk';
import '@virtual-city/game-client/styles.css';
const loadStudy=()=>import('@virtual-city/scene3d');
export default function StudioClient(){const router=useRouter(),platform=useMemo(()=>browserPlatform(()=>{},path=>router.push(path)),[router]);return <AnimalStudyPanel loadStudy={loadStudy} platform={platform} onLeave={()=>router.push('/')}/>;}
