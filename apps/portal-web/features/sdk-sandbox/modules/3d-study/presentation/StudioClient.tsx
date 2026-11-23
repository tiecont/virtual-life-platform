'use client';
import {useMemo} from 'react';
import {useRouter} from 'next/navigation';
import {AnimalStudyPanel} from '@aetheria/game-client';
import {browserPlatform} from '@aetheria/client-sdk';
import '@aetheria/game-client/styles.css';
const loadStudy=()=>import('@aetheria/scene3d');
export default function StudioClient(){const router=useRouter(),platform=useMemo(()=>browserPlatform(()=>{},path=>router.push(path)),[router]);return <AnimalStudyPanel loadStudy={loadStudy} platform={platform} onLeave={()=>router.push('/')}/>;}
