"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { Button } from '@caas/ui-kit';
import { cn } from '@/lib/utils';
import { 
  Activity,
  Server,
  Zap,
  Shield,
  Globe,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
  Settings,
  Monitor,
  Database,
  Cpu,
  Network,
  BarChart3
} from 'lucide-react';

// Types synced with onasis-gateway patterns
interface ServiceAdapter {
  name: string;
  version: string;
  description: string;
  status: 'active' | 'inactive' | 'pending';
  toolCount: number;
  authType: string;
  baseUrl: string;
  category: 'payment' | 'hosting' | 'financial' | 'networking' | 'lending' | 'analytics';
}

interface GatewayStats {
  activeAdapters: number;
  totalTools: number;
  successRate: number;
  categories: number;
  uptime: string;
  requests: number;
}

// Mock data following onasis-gateway structure
const creditServiceAdapters: ServiceAdapter[] = [
  {
    name: 'credit-scoring-api',
    version: '2.1.0',
    description: 'Advanced credit scoring and risk assessment with 127 tools',
    status: 'active',
    toolCount: 127,
    authType: 'Bearer + HMAC',
    baseUrl: 'https://api.caas-platform.com/credit',
    category: 'lending'
  },
  {
    name: 'loan-processing-api',
    version: '1.8.5',
    description: 'Automated loan application processing with 89 tools',
    status: 'active',
    toolCount: 89,
    authType: 'JWT Bearer',
    baseUrl: 'https://api.caas-platform.com/loans',
    category: 'lending'
  },
  {
    name: 'payment-gateway-api',
    version: '3.2.1',
    description: 'Multi-provider payment processing with 156 tools',
    status: 'active',
    toolCount: 156,
    authType: 'OAuth 2.0',
    baseUrl: 'https://api.caas-platform.com/payments',
    category: 'payment'
  },
  {
    name: 'risk-analytics-api',
    version: '1.5.2',
    description: 'Real-time risk analytics and monitoring with 73 tools',
    status: 'active',
    toolCount: 73,
    authType: 'API Key',
    baseUrl: 'https://api.caas-platform.com/risk',
    category: 'analytics'
  },
  {
    name: 'compliance-api',
    version: '2.0.0',
    description: 'KYC/AML compliance and verification with 45 tools',
    status: 'active',
    toolCount: 45,
    authType: 'Bearer',
    baseUrl: 'https://api.caas-platform.com/compliance',
    category: 'financial'
  }
];

