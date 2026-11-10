import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import CityHeader from '../features/city/modules/city/presentation/CityHeader';
export const metadata: Metadata = { title: 'Virtual Life Platform · City', description: 'Explore the city catalog with your session. Local preview; real world rollout remains closed.' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><CityHeader/>{children}</body></html>;
}
