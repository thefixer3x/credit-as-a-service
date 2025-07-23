import * as React from 'react';
import { cn } from '../../lib/utils.js';
import { Upload, Check, X, FileText, Camera } from 'lucide-react';

export interface KYCFormData {
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phoneNumber: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  documents: {
    idType: 'passport' | 'drivers_license' | 'national_id' | '';
    idNumber: string;
    idDocument?: File;
    proofOfAddress?: File;
    selfie?: File;
  };
  verification: {
    phoneVerified: boolean;
    emailVerified: boolean;
    documentsVerified: boolean;
  };
}

export interface KYCFormProps {
  initialData?: Partial<KYCFormData>;
  onSubmit: (data: KYCFormData) => void;
  onSave?: (data: Partial<KYCFormData>) => void;
  className?: string;
  isLoading?: boolean;
}

export function KYCForm({
  initialData,
  onSubmit,
  onSave,
  className,
  isLoading = false
}: KYCFormProps) {
  const [formData, setFormData] = React.useState<KYCFormData>({
    personalInfo: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phoneNumber: '',
      email: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      ...initialData?.personalInfo
    },
    documents: {
      idType: '',
      idNumber: '',
      ...initialData?.documents
    },
    verification: {
      phoneVerified: false,
      emailVerified: false,
      documentsVerified: false,
      ...initialData?.verification
    }
  });

  const [currentStep, setCurrentStep] = React.useState(1);
  const totalSteps = 3;

  const updatePersonalInfo = (field: keyof KYCFormData['personalInfo'], value: string) => {
    setFormData(prev => ({
      ...prev,
      personalInfo: {
        ...prev.personalInfo,
        [field]: value
      }
    }));
  };

  const updateDocuments = (field: keyof KYCFormData['documents'], value: any) => {
    setFormData(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [field]: value
      }
    }));
  };

  const handleFileUpload = (field: 'idDocument' | 'proofOfAddress' | 'selfie') => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      updateDocuments(field, file);
    }
  };

  const getStepStatus = (step: number) => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'current';
    return 'pending';
  };

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        const { firstName, lastName, dateOfBirth, phoneNumber, email } = formData.personalInfo;
        return !!(firstName && lastName && dateOfBirth && phoneNumber && email);
      case 2:
        const { idType, idNumber, idDocument } = formData.documents;
        return !!(idType && idNumber && idDocument);
      case 3:
        return !!(formData.documents.proofOfAddress && formData.documents.selfie);
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps && isStepValid(currentStep)) {
      setCurrentStep(prev => prev + 1);
      onSave?.(formData);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStepValid(currentStep)) {
      onSubmit(formData);
    }
  };

  return (
    <div className={cn('max-w-2xl mx-auto p-6 bg-white rounded-xl border shadow-sm', className)}>
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
            const status = getStepStatus(step);
            return (
              <div key={step} className="flex items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  status === 'completed' && 'bg-green-600 text-white',
                  status === 'current' && 'bg-blue-600 text-white',
                  status === 'pending' && 'bg-gray-200 text-gray-600'
                )}>
                  {status === 'completed' ? <Check className="w-4 h-4" /> : step}
                </div>
                {step < totalSteps && (
                  <div className={cn(
                    'w-12 h-0.5 mx-2',
                    step < currentStep ? 'bg-green-600' : 'bg-gray-200'
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-sm text-center text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Personal Information */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Personal Information</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.personalInfo.firstName}
                  onChange={(e) => updatePersonalInfo('firstName', e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.personalInfo.lastName}
                  onChange={(e) => updatePersonalInfo('lastName', e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth *</label>
                <input
                  type="date"
                  value={formData.personalInfo.dateOfBirth}
                  onChange={(e) => updatePersonalInfo('dateOfBirth', e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={formData.personalInfo.phoneNumber}
                  onChange={(e) => updatePersonalInfo('phoneNumber', e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email Address *</label>
              <input
                type="email"
                value={formData.personalInfo.email}
                onChange={(e) => updatePersonalInfo('email', e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>
        )}

        {/* Step 2: Identity Documents */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Identity Verification</h2>
            
            <div>
              <label className="block text-sm font-medium mb-1">ID Type *</label>
              <select
                value={formData.documents.idType}
                onChange={(e) => updateDocuments('idType', e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select ID Type</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="national_id">National ID</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">ID Number *</label>
              <input
                type="text"
                value={formData.documents.idNumber}
                onChange={(e) => updateDocuments('idNumber', e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Upload ID Document *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload('idDocument')}
                  className="hidden"
                  id="idDocument"
                />
                <label htmlFor="idDocument" className="cursor-pointer">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {formData.documents.idDocument ? formData.documents.idDocument.name : 'Click to upload'}
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Additional Verification */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Additional Verification</h2>
            
            <div>
              <label className="block text-sm font-medium mb-1">Proof of Address *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload('proofOfAddress')}
                  className="hidden"
                  id="proofOfAddress"
                />
                <label htmlFor="proofOfAddress" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {formData.documents.proofOfAddress ? formData.documents.proofOfAddress.name : 'Upload utility bill or bank statement'}
                  </p>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Selfie Verification *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload('selfie')}
                  className="hidden"
                  id="selfie"
                />
                <label htmlFor="selfie" className="cursor-pointer">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {formData.documents.selfie ? formData.documents.selfie.name : 'Take a clear photo of yourself'}
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6 border-t">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={cn(
              'px-4 py-2 rounded-md font-medium',
              currentStep === 1
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:text-gray-800'
            )}
          >
            Previous
          </button>

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid(currentStep) || isLoading}
              className={cn(
                'px-6 py-2 rounded-md font-medium',
                isStepValid(currentStep) && !isLoading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              )}
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={!isStepValid(currentStep) || isLoading}
              className={cn(
                'px-6 py-2 rounded-md font-medium flex items-center space-x-2',
                isStepValid(currentStep) && !isLoading
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit KYC</span>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default KYCForm;