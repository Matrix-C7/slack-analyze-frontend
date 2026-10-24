import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import { AppShell } from '@/components/AppShell';
import './globals.css';

const lato = Lato({ subsets: ['latin'], weight: ['400', '700', '900'], display: 'swap', variable: '--font-lato' });

export const metadata: Metadata = {
  title: 'Slack Analyze',
  description: 'Browse, search and analyze captured Slack history',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={lato.variable}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
