'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { Button } from '@caas/ui-kit';
import { Progress } from '@caas/ui-kit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@caas/ui-kit';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Activity,
  FileText,
  Settings,
  Bell
} from 'lucide-react';

// Mock data - in real app, this would come from API
const dashboardData = {
  overview: {
    totalLeads: 156,
    pendingLeads: 23,
    approvedLeads: 89,
    rejectedLeads: 44,
    conversionRate: 57.1,
    averageResponseTime: 4.2,
    revenue: {
      thisMonth: 45280,
      previousMonth: 38750,
      change: 16.9
    }
  },
  performanceMetrics: {
    approvalRate: {
      current: 57.1,
      trend: 'up' as const,
      change: 3.2
    },
    averageProcessingTime: {
      current: 4.2,
      trend: 'down' as const,
      change: -0.8
    },
    customerSatisfaction: {
      current: 4.6,
      trend: 'up' as const,
      change: 0.2
    }
  },
  recentActivity: [
    {
      id: '1',
      type: 'lead_received' as const,
      timestamp: new Date(),
      description: 'New loan application received - $25,000',
      amount: 25000,
      status: 'pending'
    },
    {
      id: '2',
      type: 'decision_submitted' as const,
      timestamp: new Date(Date.now() - 3600000),
      description: 'Loan approved for John Smith',
      amount: 15000,
      status: 'approved'
    },
    {
      id: '3',
      type: 'loan_disbursed' as const,
      timestamp: new Date(Date.now() - 7200000),
      description: 'Funds disbursed to Maria Garcia',
      amount: 30000,
      status: 'completed'
    }
  ],
  leadDistribution: {
    byAmount: [
      { range: '$0-$10K', count: 45, percentage: 28.8 },
      { range: '$10K-$25K', count: 62, percentage: 39.7 },
      { range: '$25K-$50K', count: 34, percentage: 21.8 },
      { range: '$50K+', count: 15, percentage: 9.6 }
    ],
    byRiskRating: [
      { rating: 'Low', count: 89, percentage: 57.1 },
      { rating: 'Medium', count: 52, percentage: 33.3 },
      { rating: 'High', count: 15, percentage: 9.6 }
    ]
  }
};

const chartData = [
  { month: 'Jan', leads: 65, approved: 37, revenue: 28500 },
  { month: 'Feb', leads: 89, approved: 52, revenue: 35200 },
  { month: 'Mar', leads: 103, approved: 61, revenue: 42800 },
  { month: 'Apr', leads: 125, approved: 73, revenue: 48900 },
  { month: 'May', leads: 142, approved: 85, revenue: 52300 },
  { month: 'Jun', leads: 156, approved: 89, revenue: 45280 }
];