const GatewayStatsCard: React.FC<{ title: string; value: string | number; icon: React.ElementType; gradient: string }> = ({ 
  title, value, icon: Icon, gradient 
}) => {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className={cn("absolute inset-0 opacity-10", gradient)} />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
            </div>
            <div className={cn("p-3 rounded-lg", gradient)}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ServiceAdapterCard: React.FC<{ adapter: ServiceAdapter }> = ({ adapter }) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'lending': return 'bg-blue-100 text-blue-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'financial': return 'bg-purple-100 text-purple-800';
      case 'analytics': return 'bg-orange-100 text-orange-800';
      case 'networking': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'inactive': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-lg hover:scale-105">
      <CardContent className="p-6">
        <div className={cn(
          "absolute top-4 right-4 px-2 py-1 rounded-lg text-xs font-medium",
          getCategoryColor(adapter.category)
        )}>
          {adapter.category}
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{adapter.name}</h3>
                <p className="text-sm text-muted-foreground">v{adapter.version}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              {getStatusIcon(adapter.status)}
              <span className="text-sm font-medium capitalize">{adapter.status}</span>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            {adapter.description}
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tools:</span>
                <span className="text-xs font-semibold">{adapter.toolCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Auth:</span>
                <span className="text-xs font-semibold">{adapter.authType}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Base URL:</span>
                <span className="text-xs font-semibold truncate">{adapter.baseUrl.split('//')[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Health:</span>
                <span className="text-xs font-semibold text-green-600">Online</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const GatewaySyncDashboard: React.FC = () => {
  const [stats, setStats] = useState<GatewayStats>({
    activeAdapters: creditServiceAdapters.filter(a => a.status === 'active').length,
    totalTools: creditServiceAdapters.reduce((sum, a) => sum + a.toolCount, 0),
    successRate: 96.7,
    categories: new Set(creditServiceAdapters.map(a => a.category)).size,
    uptime: '99.9%',
    requests: 12847
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const uniqueCategories = Array.from(new Set(creditServiceAdapters.map(a => a.category)));
  const categories = ['all', ...uniqueCategories];

  const filteredAdapters = selectedCategory === 'all' 
    ? creditServiceAdapters 
    : creditServiceAdapters.filter(a => a.category === selectedCategory);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Zap className="h-8 w-8 text-white" />
            </div>
            <span>CAAS Gateway Hub</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Credit-as-a-Service API Integration Dashboard - Synced with Onasis Gateway
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline">
            <Monitor className="h-4 w-4 mr-2" />
            System Health
          </Button>
          <Button>
            <Settings className="h-4 w-4 mr-2" />
            Gateway Config
          </Button>
        </div>
      </div>

      {/* Stats Grid - Following onasis-gateway pattern */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <GatewayStatsCard 
          title="Active Services" 
          value={stats.activeAdapters} 
          icon={Server} 
          gradient="bg-gradient-to-br from-blue-500 to-blue-600" 
        />
        <GatewayStatsCard 
          title="API Tools" 
          value={stats.totalTools} 
          icon={Database} 
          gradient="bg-gradient-to-br from-green-500 to-green-600" 
        />
        <GatewayStatsCard 
          title="Success Rate" 
          value={`${stats.successRate}%`} 
          icon={TrendingUp} 
          gradient="bg-gradient-to-br from-purple-500 to-purple-600" 
        />
        <GatewayStatsCard 
          title="Categories" 
          value={stats.categories} 
          icon={Globe} 
          gradient="bg-gradient-to-br from-orange-500 to-orange-600" 
        />
        <GatewayStatsCard 
          title="Uptime" 
          value={stats.uptime} 
          icon={Shield} 
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600" 
        />
        <GatewayStatsCard 
          title="Requests" 
          value={stats.requests.toLocaleString()} 
          icon={BarChart3} 
          gradient="bg-gradient-to-br from-red-500 to-red-600" 
        />
      </div>

      {/* Category Filter */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Service Adapters</CardTitle>
            <div className="flex items-center space-x-2">
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="capitalize"
                >
                  {category === 'all' ? 'All Services' : category}
                  {category !== 'all' && (
                    <Badge variant="secondary" className="ml-2">
                      {creditServiceAdapters.filter(a => a.category === category).length}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Adapters Grid - Following onasis-gateway card pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredAdapters.map((adapter) => (
          <ServiceAdapterCard key={adapter.name} adapter={adapter} />
        ))}
      </div>

      {/* API Endpoints Section - Following onasis-gateway pattern */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <span>Active API Endpoints</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              'GET /health',
              'GET /api/services',
              'POST /api/credit/score',
              'POST /api/loans/process',
              'GET /api/analytics/risk',
              'POST /api/compliance/verify',
              'GET /api/services/{name}/status',
              'POST /api/gateway/activate'
            ].map((endpoint) => (
              <div 
                key={endpoint}
                className="bg-muted/30 px-3 py-2 rounded-lg border font-mono text-sm text-primary hover:bg-muted/50 transition-colors"
              >
                {endpoint}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer - Following onasis-gateway pattern */}
      <div className="text-center py-6 text-muted-foreground border-t border-border">
        <div className="flex items-center justify-center space-x-2">
          <Cpu className="h-4 w-4" />
          <span>Powered by Next.js + TypeScript + Tailwind CSS</span>
        </div>
        <p className="mt-2 text-sm">
          Credit-as-a-Service Platform - Enterprise API Gateway Integration
        </p>
      </div>
    </div>
  );
};

export default GatewaySyncDashboard;