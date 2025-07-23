"use client";

import React from 'react';
import { Navigation } from '../components/navigation';
import GatewaySyncDashboard from '../dashboard/gateway-sync';

export default function GatewayPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1">
        <GatewaySyncDashboard />
      </main>
    </div>
  );
}