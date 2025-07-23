import * as React from 'react';
import { cn, formatCurrency } from '../../lib/utils.js';
import { Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export interface PaymentScheduleItem {
  id: string;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  status: 'pending' | 'paid' | 'overdue' | 'processing';
  paymentMethod?: string;
}

export interface PaymentScheduleProps {
  payments: PaymentScheduleItem[];
  currency?: string;
  className?: string;
  showUpcoming?: number;
}

export function PaymentSchedule({
  payments,
  currency = 'USD',
  className,
  showUpcoming = 6
}: PaymentScheduleProps) {
  const getStatusIcon = (status: PaymentScheduleItem['status']) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <Calendar className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: PaymentScheduleItem['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'overdue':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'processing':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  const displayPayments = payments.slice(0, showUpcoming);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Payment Schedule</h3>
        <div className="text-sm text-muted-foreground">
          {payments.filter(p => p.status === 'pending').length} upcoming payments
        </div>
      </div>

      <div className="space-y-3">
        {displayPayments.map((payment, index) => (
          <div
            key={payment.id}
            className={cn(
              'p-4 rounded-lg border transition-colors',
              getStatusColor(payment.status)
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getStatusIcon(payment.status)}
                <div>
                  <div className="font-medium">
                    Payment #{index + 1}
                  </div>
                  <div className="text-sm opacity-75">
                    Due: {new Date(payment.dueDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="font-semibold">
                  {formatCurrency(payment.totalAmount, currency)}
                </div>
                <div className="text-sm opacity-75">
                  Principal: {formatCurrency(payment.principalAmount, currency)} | 
                  Interest: {formatCurrency(payment.interestAmount, currency)}
                </div>
              </div>
            </div>

            {payment.paymentMethod && (
              <div className="mt-2 text-xs opacity-60">
                Payment method: {payment.paymentMethod}
              </div>
            )}
          </div>
        ))}
      </div>

      {payments.length > showUpcoming && (
        <div className="text-center">
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Show {payments.length - showUpcoming} more payments
          </button>
        </div>
      )}
    </div>
  );
}

export default PaymentSchedule;