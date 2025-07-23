'use client';

import { Toaster } from '@caas/ui-kit';

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}