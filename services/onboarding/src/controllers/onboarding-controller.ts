import { Request, Response } from 'express';
import pino from 'pino';
import { z } from 'zod';
import multer from 'multer';

import { OnboardingEngine } from '../services/onboarding-engine.js';
import type { 
  PersonalInformation,
  BusinessInformation,
  Address,
  IdentityDocument,
  BankAccount,
  EmploymentInformation,
  NextOfKin 
} from '../types/onboarding.js';

const logger = pino({ name: 'onboarding-controller' });

// Validation schemas
const personalInfoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  dateOfBirth: z.string().transform(str => new Date(str)),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  nationality: z.string().min(2),
  countryOfBirth: z.string().min(2),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']),
  email: z.string().email(),
  phoneNumber: z.string().min(10),
  alternatePhoneNumber: z.string().optional()
});

const businessInfoSchema = z.object({
  businessName: z.string().min(1),
  registrationNumber: z.string().min(1),
  taxId: z.string().optional(),
  businessType: z.enum(['sole_proprietorship', 'partnership', 'corporation', 'llc', 'ngo', 'other']),
  industry: z.string().min(1),
  yearEstablished: z.number().min(1800),
  numberOfEmployees: z.number().min(1),
  annualRevenue: z.number().optional(),
  website: z.string().url().optional(),
  description: z.string().min(10),
  registrationCertificateUrl: z.string().url().optional(),
  taxCertificateUrl: z.string().url().optional(),
  articlesOfIncorporationUrl: z.string().url().optional(),
  isVerified: z.boolean(),
  verificationStatus: z.enum(['pending', 'verified', 'failed']),
  verifiedAt: z.string().transform(str => new Date(str)).optional()
});

const addressSchema = z.object({
  type: z.enum(['residential', 'business', 'mailing']),
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2),
  verificationMethod: z.enum(['utility_bill', 'bank_statement', 'government_mail']).optional()
});

const identityDocumentSchema = z.object({
  type: z.enum(['national_id', 'drivers_license', 'passport', 'voters_card', 'nin_slip']),
  number: z.string().min(1),
  issuingCountry: z.string().min(2),
  issuingAuthority: z.string().optional(),
  issueDate: z.string().transform(str => new Date(str)),
  expiryDate: z.string().transform(str => new Date(str)).optional(),
  frontImageUrl: z.string().url().optional(),
  backImageUrl: z.string().url().optional()
});

const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountName: z.string().min(1),
  bankCode: z.string().min(1),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  currency: z.string().min(3),
  accountType: z.enum(['checking', 'savings', 'business', 'current'])
});

const employmentInfoSchema = z.object({
  status: z.enum(['employed', 'self_employed', 'unemployed', 'student', 'retired']),
  employerName: z.string().optional(),
  jobTitle: z.string().optional(),
  workEmail: z.string().email().optional(),
  monthlyIncome: z.number().optional(),
  annualIncome: z.number().optional(),
  employmentStartDate: z.string().transform(str => new Date(str)).optional(),
  industryType: z.string().optional(),
  employmentLetterUrl: z.string().url().optional(),
  payslipUrl: z.string().url().optional(),
  isVerified: z.boolean(),
  verificationStatus: z.enum(['pending', 'verified', 'failed']),
  verifiedAt: z.string().transform(str => new Date(str)).optional()
});

const nextOfKinSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.enum(['spouse', 'parent', 'sibling', 'child', 'friend', 'colleague', 'other']),
  phoneNumber: z.string().min(10),
  email: z.string().email().optional(),
  address: addressSchema,
  isVerified: z.boolean()
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
    }
  }
});

export class OnboardingController {
  private onboardingEngine: OnboardingEngine;

  constructor(onboardingEngine: OnboardingEngine) {
    this.onboardingEngine = onboardingEngine;
  }

  /**
   * Create new onboarding application
   */
  async createApplication(req: Request, res: Response): Promise<void> {
    try {
      const { type, kycLevel } = req.body;
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      if (!type || !['individual', 'business'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Valid application type (individual/business) is required'
        });
        return;
      }

      const application = await this.onboardingEngine.createApplication(
        userId,
        type,
        kycLevel || 'tier_1'
      );

      res.status(201).json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error }, 'Failed to create application');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get application by ID
   */
  async getApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Application ID is required'
        });
        return;
      }

      const application = await this.onboardingEngine.getApplication(id);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to get application');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Update personal information
   */
  async updatePersonalInfo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = personalInfoSchema.parse(req.body);

      const application = await this.onboardingEngine.updatePersonalInfo(id, validatedData);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to update personal info');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Update business information
   */
  async updateBusinessInfo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = businessInfoSchema.parse(req.body);

      const application = await this.onboardingEngine.updateBusinessInfo(id, validatedData);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to update business info');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Add address
   */
  async addAddress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = addressSchema.parse(req.body);

      const application = await this.onboardingEngine.addAddress(id, validatedData);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to add address');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Add identity document
   */
  async addIdentityDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = identityDocumentSchema.parse(req.body);

      const application = await this.onboardingEngine.addIdentityDocument(id, validatedData);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to add identity document');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Add bank account
   */
  async addBankAccount(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = bankAccountSchema.parse(req.body);

      const application = await this.onboardingEngine.addBankAccount(id, validatedData);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to add bank account');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Submit application
   */
  async submitApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const application = await this.onboardingEngine.submitApplication(id);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to submit application');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Approve application (admin only)
   */
  async approveApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        res.status(401).json({
          success: false,
          error: 'Reviewer authentication required'
        });
        return;
      }

      const application = await this.onboardingEngine.approveApplication(id, reviewerId, notes);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to approve application');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Reject application (admin only)
   */
  async rejectApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reasons, notes } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        res.status(401).json({
          success: false,
          error: 'Reviewer authentication required'
        });
        return;
      }

      if (!reasons || !Array.isArray(reasons) || reasons.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Rejection reasons are required'
        });
        return;
      }

      const application = await this.onboardingEngine.rejectApplication(id, reviewerId, reasons, notes);

      if (!application) {
        res.status(404).json({
          success: false,
          error: 'Application not found'
        });
        return;
      }

      res.json({
        success: true,
        data: application
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to reject application');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Upload document
   */
  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { documentType } = req.body;

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'File is required'
        });
        return;
      }

      if (!documentType) {
        res.status(400).json({
          success: false,
          error: 'Document type is required'
        });
        return;
      }

      const document = await this.onboardingEngine.uploadDocument(id, documentType, {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
      });

      res.status(201).json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error({ error, applicationId: req.params.id }, 'Failed to upload document');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get application statistics (admin only)
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { from, to } = req.query;

      let dateRange;
      if (from && to) {
        dateRange = {
          from: new Date(from as string),
          to: new Date(to as string)
        };
      }

      const stats = await this.onboardingEngine.getStats(dateRange);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get onboarding stats');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Health check
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          service: 'onboarding',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0'
        }
      });
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      res.status(503).json({
        success: false,
        error: 'Service unhealthy'
      });
    }
  }

  /**
   * Get upload middleware
   */
  getUploadMiddleware() {
    return upload.single('document');
  }
}