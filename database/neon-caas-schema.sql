-- Credit-as-a-Service Platform - Neon Database Schema
-- This schema integrates with The Fixer Initiative's payment infrastructure
-- Primary use: Analytics, audit trails, and specialized credit services data

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schemas for organization
CREATE SCHEMA IF NOT EXISTS caas_core;
CREATE SCHEMA IF NOT EXISTS caas_analytics;
CREATE SCHEMA IF NOT EXISTS caas_audit;

-- Set search path
SET search_path TO caas_core, public;

-- =====================================================
-- CORE CREDIT SERVICE TABLES
-- =====================================================

-- Credit applications (comprehensive tracking)
CREATE TABLE caas_core.credit_applications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    reference_id VARCHAR(100) UNIQUE NOT NULL,
    client_reference VARCHAR(100) NOT NULL, -- Links to Supabase user
    
    -- Application details
    application_type VARCHAR(50) NOT NULL CHECK (application_type IN ('personal', 'business', 'asset_finance')),
    requested_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    loan_purpose TEXT,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'under_review', 'approved', 'rejected', 
        'disbursed', 'active', 'completed', 'defaulted'
    )),
    
    -- Credit provider assignment
    assigned_provider_id UUID,
    provider_score DECIMAL(5,2), -- AI-generated provider matching score
    competitive_bidding BOOLEAN DEFAULT false,
    
    -- Risk assessment (from existing Fixer Initiative ML services)
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 850),
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
    risk_factors JSONB,
    
    -- Documents and verification
    documents_submitted JSONB DEFAULT '[]',
    verification_status VARCHAR(50) DEFAULT 'pending',
    kyc_completed BOOLEAN DEFAULT false,
    
    -- Financial details
    applicant_income DECIMAL(15,2),
    debt_to_income_ratio DECIMAL(5,2),
    credit_history_length INTEGER, -- months
    existing_credit_accounts INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    disbursed_at TIMESTAMP WITH TIME ZONE
);

-- Credit providers (extends Fixer Initiative vendor management)
CREATE TABLE caas_core.credit_providers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    
    -- Provider details
    provider_type VARCHAR(50) CHECK (provider_type IN ('bank', 'fintech', 'microfinance', 'p2p_lending')),
    license_number VARCHAR(100),
    regulatory_body VARCHAR(100),
    
    -- API integration
    api_endpoint TEXT,
    webhook_url TEXT,
    integration_type VARCHAR(50) CHECK (integration_type IN ('direct_api', 'webhook', 'manual')),
    api_credentials_encrypted TEXT, -- Encrypted JSON
    
    -- Credit criteria
    min_loan_amount DECIMAL(15,2),
    max_loan_amount DECIMAL(15,2),
    supported_currencies VARCHAR(50)[] DEFAULT '{NGN}',
    min_credit_score INTEGER,
    max_processing_days INTEGER,
    
    -- Performance metrics
    approval_rate DECIMAL(5,2),
    average_processing_time_hours INTEGER,
    default_rate DECIMAL(5,2),
    customer_satisfaction_score DECIMAL(3,2),
    
    -- Business terms
    interest_rate_range NUMRANGE,
    platform_commission_percentage DECIMAL(5,2) DEFAULT 8.5,
    revenue_share_model VARCHAR(50) DEFAULT 'percentage',
    
    -- Geographic coverage
    service_regions VARCHAR(50)[] DEFAULT '{NG}',
    
    -- Status and compliance
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    compliance_verified BOOLEAN DEFAULT false,
    last_compliance_check TIMESTAMP WITH TIME ZONE,
    
    -- Integration metadata
    onboarded_by UUID, -- Admin user ID
    technical_contact_email VARCHAR(255),
    business_contact_email VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider bidding system
CREATE TABLE caas_core.provider_bids (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    application_id UUID REFERENCES caas_core.credit_applications(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES caas_core.credit_providers(id) ON DELETE CASCADE,
    
    -- Bid details
    offered_amount DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    processing_fee DECIMAL(10,2) DEFAULT 0,
    loan_term_months INTEGER NOT NULL,
    
    -- Bid conditions
    conditions JSONB,
    collateral_required BOOLEAN DEFAULT false,
    guarantor_required BOOLEAN DEFAULT false,
    
    -- Bid status
    bid_status VARCHAR(20) DEFAULT 'submitted' CHECK (bid_status IN (
        'submitted', 'reviewed', 'accepted', 'rejected', 'withdrawn'
    )),
    
    -- Auto-scoring
    bid_score DECIMAL(5,2), -- AI-generated competitiveness score
    ranking INTEGER, -- Rank among all bids for this application
    
    -- Response times
    bid_submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    provider_response_time_minutes INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(application_id, provider_id)
);

-- Credit disbursements and repayments
CREATE TABLE caas_core.credit_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    application_id UUID REFERENCES caas_core.credit_applications(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES caas_core.credit_providers(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(20) CHECK (transaction_type IN ('disbursement', 'repayment', 'fee', 'penalty')),
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    
    -- Payment gateway integration (leverages Fixer Initiative)
    payment_reference VARCHAR(100) UNIQUE NOT NULL,
    gateway_provider VARCHAR(50), -- 'paystack', 'stripe', 'sayswitch'
    gateway_transaction_id VARCHAR(100),
    
    -- Status
    transaction_status VARCHAR(20) DEFAULT 'pending' CHECK (transaction_status IN (
        'pending', 'processing', 'completed', 'failed', 'reversed'
    )),
    
    -- Platform fees
    platform_fee_amount DECIMAL(10,2),
    platform_fee_percentage DECIMAL(5,2),
    
    -- Reconciliation
    reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- ANALYTICS SCHEMA
-- =====================================================

-- Provider performance analytics
CREATE TABLE caas_analytics.provider_performance_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_id UUID REFERENCES caas_core.credit_providers(id) ON DELETE CASCADE,
    
    -- Time period
    metric_date DATE NOT NULL,
    period_type VARCHAR(20) CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Volume metrics
    applications_received INTEGER DEFAULT 0,
    applications_approved INTEGER DEFAULT 0,
    applications_rejected INTEGER DEFAULT 0,
    total_amount_disbursed DECIMAL(15,2) DEFAULT 0,
    
    -- Performance metrics
    approval_rate DECIMAL(5,2),
    average_processing_hours DECIMAL(8,2),
    customer_complaints INTEGER DEFAULT 0,
    
    -- Financial metrics
    platform_revenue_generated DECIMAL(12,2) DEFAULT 0,
    provider_fees_collected DECIMAL(12,2) DEFAULT 0,
    
    -- Quality metrics
    default_rate DECIMAL(5,2),
    early_repayment_rate DECIMAL(5,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider_id, metric_date, period_type)
);

-- Application flow analytics
CREATE TABLE caas_analytics.application_flow_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Time period
    metric_date DATE NOT NULL,
    
    -- Flow metrics
    applications_submitted INTEGER DEFAULT 0,
    applications_under_review INTEGER DEFAULT 0,
    applications_approved INTEGER DEFAULT 0,
    applications_rejected INTEGER DEFAULT 0,
    applications_disbursed INTEGER DEFAULT 0,
    
    -- Conversion rates
    review_to_approval_rate DECIMAL(5,2),
    approval_to_disbursement_rate DECIMAL(5,2),
    overall_conversion_rate DECIMAL(5,2),
    
    -- Average amounts
    average_requested_amount DECIMAL(12,2),
    average_approved_amount DECIMAL(12,2),
    
    -- Processing times
    average_review_time_hours DECIMAL(8,2),
    average_approval_to_disbursement_hours DECIMAL(8,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(metric_date)
);

-- =====================================================
-- AUDIT SCHEMA
-- =====================================================

-- Comprehensive audit trail
CREATE TABLE caas_audit.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Who performed the action
    actor_type VARCHAR(20) CHECK (actor_type IN ('user', 'admin', 'system', 'provider')),
    actor_id VARCHAR(100), -- User ID or system identifier
    actor_email VARCHAR(255),
    
    -- What was done
    action_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    
    -- Action details
    description TEXT,
    changes JSONB, -- Before and after values
    metadata JSONB, -- Additional context
    
    -- When and where
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    
    -- Risk assessment of action
    risk_level VARCHAR(10) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    
    -- Compliance flags
    pci_relevant BOOLEAN DEFAULT false,
    gdpr_relevant BOOLEAN DEFAULT false,
    regulatory_relevant BOOLEAN DEFAULT false
);

-- Data access logs for compliance
CREATE TABLE caas_audit.data_access_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Access details
    accessor_type VARCHAR(20) CHECK (accessor_type IN ('user', 'admin', 'system', 'api')),
    accessor_id VARCHAR(100),
    
    -- Data accessed
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100),
    query_type VARCHAR(20) CHECK (query_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
    
    -- Context
    purpose VARCHAR(100), -- Why was data accessed
    request_id VARCHAR(100), -- Link to application request
    
    -- Sensitive data flags
    contains_pii BOOLEAN DEFAULT false,
    contains_financial_data BOOLEAN DEFAULT false,
    
    -- Timestamps
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Compliance tracking
    retention_period_days INTEGER DEFAULT 2555, -- 7 years
    
    INDEX (accessed_at),
    INDEX (accessor_id),
    INDEX (table_name)
);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_credit_applications_updated_at BEFORE UPDATE ON caas_core.credit_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_providers_updated_at BEFORE UPDATE ON caas_core.credit_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_provider_bids_updated_at BEFORE UPDATE ON caas_core.provider_bids FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_transactions_updated_at BEFORE UPDATE ON caas_core.credit_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit logging trigger function
CREATE OR REPLACE FUNCTION log_data_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO caas_audit.activity_logs (
        actor_type, actor_id, action_type, resource_type, resource_id,
        description, changes, timestamp
    ) VALUES (
        'system',
        current_setting('caas.current_user_id', true),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        'Database ' || TG_OP || ' operation',
        CASE 
            WHEN TG_OP = 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
            WHEN TG_OP = 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW))
            ELSE jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
        END,
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_credit_applications AFTER INSERT OR UPDATE OR DELETE ON caas_core.credit_applications FOR EACH ROW EXECUTE FUNCTION log_data_changes();
CREATE TRIGGER audit_credit_providers AFTER INSERT OR UPDATE OR DELETE ON caas_core.credit_providers FOR EACH ROW EXECUTE FUNCTION log_data_changes();
CREATE TRIGGER audit_credit_transactions AFTER INSERT OR UPDATE OR DELETE ON caas_core.credit_transactions FOR EACH ROW EXECUTE FUNCTION log_data_changes();

-- =====================================================
-- INTEGRATION FUNCTIONS
-- =====================================================

-- Function to sync payment data from Fixer Initiative
CREATE OR REPLACE FUNCTION sync_payment_to_caas(
    p_reference VARCHAR(100),
    p_client_reference VARCHAR(100),
    p_gateway VARCHAR(50),
    p_transaction_type VARCHAR(20),
    p_amount DECIMAL(15,2),
    p_status VARCHAR(20),
    p_gateway_data JSONB
)
RETURNS UUID AS $$
DECLARE
    transaction_id UUID;
BEGIN
    INSERT INTO caas_core.credit_transactions (
        payment_reference,
        application_id,
        transaction_type,
        amount,
        gateway_provider,
        gateway_transaction_id,
        transaction_status,
        created_at
    ) VALUES (
        p_reference,
        (SELECT id FROM caas_core.credit_applications WHERE client_reference = p_client_reference LIMIT 1),
        p_transaction_type,
        p_amount,
        p_gateway,
        p_gateway_data->>'transaction_id',
        p_status,
        NOW()
    )
    ON CONFLICT (payment_reference) 
    DO UPDATE SET
        transaction_status = EXCLUDED.transaction_status,
        updated_at = NOW()
    RETURNING id INTO transaction_id;
    
    RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Provider matching algorithm function
CREATE OR REPLACE FUNCTION match_providers_for_application(
    p_application_id UUID,
    p_max_providers INTEGER DEFAULT 5
)
RETURNS TABLE (
    provider_id UUID,
    match_score DECIMAL(5,2),
    recommended_terms JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH application_details AS (
        SELECT requested_amount, risk_score, application_type
        FROM caas_core.credit_applications 
        WHERE id = p_application_id
    ),
    provider_matches AS (
        SELECT 
            cp.id,
            cp.provider_code,
            -- Scoring algorithm
            (
                CASE 
                    WHEN ad.requested_amount BETWEEN cp.min_loan_amount AND cp.max_loan_amount THEN 30
                    ELSE 0
                END +
                CASE 
                    WHEN ad.risk_score >= cp.min_credit_score THEN 25
                    ELSE 0
                END +
                (cp.approval_rate * 0.2) +
                (100 - cp.default_rate) * 0.15 +
                cp.customer_satisfaction_score * 10
            ) as score,
            jsonb_build_object(
                'suggested_interest_rate', (cp.interest_rate_range).lower + (cp.interest_rate_range).upper) / 2,
                'max_amount', LEAST(cp.max_loan_amount, ad.requested_amount * 1.2),
                'processing_time_days', cp.max_processing_days
            ) as terms
        FROM caas_core.credit_providers cp
        CROSS JOIN application_details ad
        WHERE cp.status = 'active'
          AND ad.requested_amount >= cp.min_loan_amount
          AND ad.requested_amount <= cp.max_loan_amount
          AND ad.risk_score >= cp.min_credit_score
    )
    SELECT pm.id, pm.score, pm.terms
    FROM provider_matches pm
    ORDER BY pm.score DESC
    LIMIT p_max_providers;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Credit applications indexes
CREATE INDEX idx_credit_applications_status ON caas_core.credit_applications(status);
CREATE INDEX idx_credit_applications_client_ref ON caas_core.credit_applications(client_reference);
CREATE INDEX idx_credit_applications_provider ON caas_core.credit_applications(assigned_provider_id);
CREATE INDEX idx_credit_applications_created_at ON caas_core.credit_applications(created_at);

-- Credit providers indexes
CREATE INDEX idx_credit_providers_status ON caas_core.credit_providers(status);
CREATE INDEX idx_credit_providers_type ON caas_core.credit_providers(provider_type);
CREATE INDEX idx_credit_providers_regions ON caas_core.credit_providers USING GIN(service_regions);

-- Transactions indexes
CREATE INDEX idx_credit_transactions_reference ON caas_core.credit_transactions(payment_reference);
CREATE INDEX idx_credit_transactions_status ON caas_core.credit_transactions(transaction_status);
CREATE INDEX idx_credit_transactions_application ON caas_core.credit_transactions(application_id);
CREATE INDEX idx_credit_transactions_created_at ON caas_core.credit_transactions(created_at);

-- Analytics indexes
CREATE INDEX idx_provider_metrics_date ON caas_analytics.provider_performance_metrics(metric_date);
CREATE INDEX idx_provider_metrics_provider ON caas_analytics.provider_performance_metrics(provider_id);

-- Audit indexes
CREATE INDEX idx_activity_logs_timestamp ON caas_audit.activity_logs(timestamp);
CREATE INDEX idx_activity_logs_actor ON caas_audit.activity_logs(actor_id);
CREATE INDEX idx_activity_logs_resource ON caas_audit.activity_logs(resource_type, resource_id);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default admin provider management configuration
INSERT INTO caas_core.credit_providers (
    provider_code,
    company_name,
    provider_type,
    min_loan_amount,
    max_loan_amount,
    supported_currencies,
    min_credit_score,
    max_processing_days,
    platform_commission_percentage,
    status,
    created_at
) VALUES 
(
    'CAAS_INTERNAL',
    'CaaS Internal Credit Assessment',
    'fintech',
    50000.00,
    10000000.00,
    '{NGN,USD}',
    300,
    3,
    8.5,
    'active',
    NOW()
);

-- Grant permissions for application access
GRANT USAGE ON SCHEMA caas_core TO PUBLIC;
GRANT USAGE ON SCHEMA caas_analytics TO PUBLIC;
GRANT SELECT ON SCHEMA caas_audit TO PUBLIC; -- Audit is read-only for apps

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA caas_core TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA caas_analytics TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA caas_audit TO PUBLIC;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA caas_core TO PUBLIC;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA caas_analytics TO PUBLIC;

-- Schema deployment completed
SELECT 'CaaS Neon Database Schema Deployed Successfully' as status;