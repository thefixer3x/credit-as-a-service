import * as React from 'react';
import { cn, formatCurrency } from '../../lib/utils';
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle, XCircle } from 'lucide-react';

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  category?: string;
  reference?: string;
}

export interface TransactionListProps {
  transactions: Transaction[];
  currency?: string;
  className?: string;
  showFilters?: boolean;
  maxItems?: number;
}

export function TransactionList({
  transactions,
  currency = 'USD',
  className,
  showFilters = false,
  maxItems
}: TransactionListProps) {
  const [filter, setFilter] = React.useState<'all' | 'credit' | 'debit'>('all');
  
  const getStatusIcon = (status: Transaction['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getTransactionIcon = (type: Transaction['type']) => {
    return type === 'credit' ? (
      <ArrowDownLeft className="w-4 h-4 text-green-600" />
    ) : (
      <ArrowUpRight className="w-4 h-4 text-red-600" />
    );
  };

  const filteredTransactions = transactions.filter(transaction => 
    filter === 'all' || transaction.type === filter
  );

  const displayTransactions = maxItems 
    ? filteredTransactions.slice(0, maxItems)
    : filteredTransactions;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent Transactions</h3>
        {showFilters && (
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'credit', 'debit'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  filter === type
                    ? 'bg-white shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {displayTransactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-4 bg-white rounded-lg border hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                {getTransactionIcon(transaction.type)}
                {getStatusIcon(transaction.status)}
              </div>
              
              <div className="flex-1">
                <div className="font-medium">{transaction.description}</div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>{new Date(transaction.timestamp).toLocaleDateString()}</span>
                  {transaction.category && (
                    <>
                      <span>•</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {transaction.category}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={cn(
                'font-semibold',
                transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
              )}>
                {transaction.type === 'credit' ? '+' : '-'}
                {formatCurrency(transaction.amount, currency)}
              </div>
              {transaction.reference && (
                <div className="text-xs text-muted-foreground">
                  Ref: {transaction.reference}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {displayTransactions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No transactions found</p>
        </div>
      )}

      {maxItems && transactions.length > maxItems && (
        <div className="text-center">
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View all {transactions.length} transactions
          </button>
        </div>
      )}
    </div>
  );
}

export default TransactionList;