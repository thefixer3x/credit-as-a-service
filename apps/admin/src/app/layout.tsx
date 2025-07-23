import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminProviders } from '@/components/providers/admin-providers';
import '@caas/ui-kit/styles';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CAAS Admin Console - Enterprise Management',
  description: 'Advanced administrative interface for Credit-as-a-Service platform management',
  keywords: ['admin', 'enterprise', 'management', 'credit', 'fintech', 'dashboard'],
  authors: [{ name: 'CAAS Platform Team' }],
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AdminProviders>
          <div className="min-h-screen bg-background font-sans antialiased">
            {children}
          </div>
        </AdminProviders>
      </body>
    </html>
  );
}