export default function ProviderDashboard() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className=\"min-h-screen bg-gray-50 flex items-center justify-center\">
        <div className=\"text-center\">
          <div className=\"animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto\"></div>
          <p className=\"mt-4 text-gray-600\">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className=\"min-h-screen bg-gray-50\">
      {/* Header */}
      <header className=\"bg-white shadow-sm border-b border-gray-200\">
        <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\">
          <div className=\"flex justify-between items-center py-4\">
            <div>
              <h1 className=\"text-2xl font-bold text-gray-900\">Credit Provider Dashboard</h1>
              <p className=\"text-sm text-gray-600\">Welcome back, FirstCredit Bank</p>
            </div>
            <div className=\"flex items-center space-x-4\">
              <Button variant=\"outline\" size=\"sm\">
                <Bell className=\"h-4 w-4 mr-2\" />
                Notifications
              </Button>
              <Button variant=\"default\" size=\"sm\">
                <Settings className=\"h-4 w-4 mr-2\" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8\">
        {/* Overview Cards */}
        <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8\">
          <Card>
            <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
              <CardTitle className=\"text-sm font-medium\">Total Leads</CardTitle>
              <Users className=\"h-4 w-4 text-muted-foreground\" />
            </CardHeader>
            <CardContent>
              <div className=\"text-2xl font-bold\">{dashboardData.overview.totalLeads}</div>
              <p className=\"text-xs text-muted-foreground\">
                +12.5% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
              <CardTitle className=\"text-sm font-medium\">Revenue</CardTitle>
              <DollarSign className=\"h-4 w-4 text-muted-foreground\" />
            </CardHeader>
            <CardContent>
              <div className=\"text-2xl font-bold\">
                ${dashboardData.overview.revenue.thisMonth.toLocaleString()}
              </div>
              <p className=\"text-xs text-muted-foreground flex items-center\">
                <TrendingUp className=\"h-3 w-3 mr-1 text-green-600\" />
                +{dashboardData.overview.revenue.change}% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
              <CardTitle className=\"text-sm font-medium\">Conversion Rate</CardTitle>
              <CheckCircle className=\"h-4 w-4 text-muted-foreground\" />
            </CardHeader>
            <CardContent>
              <div className=\"text-2xl font-bold\">{dashboardData.overview.conversionRate}%</div>
              <Progress value={dashboardData.overview.conversionRate} className=\"mt-2\" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
              <CardTitle className=\"text-sm font-medium\">Avg Response Time</CardTitle>
              <Clock className=\"h-4 w-4 text-muted-foreground\" />
            </CardHeader>
            <CardContent>
              <div className=\"text-2xl font-bold\">{dashboardData.overview.averageResponseTime}h</div>
              <p className=\"text-xs text-muted-foreground flex items-center\">
                <TrendingDown className=\"h-3 w-3 mr-1 text-green-600\" />
                -0.8h from last month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue=\"overview\" className=\"space-y-6\">
          <TabsList>
            <TabsTrigger value=\"overview\">Overview</TabsTrigger>
            <TabsTrigger value=\"leads\">Leads</TabsTrigger>
            <TabsTrigger value=\"analytics\">Analytics</TabsTrigger>
            <TabsTrigger value=\"settings\">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value=\"overview\" className=\"space-y-6\">
            <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-6\">
              {/* Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Lead Performance Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width=\"100%\" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray=\"3 3\" />
                      <XAxis dataKey=\"month\" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type=\"monotone\" 
                        dataKey=\"leads\" 
                        stroke=\"#3b82f6\" 
                        strokeWidth={2}
                        name=\"Total Leads\"
                      />
                      <Line 
                        type=\"monotone\" 
                        dataKey=\"approved\" 
                        stroke=\"#10b981\" 
                        strokeWidth={2}
                        name=\"Approved\"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Lead Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Lead Distribution by Amount</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width=\"100%\" height={300}>
                    <BarChart data={dashboardData.leadDistribution.byAmount}>
                      <CartesianGrid strokeDasharray=\"3 3\" />
                      <XAxis dataKey=\"range\" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey=\"count\" fill=\"#3b82f6\" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className=\"space-y-4\">
                  {dashboardData.recentActivity.map((activity) => (
                    <div key={activity.id} className=\"flex items-center justify-between p-4 border rounded-lg\">
                      <div className=\"flex items-center space-x-3\">
                        <div className=\"p-2 bg-blue-100 rounded-full\">
                          {activity.type === 'lead_received' && <FileText className=\"h-4 w-4 text-blue-600\" />}
                          {activity.type === 'decision_submitted' && <CheckCircle className=\"h-4 w-4 text-green-600\" />}
                          {activity.type === 'loan_disbursed' && <DollarSign className=\"h-4 w-4 text-purple-600\" />}
                        </div>
                        <div>
                          <p className=\"font-medium\">{activity.description}</p>
                          <p className=\"text-sm text-gray-600\">
                            {activity.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className=\"flex items-center space-x-2\">
                        {activity.amount && (
                          <span className=\"font-medium\">
                            ${activity.amount.toLocaleString()}
                          </span>
                        )}
                        <Badge
                          variant={
                            activity.status === 'approved' ? 'success' :
                            activity.status === 'completed' ? 'default' :
                            activity.status === 'pending' ? 'warning' : 'destructive'
                          }
                        >
                          {activity.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value=\"leads\" className=\"space-y-6\">
            <Card>
              <CardHeader>
                <div className=\"flex justify-between items-center\">
                  <CardTitle>Lead Management</CardTitle>
                  <Button>
                    <FileText className=\"h-4 w-4 mr-2\" />
                    Export Leads
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className=\"text-center py-12\">
                  <Activity className=\"h-12 w-12 text-gray-400 mx-auto mb-4\" />
                  <h3 className=\"text-lg font-medium text-gray-900 mb-2\">
                    Lead Management Interface
                  </h3>
                  <p className=\"text-gray-600 mb-6\">
                    Detailed lead management functionality would be implemented here,
                    including lead filtering, status updates, and bulk actions.
                  </p>
                  <Button variant=\"outline\">
                    View All Leads
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value=\"analytics\" className=\"space-y-6\">
            <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-6\">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent className=\"space-y-4\">
                  <div className=\"flex justify-between items-center\">
                    <span className=\"text-sm font-medium\">Approval Rate</span>
                    <div className=\"flex items-center space-x-2\">
                      <span className=\"text-sm font-bold\">
                        {dashboardData.performanceMetrics.approvalRate.current}%
                      </span>
                      <TrendingUp className=\"h-4 w-4 text-green-600\" />
                    </div>
                  </div>
                  <Progress value={dashboardData.performanceMetrics.approvalRate.current} />

                  <div className=\"flex justify-between items-center\">
                    <span className=\"text-sm font-medium\">Processing Time</span>
                    <div className=\"flex items-center space-x-2\">
                      <span className=\"text-sm font-bold\">
                        {dashboardData.performanceMetrics.averageProcessingTime.current}h
                      </span>
                      <TrendingDown className=\"h-4 w-4 text-green-600\" />
                    </div>
                  </div>

                  <div className=\"flex justify-between items-center\">
                    <span className=\"text-sm font-medium\">Customer Satisfaction</span>
                    <div className=\"flex items-center space-x-2\">
                      <span className=\"text-sm font-bold\">
                        {dashboardData.performanceMetrics.customerSatisfaction.current}/5.0
                      </span>
                      <TrendingUp className=\"h-4 w-4 text-green-600\" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Risk Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width=\"100%\" height={200}>
                    <PieChart>
                      <Pie
                        data={dashboardData.leadDistribution.byRiskRating}
                        cx=\"50%\"
                        cy=\"50%\"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey=\"count\"
                        nameKey=\"rating\"
                      >
                        {dashboardData.leadDistribution.byRiskRating.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : '#ef4444'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className=\"mt-4 space-y-2\">
                    {dashboardData.leadDistribution.byRiskRating.map((item, index) => (
                      <div key={item.rating} className=\"flex items-center justify-between text-sm\">
                        <div className=\"flex items-center space-x-2\">
                          <div 
                            className=\"w-3 h-3 rounded-full\"
                            style={{ 
                              backgroundColor: index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : '#ef4444'
                            }}
                          />
                          <span>{item.rating} Risk</span>
                        </div>
                        <span className=\"font-medium\">{item.count} ({item.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value=\"settings\" className=\"space-y-6\">
            <Card>
              <CardHeader>
                <CardTitle>Integration Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className=\"text-center py-12\">
                  <Settings className=\"h-12 w-12 text-gray-400 mx-auto mb-4\" />
                  <h3 className=\"text-lg font-medium text-gray-900 mb-2\">
                    Provider Settings
                  </h3>
                  <p className=\"text-gray-600 mb-6\">
                    Configure your API settings, webhooks, notification preferences,
                    and integration parameters.
                  </p>
                  <div className=\"flex justify-center space-x-4\">
                    <Button variant=\"outline\">
                      API Configuration
                    </Button>
                    <Button variant=\"outline\">
                      Webhook Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}