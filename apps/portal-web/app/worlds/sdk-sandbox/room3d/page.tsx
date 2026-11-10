import RoomClient from '../../../../features/sdk-sandbox/modules/room3d/presentation/RoomClient';
export const dynamic='force-dynamic';
export default function Room3DPage(){const value=process.env.PUBLIC_SOCKET_ORIGIN??'http://127.0.0.1:4300',origin=new URL(value);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==value)throw Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');return <RoomClient socketOrigin={origin.origin}/>;}
