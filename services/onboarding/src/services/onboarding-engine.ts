import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

import { validateEnv } from '@caas/config';
import { CacheService } from '@caas/cache';

import type {
  OnboardingApplication,
  OnboardingStep,
  PersonalInformation,
  BusinessInformation,
  IdentityDocument,
  Address,
  BankAccount,
  EmploymentInformation,
  NextOfKin,
  ComplianceCheck,
  VerificationResult,
  DocumentUpload,
  KycProvider,
  OnboardingWorkflow,
  AutoApprovalRule,
  OnboardingStats,
  WebhookPayload
} from '../types/onboarding.js';

const logger = pino({ name: 'onboarding-engine' });
const env = validateEnv();

export class OnboardingEngine {
  private cache: CacheService;
  private kycProviders: Map<string, KycProvider> = new Map();
  private workflows: Map<string, OnboardingWorkflow> = new Map();

  constructor(cache: CacheService) {
    this.cache = cache;
    this.loadKycProviders();
    this.loadWorkflows();
  }

  /**
   * Create new onboarding application
   */
  async createApplication(
    userId: string,
    type: 'individual' | 'business',
    kycLevel: 'tier_1' | 'tier_2' | 'tier_3' = 'tier_1'
  ): Promise<OnboardingApplication> {
    try {
      const applicationId = uuidv4();
      const workflow = this.getWorkflow(type, kycLevel);

      const application: OnboardingApplication = {
        id: applicationId,
        userId,
        type,
        status: 'draft',
        currentStep: workflow.steps[0],
        addresses: [],
        identityDocuments: [],
        bankAccounts: [],
        kycLevel,
        complianceChecks: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cache application
      await this.cache.set(`application:${applicationId}`, application, 86400); // 24 hours
      
      // Track user application
      await this.cache.set(`user:${userId}:application`, applicationId, 86400);

      logger.info({ 
        applicationId, 
        userId, 
        type, 
        kycLevel 
      }, 'Onboarding application created');

      return application;
    } catch (error) {
      logger.error({ error, userId, type }, 'Failed to create application');
      throw error;
    }
  }

  /**
   * Get application by ID
   */
  async getApplication(applicationId: string): Promise<OnboardingApplication | null> {
    try {
      const cached = await this.cache.get<OnboardingApplication>(`application:${applicationId}`);
      if (cached) return cached;

      // In production, this would query the database
      logger.debug({ applicationId }, 'Application not found in cache');
      return null;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to get application');
      return null;
    }
  }

  /**
   * Update personal information
   */
  async updatePersonalInfo(
    applicationId: string,
    personalInfo: PersonalInformation
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      application.personalInfo = personalInfo;
      application.updatedAt = new Date();

      // Auto-advance to next step if current step is personal_info
      if (application.currentStep === 'personal_info') {
        application.currentStep = this.getNextStep(application);
      }

      await this.saveApplication(application);

      logger.info({ 
        applicationId, 
        userId: application.userId 
      }, 'Personal information updated');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to update personal info');
      throw error;
    }
  }

