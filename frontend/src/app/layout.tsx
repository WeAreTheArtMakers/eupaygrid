import './globals.css';

import type { Metadata } from 'next';

import Navbar from '@/components/Navbar';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata: Metadata = {
  title: 'EUPayGrid',
  description: 'Institutional settlement network simulation'
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <Navbar />
          <main className="mx-auto max-w-[1320px] px-4 py-6 lg:px-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
