import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import '@caas/ui-kit/styles';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CAAS Platform - Credit-as-a-Service Dashboard',
  description: 'Comprehensive dashboard for managing credit applications, loans, and user accounts',
  keywords: ['credit', 'fintech', 'lending', 'dashboard', 'loans'],
  authors: [{ name: 'CAAS Platform Team' }],
  openGraph: {
    title: 'CAAS Platform Dashboard',
    description: 'Manage your credit operations with our comprehensive dashboard',
    url: 'https://dashboard.caas-platform.com',
    siteName: 'CAAS Platform',
    images: [
      {
        url: 'https://dashboard.caas-platform.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'CAAS Platform Dashboard',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAAS Platform Dashboard',
    description: 'Manage your credit operations with our comprehensive dashboard',
    images: ['https://dashboard.caas-platform.com/twitter-image.jpg'],
  },
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production',
  },
  verification: {
    google: process.env.GOOGLE_VERIFICATION_ID,
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
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>
                <div className="min-h-screen bg-background font-sans antialiased">
                  {children}
                </div>
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}