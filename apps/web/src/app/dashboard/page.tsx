"use client";

import React from 'react';
import dynamic from 'next/dynamic';

// Loading skeleton for dashboard
const LoadingSkeleton = () => (
  <div className="animate-pulse p-6 space-y-6">
    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
    <div className="grid grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
      ))}
    </div>
    <div className="grid grid-cols-2 gap-6">
      <div className="h-80 bg-gray-200 rounded-lg"></div>
      <div className="h-80 bg-gray-200 rounded-lg"></div>
    </div>
  </div>
);

// Dynamically import components with SSR disabled to prevent hydration mismatch
const Navigation = dynamic(
  () => import('../components/navigation').then(mod => ({ default: mod.Navigation })),
  { ssr: false, loading: () => <div className="w-64 bg-gray-100 animate-pulse" /> }
);

const FintechDashboard = dynamic(
  () => import('./page-variant-1'),
  { ssr: false, loading: () => <LoadingSkeleton /> }
);

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1">
        <FintechDashboard />
      </main>
    </div>
  );
}