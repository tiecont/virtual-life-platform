import {notFound} from 'next/navigation';
import LodgeRoom from '../../../features/lantern-lodge/modules/room/presentation/LodgeRoom';
export const dynamic='force-dynamic';
export default function LodgePage(){
 if(process.env.LOCAL_LANTERN_LODGE_WORLD!=='1'||process.env.LOCAL_GAME_LOBBY!=='1')notFound();
 const value=process.env.PUBLIC_SOCKET_ORIGIN??'http://127.0.0.1:4300',origin=new URL(value);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==value)throw Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');
 return <LodgeRoom socketOrigin={origin.origin}/>;
}
