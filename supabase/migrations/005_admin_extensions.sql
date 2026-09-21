-- Migration: 005_admin_extensions
-- Description: Adds join_requests, chapter_settings, and announcements tables.

-- 1. Table: public.join_requests
CREATE TABLE IF NOT EXISTS public.join_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(chapter_id, user_id)
);

-- 2. Table: public.chapter_settings
CREATE TABLE IF NOT EXISTS public.chapter_settings (
    chapter_id uuid PRIMARY KEY REFERENCES public.chapters(id) ON DELETE CASCADE,
    semester_target_hours numeric(6,2) NOT NULL DEFAULT 80,
    subjects_catalog text[] NOT NULL DEFAULT '{}',
    require_approval boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: public.announcements
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    is_pinned boolean NOT NULL DEFAULT true,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ENABLE RLS
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES for join_requests
CREATE POLICY join_requests_select ON public.join_requests
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_chapter_admin(chapter_id));

CREATE POLICY join_requests_insert ON public.join_requests
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY join_requests_update ON public.join_requests
    FOR UPDATE TO authenticated
    USING (public.is_chapter_admin(chapter_id))
    WITH CHECK (public.is_chapter_admin(chapter_id));

-- RLS POLICIES for chapter_settings
CREATE POLICY chapter_settings_select ON public.chapter_settings
    FOR SELECT TO authenticated
    USING (public.is_chapter_member(chapter_id));

CREATE POLICY chapter_settings_insert ON public.chapter_settings
    FOR INSERT TO authenticated
    WITH CHECK (public.is_chapter_admin(chapter_id));

CREATE POLICY chapter_settings_update ON public.chapter_settings
    FOR UPDATE TO authenticated
    USING (public.is_chapter_admin(chapter_id))
    WITH CHECK (public.is_chapter_admin(chapter_id));

-- RLS POLICIES for announcements
CREATE POLICY announcements_select ON public.announcements
    FOR SELECT TO authenticated
    USING (public.is_chapter_member(chapter_id));

CREATE POLICY announcements_insert ON public.announcements
    FOR INSERT TO authenticated
    WITH CHECK (public.is_chapter_admin(chapter_id));

CREATE POLICY announcements_update ON public.announcements
    FOR UPDATE TO authenticated
    USING (public.is_chapter_admin(chapter_id))
    WITH CHECK (public.is_chapter_admin(chapter_id));

CREATE POLICY announcements_delete ON public.announcements
    FOR DELETE TO authenticated
    USING (public.is_chapter_admin(chapter_id));

-- TRIGGERS
DROP TRIGGER IF EXISTS chapter_settings_set_updated_at ON public.chapter_settings;
CREATE TRIGGER chapter_settings_set_updated_at
    BEFORE UPDATE ON public.chapter_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS join_requests_chapter_status_idx ON public.join_requests(chapter_id, status);
CREATE INDEX IF NOT EXISTS announcements_chapter_pinned_idx ON public.announcements(chapter_id, is_pinned);
