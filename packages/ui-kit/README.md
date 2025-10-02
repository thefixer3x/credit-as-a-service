# @caas/ui-kit

A comprehensive UI component library for the Credit-as-a-Service Platform, built with React, TypeScript, and Tailwind CSS. Integrated with 21st.dev for state-of-the-art components.

## Features

- 🎨 **21st.dev Integration** - Access to premium, production-ready UI components
- 📊 **Fintech-Specific Components** - Purpose-built for financial applications
- 🔧 **TypeScript First** - Full type safety and excellent DX
- 🎯 **Tailwind CSS** - Utility-first styling with design system
- 📱 **Responsive Design** - Mobile-first approach
- ♿ **Accessible** - WCAG compliant components
- 🚀 **Performance Optimized** - Tree-shakeable and lightweight

## Installation

```bash
npm install @caas/ui-kit
# or
yarn add @caas/ui-kit
```

## Quick Start

```tsx
import { StatsCards, LoanDashboard, Button } from '@caas/ui-kit';
import '@caas/ui-kit/styles';

const statsData = [
  {
    name: "Total Revenue",
    value: 287654,
    change: 8.32,
    changeType: "positive" as const,
    format: "currency" as const
  },
  // ... more stats
];

function App() {
  return (
    <div>
      <StatsCards data={statsData} />
      <Button variant="primary">Get Started</Button>
    </div>
  );
}
```

## Components

### Stats & Analytics
- `StatsCards` - Display key metrics with trend indicators
- `StatsDashboard` - Comprehensive dashboard layout
- `StatisticsCard` - Individual metric cards with custom styling

### Fintech Components
- `CreditScoreGauge` - Interactive credit score visualization
- `PaymentSchedule` - Payment timeline with status tracking
- `TransactionList` - Transaction history with filtering
- `LoanDashboard` - Complete loan overview interface
- `KYCForm` - Multi-step KYC/verification flow

### Base UI Components
- `Button` - Versatile button with multiple variants
- `Card` - Container component with header/content/footer
- `Badge` - Status and category indicators
- `Input` - Form input with validation states
- `Dialog` - Modal dialogs and overlays

### Layout Components
- `Sidebar` - Navigation sidebar with collapsible sections
- `Header` - Application header with user menu
- `PageContainer` - Standard page layout wrapper

## 21st.dev Integration

This library leverages 21st.dev components for enhanced UI patterns:

```tsx
import { mcp___21st-dev_magic__21st_magic_component_builder } from '@21st-dev/magic';

// Access premium fintech dashboard components
const FintechDashboard = () => {
  return (
    <StatsCards 
      data={dashboardStats}
      className="grid grid-cols-4 gap-6"
    />
  );
};
```

## Styling

The library uses Tailwind CSS with a custom design system:

```css
/* Import base styles */
@import '@caas/ui-kit/styles';

/* Custom theme variables */
:root {
  --primary: 220 90% 56%;
  --secondary: 220 14% 96%;
  --accent: 220 14% 96%;
  --destructive: 0 84% 60%;
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```tsx
import type { 
  StatData, 
  LoanData, 
  Transaction,
  KYCFormData 
} from '@caas/ui-kit';

const loanData: LoanData = {
  id: 'loan-123',
  principalAmount: 50000,
  outstandingBalance: 32000,
  // ... fully typed
};
```

## Component Examples

### Credit Score Gauge
```tsx
<CreditScoreGauge 
  score={720}
  size="lg"
  showLabel={true}
/>
```

### Payment Schedule
```tsx
const payments: PaymentScheduleItem[] = [
  {
    id: '1',
    dueDate: '2025-02-01',
    principalAmount: 500,
    interestAmount: 50,
    totalAmount: 550,
    status: 'pending'
  }
];

<PaymentSchedule 
  payments={payments}
  currency="USD"
  showUpcoming={6}
/>
```

### Transaction List
```tsx
const transactions: Transaction[] = [
  {
    id: '1',
    type: 'credit',
    amount: 1000,
    description: 'Loan disbursement',
    timestamp: '2025-01-15T10:30:00Z',
    status: 'completed'
  }
];

<TransactionList 
  transactions={transactions}
  showFilters={true}
  maxItems={10}
/>
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build library
npm run build

# Run tests
npm test

# Run Storybook
npm run storybook
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © Credit-as-a-Service Platform

## Support

For questions and support, please open an issue on GitHub or contact the development team.