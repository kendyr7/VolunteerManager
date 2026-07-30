-- Migration: Shift Change Requests table for WhatsApp rescheduling requests
CREATE TABLE IF NOT EXISTS public.shift_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id UUID NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
    current_day_key TEXT NOT NULL,
    current_shift_key TEXT NOT NULL,
    requested_day_key TEXT NOT NULL,
    requested_shift_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- RLS Policies
ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on shift_change_requests" 
    ON public.shift_change_requests FOR SELECT USING (true);

CREATE POLICY "Allow public insert on shift_change_requests" 
    ON public.shift_change_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on shift_change_requests" 
    ON public.shift_change_requests FOR UPDATE USING (true);
