"use client";

import React from 'react';
import { Navigation } from './components/navigation';
import FintechDashboard from './dashboard/page-variant-1';

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1">
        <FintechDashboard />
      </main>
    </div>
  );
}