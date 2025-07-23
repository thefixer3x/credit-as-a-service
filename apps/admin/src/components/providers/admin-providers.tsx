'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminAuthProvider } from './admin-auth-provider';
import { AdminThemeProvider } from './admin-theme-provider';
import { AdminToastProvider } from './admin-toast-provider';

export function AdminProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // 30 seconds
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  }));

  return (
    <AdminThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AdminAuthProvider>
          <AdminToastProvider>
            {children}
          </AdminToastProvider>
        </AdminAuthProvider>
      </QueryClientProvider>
    </AdminThemeProvider>
  );
}