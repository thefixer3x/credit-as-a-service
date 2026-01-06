export interface DelinquencyCase {
  id: string;
  userId: string;
  creditApplicationId: string;
  repaymentScheduleId: string;
  status: 'early_delinquency' | 'delinquent' | 'default' | 'resolved' | 'written_off';
  severity: 'low' | 'medium' | 'high' | 'critical';
  daysPastDue: number;
  outstandingAmount: number;
  overdueAmount: number;
  lateFees: number;
  totalOwed: number;
  firstMissedPaymentDate: Date;
  lastPaymentDate?: Date;
  lastContactDate?: Date;
  nextActionDate: Date;
  assignedAgent?: string;
  assignedTeam?: string;
  escalationLevel: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionAction {
  id: string;
  caseId: string;
  type: 'call' | 'email' | 'sms' | 'letter' | 'visit' | 'legal_notice' | 'payment_plan' | 'settlement';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  channel: 'phone' | 'email' | 'sms' | 'postal' | 'in_person' | 'whatsapp' | 'system';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduledFor: Date;
  completedAt?: Date;
  outcome: 'payment_received' | 'promise_to_pay' | 'dispute_raised' | 'no_contact' | 
           'wrong_number' | 'hardship_claimed' | 'legal_escalation' | 'other';
  agentId?: string;
  agentName?: string;
  notes: string;
  followUpRequired: boolean;
  followUpDate?: Date;
  documentsAttached?: string[];
  costIncurred?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface HardshipPlan {
  id: string;
  caseId: string;
  userId: string;
  type: 'temporary_reduction' | 'payment_holiday' | 'restructure' | 'settlement' | 'forbearance';
  reason: string;
  requestedBy: 'user' | 'agent' | 'system';
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'active' | 'completed' | 'breached';
  originalDebt: number;
  proposedTerms: {
    newPaymentAmount?: number;
    paymentHolidayMonths?: number;
    reducedPaymentMonths?: number;
    settlementAmount?: number;
    extendedTermMonths?: number;
    interestRateReduction?: number;
    feeWaivers?: string[];
    specialConditions?: string[];
  };
  approvedTerms?: HardshipPlan['proposedTerms'];
  startDate?: Date;
  endDate?: Date;
  effectiveDate?: Date;
  reviewDate?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  complianceRequirements?: string[];
  supportingDocuments?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentPromise {
  id: string;
  caseId: string;
  userId: string;
  actionId?: string;
  promisedAmount: number;
  promisedDate: Date;
  actualAmount?: number;
  actualDate?: Date;
  status: 'pending' | 'kept' | 'broken' | 'partial' | 'cancelled';
  promiseType: 'full_payment' | 'partial_payment' | 'arrangement_start';
  followUpDate?: Date;
  keeperScore?: number; // Historical promise keeping score
  notes?: string;
  agentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionStrategy {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  criteria: {
    daysPastDueMin?: number;
    daysPastDueMax?: number;
    amountMin?: number;
    amountMax?: number;
    riskLevels?: string[];
    customerSegments?: string[];
    previousDefaultHistory?: boolean;
    paymentBehaviorScore?: number;
  };
  actions: Array<{
    sequence: number;
    type: CollectionAction['type'];
    channel: CollectionAction['channel'];
    delayHours: number;
    template?: string;
    requiresApproval?: boolean;
    escalationTrigger?: boolean;
  }>;
  escalationRules: Array<{
    trigger: 'no_response' | 'promise_broken' | 'payment_missed' | 'days_elapsed';
    value: number;
    action: 'escalate_level' | 'assign_agent' | 'legal_referral' | 'write_off';
  }>;
  successMetrics: {
    targetContactRate?: number;
    targetPromiseRate?: number;
    targetRecoveryRate?: number;
    maxCostPerCase?: number;
  };
  complianceSettings: {
    maxCallsPerDay?: number;
    noCallHours?: Array<{ start: string; end: string }>;
    coolingOffPeriodHours?: number;
    requiresWrittenNotice?: boolean;
    legalNoticeDelayDays?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionAgent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive' | 'training' | 'on_leave';
  level: 'junior' | 'senior' | 'supervisor' | 'manager';
  specializations: string[];
  currentCaseLoad: number;
  maxCaseLoad: number;
  performance: {
    contactRate: number;
    promiseRate: number;
    recoveryRate: number;
    averageResolutionDays: number;
    customerSatisfactionScore?: number;
  };
  targets: {
    monthlyCases?: number;
    monthlyRecovery?: number;
    contactRateTarget?: number;
    promiseRateTarget?: number;
  };
  workingHours: {
    timezone: string;
    schedule: Array<{
      day: string;
      startTime: string;
      endTime: string;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionTeam {
  id: string;
  name: string;
  description: string;
  managerId: string;
  agents: string[];
  specialization: 'early_stage' | 'mid_stage' | 'late_stage' | 'legal' | 'hardship';
  caseAssignmentRules: {
    autoAssign: boolean;
    criteria: Record<string, any>;
    maxCasesPerAgent: number;
    escalationPath?: string[];
  };
  performance: {
    totalCases: number;
    resolvedCases: number;
    recoveryAmount: number;
    averageResolutionDays: number;
    customerComplaintRate: number;
  };
  targets: {
    monthlyRecoveryTarget: number;
    resolutionTimeTarget: number;
    contactRateTarget: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeCase {
  id: string;
  caseId: string;
  userId: string;
  type: 'payment_dispute' | 'amount_dispute' | 'service_dispute' | 'fraud_claim' | 'identity_theft';
  status: 'pending' | 'investigating' | 'resolved' | 'escalated' | 'closed';
  description: string;
  claimedAmount?: number;
  supportingEvidence?: string[];
  investigationNotes?: string[];
  resolution?: string;
  resolvedAmount?: number;
  investigatorId?: string;
  timelineEvents: Array<{
    date: Date;
    event: string;
    details: string;
    performedBy: string;
  }>;
  complianceFlags?: string[];
  legalImplications?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegalReferral {
  id: string;
  caseId: string;
  userId: string;
  referredBy: string;
  referralReason: string;
  debtAmount: number;
  legalFirm?: string;
  attorney?: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'judgment_obtained' | 'settled' | 'closed';
  referralDate: Date;
  responseDate?: Date;
  expectedRecovery?: number;
  legalFees?: number;
  courtFilingDate?: Date;
  judgmentDate?: Date;
  judgmentAmount?: number;
  settlementAmount?: number;
  settlementDate?: Date;
  documents?: string[];
  milestones: Array<{
    date: Date;
    milestone: string;
    details: string;
    cost?: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionWorkflow {
  id: string;
  name: string;
  description: string;
  triggerConditions: {
    daysPastDue: number;
    amountThreshold?: number;
    riskLevel?: string;
    customerSegment?: string;
  };
  steps: Array<{
    stepId: string;
    name: string;
    type: 'automated_action' | 'manual_task' | 'decision_point' | 'wait_period';
    config: Record<string, any>;
    conditions?: Record<string, any>;
    nextSteps: Array<{
      condition: string;
      nextStepId: string;
    }>;
  }>;
  isActive: boolean;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionAnalytics {
  period: string;
  totalCases: number;
  newCases: number;
  resolvedCases: number;
  totalDebtUnderCollection: number;
  amountRecovered: number;
  recoveryRate: number;
  averageResolutionDays: number;
  contactRate: number;
  promiseRate: number;
  promiseKeepingRate: number;
  costPerCase: number;
  agentUtilization: number;
  customerComplaintRate: number;
  legalReferralRate: number;
  writeOffRate: number;
  caseDistribution: {
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    byAgent: Record<string, number>;
    byStrategy: Record<string, number>;
    byOutcome: Record<string, number>;
  };
  trends: {
    recoveryTrend: Array<{ date: string; amount: number }>;
    volumeTrend: Array<{ date: string; cases: number }>;
    efficiencyTrend: Array<{ date: string; rate: number }>;
  };
  compliance: {
    callVolumeCompliance: boolean;
    timingCompliance: boolean;
    documentationCompliance: number;
    disputeResponseTime: number;
  };
}

export interface CollectionEvent {
  id: string;
  type: 'case_created' | 'action_completed' | 'payment_received' | 'promise_made' | 
        'promise_broken' | 'escalated' | 'hardship_requested' | 'dispute_raised' | 
        'legal_referred' | 'case_resolved' | 'case_written_off';
  caseId: string;
  userId: string;
  agentId?: string;
  data: Record<string, any>;
  timestamp: Date;
  processedAt?: Date;
  webhookDelivered?: boolean;
  webhookDeliveredAt?: Date;
}

export interface CollectionSettings {
  defaultStrategy: string;
  autoAssignmentEnabled: boolean;
  escalationSettings: {
    maxDaysBeforeEscalation: number;
    maxMissedPromises: number;
    autoLegalReferralDays: number;
    writeOffDays: number;
  };
  complianceSettings: {
    maxDailyCallAttempts: number;
    noCallHours: { start: string; end: string };
    requiredDocumentationFields: string[];
    mandatoryCoolingOffHours: number;
  };
  performanceTargets: {
    contactRateTarget: number;
    promiseRateTarget: number;
    recoveryRateTarget: number;
    maxResolutionDays: number;
  };
  notificationSettings: {
    agentAssignmentNotifications: boolean;
    escalationNotifications: boolean;
    performanceAlerts: boolean;
    complianceAlerts: boolean;
  };
}