import LoungeRoom from '../../../features/lounge/modules/room/presentation/LoungeRoom';
export const dynamic='force-dynamic';
export default function LoungePage(){const value=process.env.PUBLIC_SOCKET_ORIGIN??'http://127.0.0.1:4300',origin=new URL(value);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==value)throw Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');return <LoungeRoom socketOrigin={origin.origin}/>;}
