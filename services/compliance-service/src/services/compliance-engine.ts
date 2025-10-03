import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import crypto from 'crypto';

// KYC/AML schemas
export const KYCDocumentSchema = z.object({
  type: z.enum(['passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement']),
  documentNumber: z.string().min(1),
  issuingCountry: z.string().length(2),
  expiryDate: z.string().optional(),
  fileUrl: z.string().url(),
  uploadedAt: z.date(),
});

export const KYCApplicationSchema = z.object({
  userId: z.string().uuid(),
  personalInfo: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nationality: z.string().length(2),
    address: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().length(2),
    }),
    phoneNumber: z.string().min(10),
    email: z.string().email(),
  }),
  documents: z.array(KYCDocumentSchema),
  businessInfo: z.object({
    businessName: z.string().optional(),
    businessType: z.string().optional(),
    registrationNumber: z.string().optional(),
    taxId: z.string().optional(),
    businessAddress: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().length(2),
    }).optional(),
  }).optional(),
});

export const AMLCheckResultSchema = z.object({
  checkId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(['clean', 'hit', 'pending', 'error']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  matchedLists: z.array(z.string()),
  details: z.string().optional(),
  checkedAt: z.date(),
  expiresAt: z.date(),
});

export const ComplianceResultSchema = z.object({
  complianceId: z.string().uuid(),
  userId: z.string().uuid(),
  kycStatus: z.enum(['pending', 'in_progress', 'approved', 'rejected']),
  amlStatus: z.enum(['pending', 'clean', 'hit', 'error']),
  overallStatus: z.enum(['compliant', 'non_compliant', 'pending']),
  riskScore: z.number().min(0).max(100),
  requirements: z.array(z.string()),
  nextSteps: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type KYCApplication = z.infer<typeof KYCApplicationSchema>;
export type KYCDocument = z.infer<typeof KYCDocumentSchema>;
export type AMLCheckResult = z.infer<typeof AMLCheckResultSchema>;
export type ComplianceResult = z.infer<typeof ComplianceResultSchema>;

export class ComplianceEngine {
  private logger: pino.Logger;
  private sanctionsLists: string[] = [
    'OFAC', 'UN', 'EU', 'UK', 'Canada', 'Australia'
  ];

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  async processKYCApplication(application: KYCApplication): Promise<ComplianceResult> {
    this.logger.info({ userId: application.userId }, 'Processing KYC application');

    try {
      const validatedApp = KYCApplicationSchema.parse(application);
      
      // Process KYC verification
      const kycStatus = await this.verifyKYC(validatedApp);
      
      // Perform AML screening
      const amlResult = await this.performAMLCheck(validatedApp);
      
      // Calculate overall compliance status
      const overallStatus = this.calculateOverallStatus(kycStatus, amlResult.status);
      const riskScore = this.calculateRiskScore(validatedApp, amlResult);
      
      // Generate requirements and next steps
      const requirements = this.generateRequirements(kycStatus, amlResult.status);
      const nextSteps = this.generateNextSteps(kycStatus, amlResult.status);

      const result: ComplianceResult = {
        complianceId: uuidv4(),
        userId: validatedApp.userId,
        kycStatus,
        amlStatus: amlResult.status,
        overallStatus,
        riskScore,
        requirements,
        nextSteps,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.logger.info(
        { 
          complianceId: result.complianceId, 
          userId: result.userId, 
          overallStatus,
          riskScore 
        }, 
        'KYC application processed'
      );

      return result;

    } catch (error) {
      this.logger.error({ error, userId: application.userId }, 'KYC processing failed');
      throw new Error('KYC processing failed');
    }
  }

  private async verifyKYC(application: KYCApplication): Promise<'pending' | 'in_progress' | 'approved' | 'rejected'> {
    const { personalInfo, documents } = application;
    
    // Check if all required documents are present
    const requiredDocs = ['passport', 'utility_bill'];
    const providedDocs = documents.map(doc => doc.type);
    const hasAllDocs = requiredDocs.every(doc => providedDocs.includes(doc as any));
    
    if (!hasAllDocs) {
      return 'pending';
    }

    // Simulate document verification process
    const verificationScore = this.verifyDocuments(documents);
    
    if (verificationScore >= 80) {
      return 'approved';
    } else if (verificationScore >= 60) {
      return 'in_progress';
    } else {
      return 'rejected';
    }
  }

  private verifyDocuments(documents: KYCDocument[]): number {
    let score = 0;
    
    documents.forEach(doc => {
      // Basic document validation
      if (doc.documentNumber && doc.documentNumber.length > 0) {
        score += 20;
      }
      
      if (doc.issuingCountry && doc.issuingCountry.length === 2) {
        score += 20;
      }
      
      if (doc.fileUrl && doc.fileUrl.startsWith('http')) {
        score += 20;
      }
      
      // Check expiry date for ID documents
      if (['passport', 'drivers_license', 'national_id'].includes(doc.type)) {
        if (doc.expiryDate) {
          const expiry = new Date(doc.expiryDate);
          const now = new Date();
          if (expiry > now) {
            score += 20;
          }
        }
      } else {
        // For non-ID documents, just check if they exist
        score += 20;
      }
    });
    
    return Math.min(100, score);
  }

  private async performAMLCheck(application: KYCApplication): Promise<AMLCheckResult> {
    const { personalInfo } = application;
    
    // Simulate AML screening against various lists
    const matchedLists: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    
    // Check against sanctions lists
    for (const list of this.sanctionsLists) {
      const isMatch = await this.checkSanctionsList(personalInfo, list);
      if (isMatch) {
        matchedLists.push(list);
        riskLevel = 'high';
      }
    }
    
    // Check for PEP (Politically Exposed Person) status
    const isPEP = await this.checkPEPStatus(personalInfo);
    if (isPEP) {
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    }
    
    // Check for adverse media
    const hasAdverseMedia = await this.checkAdverseMedia(personalInfo);
    if (hasAdverseMedia) {
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    }

    const status = matchedLists.length > 0 ? 'hit' : 'clean';

    return {
      checkId: uuidv4(),
      userId: application.userId,
      status,
      riskLevel,
      matchedLists,
      details: matchedLists.length > 0 ? `Matched against: ${matchedLists.join(', ')}` : undefined,
      checkedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };
  }

  private async checkSanctionsList(personalInfo: any, listName: string): Promise<boolean> {
    // Simulate API call to sanctions list
    // In real implementation, this would call external APIs
    const fullName = `${personalInfo.firstName} ${personalInfo.lastName}`.toLowerCase();
    
    // Mock some common names that might be on sanctions lists
    const mockSanctionsNames = [
      'john doe',
      'jane smith',
      'mohammed ali',
    ];
    
    return mockSanctionsNames.includes(fullName);
  }

  private async checkPEPStatus(personalInfo: any): Promise<boolean> {
    // Simulate PEP check
    // In real implementation, this would call PEP databases
    const fullName = `${personalInfo.firstName} ${personalInfo.lastName}`.toLowerCase();
    
    // Mock some PEP names
    const mockPEPNames = [
      'president johnson',
      'minister smith',
      'senator brown',
    ];
    
    return mockPEPNames.some(name => fullName.includes(name));
  }

  private async checkAdverseMedia(personalInfo: any): Promise<boolean> {
    // Simulate adverse media check
    // In real implementation, this would call media monitoring services
    const fullName = `${personalInfo.firstName} ${personalInfo.lastName}`.toLowerCase();
    
    // Mock some names that might have adverse media
    const mockAdverseNames = [
      'criminal johnson',
      'fraud smith',
      'scam brown',
    ];
    
    return mockAdverseNames.some(name => fullName.includes(name));
  }

  private calculateOverallStatus(
    kycStatus: string, 
    amlStatus: string
  ): 'compliant' | 'non_compliant' | 'pending' {
    if (kycStatus === 'approved' && amlStatus === 'clean') {
      return 'compliant';
    } else if (kycStatus === 'rejected' || amlStatus === 'hit') {
      return 'non_compliant';
    } else {
      return 'pending';
    }
  }

  private calculateRiskScore(application: KYCApplication, amlResult: AMLCheckResult): number {
    let score = 0;
    
    // Base score
    score += 20;
    
    // Document completeness
    const docCount = application.documents.length;
    if (docCount >= 3) score += 20;
    else if (docCount >= 2) score += 10;
    
    // AML result
    if (amlResult.status === 'clean') score += 30;
    else if (amlResult.status === 'hit') score += 0;
    else score += 15;
    
    // PEP status
    if (amlResult.riskLevel === 'low') score += 20;
    else if (amlResult.riskLevel === 'medium') score += 10;
    else score += 0;
    
    // Business info (if provided)
    if (application.businessInfo) {
      score += 10;
    }
    
    return Math.min(100, score);
  }

  private generateRequirements(kycStatus: string, amlStatus: string): string[] {
    const requirements: string[] = [];
    
    if (kycStatus === 'pending') {
      requirements.push('Submit required identity documents');
      requirements.push('Provide proof of address');
    }
    
    if (kycStatus === 'in_progress') {
      requirements.push('Additional verification in progress');
    }
    
    if (amlStatus === 'hit') {
      requirements.push('Manual review required due to AML hit');
    }
    
    if (amlStatus === 'pending') {
      requirements.push('AML screening in progress');
    }
    
    return requirements;
  }

  private generateNextSteps(kycStatus: string, amlStatus: string): string[] {
    const nextSteps: string[] = [];
    
    if (kycStatus === 'pending') {
      nextSteps.push('Upload missing documents');
      nextSteps.push('Complete identity verification');
    }
    
    if (kycStatus === 'in_progress') {
      nextSteps.push('Wait for verification completion');
    }
    
    if (amlStatus === 'hit') {
      nextSteps.push('Contact compliance team for manual review');
    }
    
    if (kycStatus === 'approved' && amlStatus === 'clean') {
      nextSteps.push('Compliance verification complete');
      nextSteps.push('Proceed with credit application');
    }
    
    return nextSteps;
  }
}
