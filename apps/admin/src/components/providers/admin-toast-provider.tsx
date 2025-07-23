'use client';

import { ToastProvider, Toaster } from '@caas/ui-kit';

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <Toaster />
    </ToastProvider>
  );
}