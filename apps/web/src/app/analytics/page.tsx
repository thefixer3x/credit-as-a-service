"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit';

const Navigation = dynamic(
  () => import('../components/navigation').then(mod => ({ default: mod.Navigation })),
  { ssr: false }
);

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Platform performance and insights</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Analytics Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Analytics features coming soon.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
