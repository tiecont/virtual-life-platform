'use client';
import Link from 'next/link';
import { parkScene,parkAreas,parkDestinations,parkWorldVersion } from '@virtual-city/park-world';
import WorldRoomPanel,{type RoomExperience} from '../../components/WorldRoomPanel';
import './park.css';
const experience:RoomExperience={slug:'park',worldVersion:parkWorldVersion,scene:parkScene,title:'Central Park',eyebrow:'A PLACE TO BEGIN',badge:'LOCAL PARK PREVIEW',noun:'park',theme:'park',capacity:12,
 sceneLabel:'Original outdoor park floor plan. Four two-place benches,trees,a central garden,an activity board and portal signpost. Native movement and bench controls follow below.',caption:'SHARED BENCHES · ACTIVITY BOARD · CITY PORTALS',
 areas:parkAreas,areaLabel:'Park bench areas',areaHeading:'A little room to meet',areaDescription:'Eight bench places and space to stand in one twelve-place room. Keep personal contact details private.',provenance:'/assets/park/provenance.json',destinations:parkDestinations,
 movementHint:'Choose an open path tile, or use a destination below. Trees, boards and bench backs are solid.',focus:false,wardrobe:false};
export default function ParkRoom({socketOrigin}:{socketOrigin:string}){
 return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience}><section className="park-board" aria-label="Park notice boards">
  <h2>Find your next place</h2><p>The activity board opens the city overview. Portal destinations are reviewed at the travel desk;each visit needs your confirmation.</p>
  <div className="park-board-links"><Link href="/">Open city activity board</Link><Link href="/travel">Review portal destinations</Link></div>
  <p>No automatic contact sharing or direct messages. Use your circle to choose connections;report or block from the visitor controls.</p>
 </section></WorldRoomPanel>;
}