  /**
   * Update business information
   */
  async updateBusinessInfo(
    applicationId: string,
    businessInfo: BusinessInformation
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      if (application.type !== 'business') {
        throw new Error('Business information can only be added to business applications');
      }

      application.businessInfo = businessInfo;
      application.updatedAt = new Date();

      // Auto-advance step
      if (application.currentStep === 'business_info') {
        application.currentStep = this.getNextStep(application);
      }

      await this.saveApplication(application);

      logger.info({ 
        applicationId, 
        businessName: businessInfo.businessName 
      }, 'Business information updated');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to update business info');
      throw error;
    }
  }

  /**
   * Add address
   */
  async addAddress(
    applicationId: string,
    address: Omit<Address, 'isVerified' | 'verifiedAt'>
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      const newAddress: Address = {
        ...address,
        isVerified: false
      };

      application.addresses.push(newAddress);
      application.updatedAt = new Date();

      await this.saveApplication(application);

      logger.info({ 
        applicationId, 
        addressType: address.type,
        city: address.city 
      }, 'Address added');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to add address');
      throw error;
    }
  }

  /**
   * Add identity document
   */
  async addIdentityDocument(
    applicationId: string,
    document: Omit<IdentityDocument, 'isVerified' | 'verificationStatus' | 'verifiedAt'>
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      const newDocument: IdentityDocument = {
        ...document,
        isVerified: false,
        verificationStatus: 'pending'
      };

      application.identityDocuments.push(newDocument);
      application.updatedAt = new Date();

      await this.saveApplication(application);

      // Start verification process
      await this.verifyIdentityDocument(applicationId, newDocument);

      logger.info({ 
        applicationId, 
        documentType: document.type,
        documentNumber: document.number 
      }, 'Identity document added');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to add identity document');
      throw error;
    }
  }

  /**
   * Add bank account
   */
  async addBankAccount(
    applicationId: string,
    bankAccount: Omit<BankAccount, 'isVerified' | 'verificationStatus' | 'verifiedAt'>
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      const newBankAccount: BankAccount = {
        ...bankAccount,
        isVerified: false,
        verificationStatus: 'pending'
      };

      application.bankAccounts.push(newBankAccount);
      application.updatedAt = new Date();

      await this.saveApplication(application);

      // Start bank account verification
      await this.verifyBankAccount(applicationId, newBankAccount);

      logger.info({ 
        applicationId, 
        bankName: bankAccount.bankName,
        accountNumber: this.maskAccountNumber(bankAccount.accountNumber)
      }, 'Bank account added');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to add bank account');
      throw error;
    }
  }

  /**
   * Submit application for review
   */
  async submitApplication(applicationId: string): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      if (application.status !== 'draft') {
        throw new Error('Application has already been submitted');
      }

      // Validate application completeness
      const validation = await this.validateApplication(application);
      if (!validation.isValid) {
        throw new Error(`Application validation failed: ${validation.errors.join(', ')}`);
      }

      application.status = 'submitted';
      application.submittedAt = new Date();
      application.updatedAt = new Date();
      application.currentStep = 'compliance_checks';

      await this.saveApplication(application);

      // Start compliance checks
      await this.performComplianceChecks(application);

      // Send webhook notification
      await this.sendWebhook(application, 'application.submitted');

      logger.info({ 
        applicationId, 
        userId: application.userId 
      }, 'Application submitted for review');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to submit application');
      throw error;
    }
  }

  /**
   * Approve application
   */
  async approveApplication(
    applicationId: string,
    reviewerId: string,
    notes?: string
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      application.status = 'approved';
      application.approvedAt = new Date();
      application.reviewedAt = new Date();
      application.updatedAt = new Date();
      application.currentStep = 'completed';

      if (notes) {
        application.reviewNotes = application.reviewNotes || [];
        application.reviewNotes.push(`${reviewerId}: ${notes}`);
      }

      await this.saveApplication(application);

      // Send webhook notification
      await this.sendWebhook(application, 'application.approved');

      logger.info({ 
        applicationId, 
        userId: application.userId,
        reviewerId 
      }, 'Application approved');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to approve application');
      throw error;
    }
  }

  /**
   * Reject application
   */
  async rejectApplication(
    applicationId: string,
    reviewerId: string,
    reasons: string[],
    notes?: string
  ): Promise<OnboardingApplication | null> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      application.status = 'rejected';
      application.rejectionReasons = reasons;
      application.reviewedAt = new Date();
      application.updatedAt = new Date();

      if (notes) {
        application.reviewNotes = application.reviewNotes || [];
        application.reviewNotes.push(`${reviewerId}: ${notes}`);
      }

      await this.saveApplication(application);

      // Send webhook notification
      await this.sendWebhook(application, 'application.rejected');

      logger.info({ 
        applicationId, 
        userId: application.userId,
        reviewerId,
        reasons 
      }, 'Application rejected');

      return application;
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to reject application');
      throw error;
    }
  }

  /**
   * Upload document
   */
  async uploadDocument(
    applicationId: string,
    documentType: string,
    file: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
    }
  ): Promise<DocumentUpload> {
    try {
      const application = await this.getApplication(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      const documentId = uuidv4();
      const fileName = `${applicationId}/${documentType}/${documentId}_${file.originalName}`;

      // In production, upload to cloud storage (S3, GCS, etc.)
      const fileUrl = `https://storage.example.com/${fileName}`;

      const document: DocumentUpload = {
        id: documentId,
        applicationId,
        documentType,
        fileName: file.originalName,
        fileSize: file.buffer.length,
        mimeType: file.mimeType,
        url: fileUrl,
        status: 'uploaded',
        uploadedAt: new Date()
      };

      // Store document metadata
      await this.cache.set(`document:${documentId}`, document, 86400);

      // Add to application's document list
      const documents = await this.cache.get<DocumentUpload[]>(`application:${applicationId}:documents`) || [];
      documents.push(document);
      await this.cache.set(`application:${applicationId}:documents`, documents, 86400);

      // Start OCR processing if document is an image
      if (file.mimeType.startsWith('image/')) {
        await this.processDocumentOcr(document);
      }

      logger.info({ 
        applicationId, 
        documentId,
        documentType,
        fileSize: file.buffer.length 
      }, 'Document uploaded');

      return document;
    } catch (error) {
      logger.error({ error, applicationId, documentType }, 'Failed to upload document');
      throw error;
    }
  }

  /**
   * Get application statistics
   */
  async getStats(dateRange?: { from: Date; to: Date }): Promise<OnboardingStats> {
    try {
      // In production, this would query the database with proper aggregations
      const stats: OnboardingStats = {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
        rejectedApplications: 0,
        averageProcessingTime: 0,
        approvalRate: 0,
        applicationsByStatus: {},
        applicationsByKycLevel: {},
        verificationSuccessRates: {}
      };

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get onboarding stats');
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async verifyIdentityDocument(
    applicationId: string,
    document: IdentityDocument
  ): Promise<void> {
    try {
      // Select appropriate KYC provider based on document type and country
      const provider = this.selectKycProvider('identity_verification', document.issuingCountry);
      if (!provider) {
        logger.warn({ documentType: document.type, country: document.issuingCountry }, 'No KYC provider available');
        return;
      }

      // Call KYC provider API (mock implementation)
      const verificationResult: VerificationResult = {
        provider: provider.name as any,
        reference: `${provider.name}_${Date.now()}`,
        confidence: 0.95,
        status: 'passed',
        timestamp: new Date()
      };

      // Update document verification status
      const application = await this.getApplication(applicationId);
      if (application) {
        const doc = application.identityDocuments.find(d => d.number === document.number);
        if (doc) {
          doc.isVerified = verificationResult.status === 'passed';
          doc.verificationStatus = verificationResult.status === 'passed' ? 'verified' : 'failed';
          doc.verificationDetails = verificationResult;
          doc.verifiedAt = new Date();

          await this.saveApplication(application);
        }
      }

      logger.info({ 
        applicationId, 
        documentType: document.type,
        provider: provider.name,
        status: verificationResult.status 
      }, 'Identity document verification completed');

    } catch (error) {
      logger.error({ error, applicationId, documentType: document.type }, 'Identity verification failed');
    }
  }

  private async verifyBankAccount(
    applicationId: string,
    bankAccount: BankAccount
  ): Promise<void> {
    try {
      // In production, integrate with bank verification APIs (Mono, Okra, Plaid)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call

      const application = await this.getApplication(applicationId);
      if (application) {
        const account = application.bankAccounts.find(a => a.accountNumber === bankAccount.accountNumber);
        if (account) {
          account.isVerified = true;
          account.verificationStatus = 'verified';
          account.verificationMethod = 'instant_verification';
          account.verifiedAt = new Date();

          await this.saveApplication(application);
        }
      }

      logger.info({ 
        applicationId, 
        bankName: bankAccount.bankName,
        accountNumber: this.maskAccountNumber(bankAccount.accountNumber)
      }, 'Bank account verification completed');

    } catch (error) {
      logger.error({ error, applicationId }, 'Bank account verification failed');
    }
  }

  private async performComplianceChecks(application: OnboardingApplication): Promise<void> {
    try {
      const checks: ComplianceCheck[] = [];

      // AML screening
      checks.push({
        type: 'aml',
        status: 'passed', // Mock result
        provider: 'compliance_engine',
        performedAt: new Date()
      });

      // Sanctions screening
      checks.push({
        type: 'sanctions',
        status: 'passed', // Mock result
        provider: 'compliance_engine',
        performedAt: new Date()
      });

      // PEP screening
      checks.push({
        type: 'pep',
        status: 'passed', // Mock result
        provider: 'compliance_engine',
        performedAt: new Date()
      });

      application.complianceChecks = checks;
      application.status = 'under_review';
      application.currentStep = 'review';

      // Check auto-approval rules
      const autoApprovalResult = await this.checkAutoApprovalRules(application);
      if (autoApprovalResult.shouldAutoApprove) {
        application.status = 'approved';
        application.approvedAt = new Date();
        application.currentStep = 'completed';
      }

      await this.saveApplication(application);

      logger.info({ 
        applicationId: application.id,
        checksCount: checks.length,
        autoApproved: autoApprovalResult.shouldAutoApprove 
      }, 'Compliance checks completed');

    } catch (error) {
      logger.error({ error, applicationId: application.id }, 'Compliance checks failed');
    }
  }

  private async checkAutoApprovalRules(application: OnboardingApplication): Promise<{
    shouldAutoApprove: boolean;
    matchedRules: string[];
  }> {
    try {
      const workflow = this.getWorkflow(application.type, application.kycLevel);
      const rules = workflow.autoApprovalRules || [];

      for (const rule of rules.sort((a, b) => a.priority - b.priority)) {
        const matches = rule.conditions.every(condition => {
          const fieldValue = this.getFieldValue(application, condition.field);
          return this.evaluateCondition(fieldValue, condition.operator, condition.value);
        });

        if (matches) {
          return {
            shouldAutoApprove: rule.action === 'approve',
            matchedRules: [rule.name]
          };
        }
      }

      return { shouldAutoApprove: false, matchedRules: [] };
    } catch (error) {
      logger.error({ error, applicationId: application.id }, 'Auto-approval rule evaluation failed');
      return { shouldAutoApprove: false, matchedRules: [] };
    }
  }

  private async processDocumentOcr(document: DocumentUpload): Promise<void> {
    try {
      // In production, integrate with OCR service (AWS Textract, Google Vision, etc.)
      document.status = 'processing';
      await this.cache.set(`document:${document.id}`, document, 86400);

      // Simulate OCR processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      document.status = 'processed';
      document.processedAt = new Date();
      document.ocrResult = {
        provider: 'aws_textract',
        confidence: 0.92,
        extractedText: 'Mock extracted text from document',
        structuredData: {
          documentType: 'drivers_license',
          fullName: 'John Doe',
          licenseNumber: 'D1234567',
          expiryDate: '2025-12-31'
        }
      };

      await this.cache.set(`document:${document.id}`, document, 86400);

      logger.info({ documentId: document.id }, 'Document OCR processing completed');
    } catch (error) {
      logger.error({ error, documentId: document.id }, 'Document OCR processing failed');
      document.status = 'failed';
      await this.cache.set(`document:${document.id}`, document, 86400);
    }
  }

  private async validateApplication(application: OnboardingApplication): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validate personal information
    if (!application.personalInfo) {
      errors.push('Personal information is required');
    }

    // Validate identity documents
    if (application.identityDocuments.length === 0) {
      errors.push('At least one identity document is required');
    }

    // Validate addresses
    if (application.addresses.length === 0) {
      errors.push('At least one address is required');
    }

    // Validate business information for business applications
    if (application.type === 'business' && !application.businessInfo) {
      errors.push('Business information is required for business applications');
    }

    // Validate bank accounts
    if (application.bankAccounts.length === 0) {
      errors.push('At least one bank account is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async saveApplication(application: OnboardingApplication): Promise<void> {
    application.updatedAt = new Date();
    await this.cache.set(`application:${application.id}`, application, 86400);
  }

  private async sendWebhook(application: OnboardingApplication, eventType: string): Promise<void> {
    try {
      const payload: WebhookPayload = {
        eventType: eventType as any,
        applicationId: application.id,
        userId: application.userId,
        status: application.status,
        data: {
          type: application.type,
          kycLevel: application.kycLevel,
          currentStep: application.currentStep
        },
        timestamp: new Date()
      };

      // In production, send to configured webhook URLs
      logger.info({ 
        applicationId: application.id,
        eventType,
        userId: application.userId 
      }, 'Webhook sent');

    } catch (error) {
      logger.error({ error, applicationId: application.id, eventType }, 'Webhook delivery failed');
    }
  }

  private selectKycProvider(type: string, country: string): KycProvider | null {
    return Array.from(this.kycProviders.values()).find(provider => 
      provider.type === type && 
      provider.country.includes(country) && 
      provider.isActive
    ) || null;
  }

  private getWorkflow(type: 'individual' | 'business', kycLevel: string): OnboardingWorkflow {
    const workflowKey = `${type}_${kycLevel}`;
    return this.workflows.get(workflowKey) || this.getDefaultWorkflow(type, kycLevel);
  }

  private getDefaultWorkflow(type: 'individual' | 'business', kycLevel: string): OnboardingWorkflow {
    const baseSteps: OnboardingStep[] = ['personal_info', 'identity_verification', 'address_verification'];
    
    if (type === 'business') {
      baseSteps.push('business_info');
    }
    
    baseSteps.push('bank_account', 'compliance_checks', 'review', 'completed');

    return {
      id: `default_${type}_${kycLevel}`,
      name: `Default ${type} ${kycLevel} workflow`,
      applicationType: type,
      kycLevel: kycLevel as any,
      steps: baseSteps,
      requiredDocuments: ['identity_document', 'proof_of_address'],
      isActive: true,
      createdAt: new Date()
    };
  }

  private getNextStep(application: OnboardingApplication): OnboardingStep {
    const workflow = this.getWorkflow(application.type, application.kycLevel);
    const currentIndex = workflow.steps.indexOf(application.currentStep);
    
    if (currentIndex >= 0 && currentIndex < workflow.steps.length - 1) {
      return workflow.steps[currentIndex + 1];
    }
    
    return application.currentStep;
  }

  private getFieldValue(application: OnboardingApplication, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = application;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }

  private evaluateCondition(fieldValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals': return fieldValue === expectedValue;
      case 'not_equals': return fieldValue !== expectedValue;
      case 'greater_than': return fieldValue > expectedValue;
      case 'less_than': return fieldValue < expectedValue;
      case 'contains': return String(fieldValue).includes(String(expectedValue));
      case 'in': return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
      case 'not_in': return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);
      default: return false;
    }
  }

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  }

  private loadKycProviders(): void {
    // Mock KYC providers - in production, load from database
    const providers: KycProvider[] = [
      {
        id: 'prembly-ng',
        name: 'prembly',
        type: 'identity_verification',
        country: ['NG'],
        isActive: true,
        config: {},
        endpoints: {
          verify: 'https://api.prembly.com/identitypass/verification/nin',
          status: 'https://api.prembly.com/identitypass/verification/status'
        },
        credentials: {
          apiKey: env.PREMBLY_API_KEY,
          publicKey: env.PREMBLY_PUBLIC_KEY
        }
      }
    ];

    for (const provider of providers) {
      this.kycProviders.set(provider.id, provider);
    }

    logger.info({ providerCount: this.kycProviders.size }, 'KYC providers loaded');
  }

  private loadWorkflows(): void {
    // Mock workflows - in production, load from database
    const workflows: OnboardingWorkflow[] = [
      {
        id: 'individual_tier_1',
        name: 'Individual Tier 1 KYC',
        applicationType: 'individual',
        kycLevel: 'tier_1',
        steps: ['personal_info', 'identity_verification', 'bank_account', 'compliance_checks', 'review', 'completed'],
        requiredDocuments: ['identity_document'],
        autoApprovalRules: [
          {
            name: 'Low risk auto-approval',
            conditions: [
              { field: 'complianceChecks.0.status', operator: 'equals', value: 'passed' },
              { field: 'identityDocuments.0.isVerified', operator: 'equals', value: true }
            ],
            action: 'approve',
            priority: 1
          }
        ],
        isActive: true,
        createdAt: new Date()
      }
    ];

    for (const workflow of workflows) {
      this.workflows.set(`${workflow.applicationType}_${workflow.kycLevel}`, workflow);
    }

    logger.info({ workflowCount: this.workflows.size }, 'Onboarding workflows loaded');
  }
}