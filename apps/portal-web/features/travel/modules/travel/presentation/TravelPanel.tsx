'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {TravelPanel as SharedTravelPanel} from '@virtual-city/game-client';
import {browserPlatform} from '@virtual-city/client-sdk';
import {announceVisitChange} from '../../../../rooms/modules/rooms/application/visit-hint';
import type {DestinationLink} from '../application/destination-link';
export default function TravelPanel({socketOrigin,preferred={kind:'none'}}:{socketOrigin:string;preferred?:DestinationLink}){
 const platform=useMemo(()=>browserPlatform(announceVisitChange),[]);
 return <SharedTravelPanel socketOrigin={socketOrigin} preferred={preferred} platform={platform} Link={Link}/>;
}
