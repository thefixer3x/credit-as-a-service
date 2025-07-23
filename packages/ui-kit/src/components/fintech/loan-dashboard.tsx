import * as React from 'react';
import { cn, formatCurrency, formatPercentage } from '../../lib/utils.js';
import { TrendingUp, Calendar, DollarSign, Percent } from 'lucide-react';

export interface LoanData {
  id: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRate: number;
  termMonths: number;
  remainingPayments: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  totalPaid: number;
  status: 'active' | 'paid' | 'defaulted' | 'pending';
}

export interface LoanDashboardProps {
  loan: LoanData;
  currency?: string;
  className?: string;
}

export function LoanDashboard({
  loan,
  currency = 'USD',
  className
}: LoanDashboardProps) {
  const progressPercentage = ((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100;

  const getStatusColor = (status: LoanData['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'paid':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'defaulted':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={cn('space-y-6 p-6 bg-white rounded-xl border shadow-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Loan Overview</h2>
          <p className="text-sm text-muted-foreground">Loan ID: {loan.id}</p>
        </div>
        <div className={cn('px-3 py-1 rounded-full text-xs font-medium border', getStatusColor(loan.status))}>
          {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Loan Progress</span>
          <span className="font-medium">{progressPercentage.toFixed(1)}% Paid</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Principal</span>
          </div>
          <div className="text-xl font-semibold">
            {formatCurrency(loan.principalAmount, currency)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Outstanding</span>
          </div>
          <div className="text-xl font-semibold text-orange-600">
            {formatCurrency(loan.outstandingBalance, currency)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Percent className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Interest Rate</span>
          </div>
          <div className="text-xl font-semibold">
            {formatPercentage(loan.interestRate, 2, false)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Remaining</span>
          </div>
          <div className="text-xl font-semibold">
            {loan.remainingPayments} <span className="text-sm font-normal">payments</span>
          </div>
        </div>
      </div>

      {/* Next Payment Info */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-blue-900">Next Payment</h3>
            <p className="text-sm text-blue-700">
              Due: {new Date(loan.nextPaymentDate).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-900">
              {formatCurrency(loan.nextPaymentAmount, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Total Paid</div>
          <div className="text-lg font-semibold text-green-600">
            {formatCurrency(loan.totalPaid, currency)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Term</div>
          <div className="text-lg font-semibold">
            {loan.termMonths} months
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoanDashboard;