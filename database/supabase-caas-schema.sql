-- Credit-as-a-Service Platform - Supabase Database Schema
-- This schema handles real-time client operations and integrates with The Fixer Initiative
-- Primary use: Real-time user interactions, notifications, and lightweight transactions

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security globally
ALTER DATABASE postgres SET row_security = on;

-- =====================================================
-- REAL-TIME CLIENT OPERATIONS TABLES
-- =====================================================

-- User profiles (lightweight, real-time focused)
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    
    -- Basic profile info
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    phone_number VARCHAR(20),
    
    -- User preferences
    preferred_currency VARCHAR(3) DEFAULT 'NGN',
    notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "push": true}',
    language_preference VARCHAR(10) DEFAULT 'en',
    
    -- Profile status
    profile_completed BOOLEAN DEFAULT false,
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'in_progress', 'completed', 'rejected')),
    risk_profile VARCHAR(20) DEFAULT 'unassessed',
    
    -- Quick reference data (synced from Neon)
    active_applications INTEGER DEFAULT 0,
    total_credit_limit DECIMAL(15,2) DEFAULT 0,
    current_debt DECIMAL(15,2) DEFAULT 0,
    
    -- Real-time status
    online_status BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization profiles (for business applications)
CREATE TABLE public.organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    owner_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Organization details
    business_name VARCHAR(200) NOT NULL,
    business_type VARCHAR(50),
    registration_number VARCHAR(100),
    tax_id VARCHAR(100),
    
    -- Contact information
    business_email VARCHAR(255),
    business_phone VARCHAR(20),
    business_address JSONB,
    
    -- Business metrics (cached from Neon)
    annual_revenue DECIMAL(15,2),
    years_in_operation INTEGER,
    employee_count INTEGER,
    
    -- Verification status
    verification_status VARCHAR(20) DEFAULT 'pending',
    documents_submitted BOOLEAN DEFAULT false,
    
    -- Quick stats
    active_credit_lines INTEGER DEFAULT 0,
    total_business_limit DECIMAL(15,2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time application status (lightweight version of Neon applications)
CREATE TABLE public.application_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    
    -- Reference to full application in Neon
    neon_application_id UUID NOT NULL,
    reference_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Current status for real-time updates
    current_status VARCHAR(50) NOT NULL,
    status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_action_required VARCHAR(200),
    
    -- Basic application info for quick display
    requested_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    application_type VARCHAR(50) NOT NULL,
    
    -- Provider information
    assigned_provider_name VARCHAR(200),
    provider_logo_url TEXT,
    estimated_processing_days INTEGER,
    
    -- Progress tracking
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    current_step VARCHAR(100),
    completed_steps JSONB DEFAULT '[]',
    
    -- Real-time flags
    requires_user_action BOOLEAN DEFAULT false,
    has_unread_updates BOOLEAN DEFAULT false,
    priority_level VARCHAR(20) DEFAULT 'normal',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time notifications
CREATE TABLE public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Notification details
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    
    -- Related entities
    related_application_id UUID,
    related_transaction_id UUID,
    
    -- Notification metadata
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category VARCHAR(50) DEFAULT 'general',
    
    -- Action information
    action_required BOOLEAN DEFAULT false,
    action_url TEXT,
    action_text VARCHAR(100),
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Channel delivery status
    email_sent BOOLEAN DEFAULT false,
    sms_sent BOOLEAN DEFAULT false,
    push_sent BOOLEAN DEFAULT false,
    
    -- Expiry
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time chat/support messages
CREATE TABLE public.support_conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Conversation details
    subject VARCHAR(200),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority VARCHAR(20) DEFAULT 'normal',
    
    -- Assignment
    assigned_agent_id UUID,
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Related context
    related_application_id UUID,
    conversation_type VARCHAR(50) DEFAULT 'general_support',
    
    -- Metrics
    first_response_time INTEGER, -- minutes
    resolution_time INTEGER, -- minutes
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Support messages
CREATE TABLE public.support_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    
    -- Message details
    sender_type VARCHAR(20) CHECK (sender_type IN ('user', 'agent', 'system')),
    sender_id UUID,
    message_content TEXT NOT NULL,
    
    -- Message metadata
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'system_update')),
    attachments JSONB DEFAULT '[]',
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document uploads (temporary storage, moved to permanent storage after verification)
CREATE TABLE public.document_uploads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    application_id UUID,
    
    -- Document details
    document_type VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100),
    
    -- Storage information
    storage_path TEXT NOT NULL, -- Supabase Storage path
    storage_bucket VARCHAR(100) DEFAULT 'documents',
    
    -- Processing status
    upload_status VARCHAR(20) DEFAULT 'uploaded' CHECK (upload_status IN ('uploading', 'uploaded', 'processing', 'verified', 'rejected')),
    verification_status VARCHAR(20) DEFAULT 'pending',
    verification_notes TEXT,
    
    -- Security
    is_encrypted BOOLEAN DEFAULT true,
    access_level VARCHAR(20) DEFAULT 'private',
    
    -- Sync status with Neon
    synced_to_neon BOOLEAN DEFAULT false,
    neon_document_id UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time system activities (for user dashboard)
CREATE TABLE public.user_activities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Activity details
    activity_type VARCHAR(50) NOT NULL,
    activity_description TEXT NOT NULL,
    activity_data JSONB,
    
    -- Context
    related_entity_type VARCHAR(50), -- 'application', 'transaction', 'document'
    related_entity_id UUID,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- REAL-TIME FUNCTIONS
-- =====================================================

