export interface PersonalInformation {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  nationality: string;
  countryOfBirth: string;
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed';
  email: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
}

export interface Address {
  type: 'residential' | 'business' | 'mailing';
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isVerified: boolean;
  verificationMethod?: 'utility_bill' | 'bank_statement' | 'government_mail';
  verifiedAt?: Date;
}

export interface IdentityDocument {
  type: 'national_id' | 'drivers_license' | 'passport' | 'voters_card' | 'nin_slip';
  number: string;
  issuingCountry: string;
  issuingAuthority?: string;
  issueDate: Date;
  expiryDate?: Date;
  frontImageUrl?: string;
  backImageUrl?: string;
  isVerified: boolean;
  verificationStatus: 'pending' | 'verified' | 'failed' | 'expired';
  verificationDetails?: VerificationResult;
  verifiedAt?: Date;
}

export interface BusinessInformation {
  businessName: string;
  registrationNumber: string;
  taxId?: string;
  businessType: 'sole_proprietorship' | 'partnership' | 'corporation' | 'llc' | 'ngo' | 'other';
  industry: string;
  yearEstablished: number;
  numberOfEmployees: number;
  annualRevenue?: number;
  website?: string;
  description: string;
  registrationCertificateUrl?: string;
  taxCertificateUrl?: string;
  articlesOfIncorporationUrl?: string;
  isVerified: boolean;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verificationDetails?: VerificationResult;
  verifiedAt?: Date;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  routingNumber?: string;
  iban?: string;
  swiftCode?: string;
  currency: string;
  accountType: 'checking' | 'savings' | 'business' | 'current';
  isVerified: boolean;
  verificationMethod?: 'micro_deposits' | 'instant_verification' | 'manual';
  verificationStatus: 'pending' | 'verified' | 'failed';
  verifiedAt?: Date;
}

export interface EmploymentInformation {
  status: 'employed' | 'self_employed' | 'unemployed' | 'student' | 'retired';
  employerName?: string;
  jobTitle?: string;
  workEmail?: string;
  monthlyIncome?: number;
  annualIncome?: number;
  employmentStartDate?: Date;
  industryType?: string;
  workAddress?: Address;
  employmentLetterUrl?: string;
  payslipUrl?: string;
  isVerified: boolean;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verifiedAt?: Date;
}

export interface NextOfKin {
  firstName: string;
  lastName: string;
  relationship: 'spouse' | 'parent' | 'sibling' | 'child' | 'friend' | 'colleague' | 'other';
  phoneNumber: string;
  email?: string;
  address: Address;
  isVerified: boolean;
}

export interface VerificationResult {
  provider: 'prembly' | 'source_id' | 'smile_id' | 'manual';
  reference: string;
  confidence: number;
  status: 'passed' | 'failed' | 'requires_review';
  reason?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface OnboardingApplication {
  id: string;
  userId: string;
  type: 'individual' | 'business';
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'requires_info';
  currentStep: OnboardingStep;
  personalInfo?: PersonalInformation;
  addresses: Address[];
  identityDocuments: IdentityDocument[];
  businessInfo?: BusinessInformation;
  bankAccounts: BankAccount[];
  employmentInfo?: EmploymentInformation;
  nextOfKin?: NextOfKin;
  kycLevel: 'tier_1' | 'tier_2' | 'tier_3';
  complianceChecks: ComplianceCheck[];
  riskScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  rejectionReasons?: string[];
  reviewNotes?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  reviewedAt?: Date;
  approvedAt?: Date;
  expiresAt?: Date;
}

export type OnboardingStep = 
  | 'personal_info'
  | 'identity_verification'
  | 'address_verification'
  | 'business_info'
  | 'bank_account'
  | 'employment_info'
  | 'next_of_kin'
  | 'compliance_checks'
  | 'review'
  | 'completed';

export interface ComplianceCheck {
  type: 'aml' | 'sanctions' | 'pep' | 'adverse_media' | 'credit_bureau';
  status: 'pending' | 'passed' | 'failed' | 'requires_review';
  provider: string;
  reference?: string;
  result?: Record<string, any>;
  reason?: string;
  performedAt: Date;
}

export interface DocumentUpload {
  id: string;
  applicationId: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  extractedData?: Record<string, any>;
  ocrResult?: OcrResult;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  uploadedAt: Date;
  processedAt?: Date;
}

export interface OcrResult {
  provider: 'aws_textract' | 'google_vision' | 'azure_cognitive';
  confidence: number;
  extractedText: string;
  structuredData?: Record<string, any>;
  boundingBoxes?: Array<{
    text: string;
    confidence: number;
    coordinates: number[];
  }>;
}

export interface KycProvider {
  id: string;
  name: string;
  type: 'identity_verification' | 'address_verification' | 'business_verification' | 'aml_screening';
  country: string[];
  isActive: boolean;
  config: Record<string, any>;
  endpoints: {
    verify: string;
    status: string;
    webhook?: string;
  };
  credentials: {
    apiKey?: string;
    secretKey?: string;
    publicKey?: string;
  };
}

export interface OnboardingWorkflow {
  id: string;
  name: string;
  applicationType: 'individual' | 'business';
  kycLevel: 'tier_1' | 'tier_2' | 'tier_3';
  steps: OnboardingStep[];
  requiredDocuments: string[];
  autoApprovalRules?: AutoApprovalRule[];
  isActive: boolean;
  createdAt: Date;
}

export interface AutoApprovalRule {
  name: string;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
    value: any;
  }>;
  action: 'approve' | 'reject' | 'require_manual_review';
  priority: number;
}

export interface OnboardingStats {
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  averageProcessingTime: number;
  approvalRate: number;
  applicationsByStatus: Record<string, number>;
  applicationsByKycLevel: Record<string, number>;
  verificationSuccessRates: Record<string, number>;
}

export interface WebhookPayload {
  eventType: 'application.submitted' | 'application.approved' | 'application.rejected' | 'verification.completed';
  applicationId: string;
  userId: string;
  status: string;
  data: Record<string, any>;
  timestamp: Date;
}