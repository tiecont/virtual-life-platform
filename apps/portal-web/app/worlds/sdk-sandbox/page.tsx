import RoomPanel from '../../components/WorldRoomPanel';
export const dynamic = 'force-dynamic';
export default function SandboxPage() {
  const value = process.env.PUBLIC_SOCKET_ORIGIN ?? 'http://127.0.0.1:4300'; const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) throw new Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');
  return <RoomPanel socketOrigin={origin.origin}/>;
}