-- Function to update user activity
CREATE OR REPLACE FUNCTION log_user_activity(
    p_user_id UUID,
    p_activity_type VARCHAR(50),
    p_description TEXT,
    p_related_entity_type VARCHAR(50) DEFAULT NULL,
    p_related_entity_id UUID DEFAULT NULL,
    p_activity_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO public.user_activities (
        user_id, activity_type, activity_description,
        related_entity_type, related_entity_id, activity_data
    ) VALUES (
        p_user_id, p_activity_type, p_description,
        p_related_entity_type, p_related_entity_id, p_activity_data
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_title VARCHAR(200),
    p_message TEXT,
    p_type VARCHAR(50),
    p_priority VARCHAR(20) DEFAULT 'normal',
    p_action_required BOOLEAN DEFAULT false,
    p_action_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO public.notifications (
        user_id, title, message, notification_type, priority,
        action_required, action_url
    ) VALUES (
        p_user_id, p_title, p_message, p_type, p_priority,
        p_action_required, p_action_url
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync application status from Neon
CREATE OR REPLACE FUNCTION sync_application_status(
    p_neon_application_id UUID,
    p_reference_id VARCHAR(100),
    p_status VARCHAR(50),
    p_progress_percentage INTEGER DEFAULT NULL,
    p_next_action VARCHAR(200) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    status_id UUID;
    user_uuid UUID;
BEGIN
    -- Update or insert application status
    INSERT INTO public.application_status (
        neon_application_id, reference_id, current_status,
        progress_percentage, next_action_required
    ) VALUES (
        p_neon_application_id, p_reference_id, p_status,
        COALESCE(p_progress_percentage, 0), p_next_action
    )
    ON CONFLICT (reference_id) 
    DO UPDATE SET
        current_status = EXCLUDED.current_status,
        progress_percentage = COALESCE(EXCLUDED.progress_percentage, application_status.progress_percentage),
        next_action_required = COALESCE(EXCLUDED.next_action_required, application_status.next_action_required),
        status_updated_at = NOW(),
        has_unread_updates = true,
        updated_at = NOW()
    RETURNING id, user_id INTO status_id, user_uuid;
    
    -- Create notification for status change
    PERFORM create_notification(
        user_uuid,
        'Application Status Update',
        'Your application status has been updated to: ' || p_status,
        'application_update',
        'normal',
        p_next_action IS NOT NULL
    );
    
    RETURN status_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);
    
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Organizations policies
CREATE POLICY "Users can view own organizations" ON public.organizations
    FOR SELECT USING (auth.uid() = owner_id);
    
CREATE POLICY "Users can insert own organizations" ON public.organizations
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
    
CREATE POLICY "Users can update own organizations" ON public.organizations
    FOR UPDATE USING (auth.uid() = owner_id);

-- Application status policies
CREATE POLICY "Users can view own applications" ON public.application_status
    FOR SELECT USING (auth.uid() = user_id);

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Support conversations policies
CREATE POLICY "Users can view own conversations" ON public.support_conversations
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own conversations" ON public.support_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Support messages policies
CREATE POLICY "Users can view messages in own conversations" ON public.support_messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM public.support_conversations WHERE user_id = auth.uid()
        )
    );
    
CREATE POLICY "Users can insert messages in own conversations" ON public.support_messages
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.support_conversations WHERE user_id = auth.uid()
        )
    );

-- Document uploads policies
CREATE POLICY "Users can view own documents" ON public.document_uploads
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own documents" ON public.document_uploads
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update own documents" ON public.document_uploads
    FOR UPDATE USING (auth.uid() = user_id);

-- User activities policies
CREATE POLICY "Users can view own activities" ON public.user_activities
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS
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
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_application_status_updated_at BEFORE UPDATE ON public.application_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_conversations_updated_at BEFORE UPDATE ON public.support_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_uploads_updated_at BEFORE UPDATE ON public.document_uploads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Automatic profile creation trigger
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_user_profile_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User profiles indexes
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_kyc_status ON public.user_profiles(kyc_status);

-- Organizations indexes
CREATE INDEX idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX idx_organizations_status ON public.organizations(verification_status);

-- Application status indexes
CREATE INDEX idx_application_status_user ON public.application_status(user_id);
CREATE INDEX idx_application_status_neon_id ON public.application_status(neon_application_id);
CREATE INDEX idx_application_status_reference ON public.application_status(reference_id);
CREATE INDEX idx_application_status_current_status ON public.application_status(current_status);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);

-- Support indexes
CREATE INDEX idx_support_conversations_user ON public.support_conversations(user_id);
CREATE INDEX idx_support_conversations_status ON public.support_conversations(status);
CREATE INDEX idx_support_messages_conversation ON public.support_messages(conversation_id);

-- Document uploads indexes
CREATE INDEX idx_document_uploads_user ON public.document_uploads(user_id);
CREATE INDEX idx_document_uploads_application ON public.document_uploads(application_id);
CREATE INDEX idx_document_uploads_status ON public.document_uploads(upload_status);

-- User activities indexes
CREATE INDEX idx_user_activities_user ON public.user_activities(user_id);
CREATE INDEX idx_user_activities_type ON public.user_activities(activity_type);
CREATE INDEX idx_user_activities_created_at ON public.user_activities(created_at);

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.application_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activities;

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Create storage buckets for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('documents', 'documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    ('profile-images', 'profile-images', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies
CREATE POLICY "Users can upload own documents" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own documents" ON storage.objects
    FOR SELECT USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload profile images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view profile images" ON storage.objects
    FOR SELECT USING (bucket_id = 'profile-images');

-- Schema setup completed
SELECT 'CaaS Supabase Database Schema Deployed Successfully' as status;