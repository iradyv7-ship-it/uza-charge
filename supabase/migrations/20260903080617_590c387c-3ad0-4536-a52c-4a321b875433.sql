ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'capture',
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authorized_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['pending','authorized','captured','refunded','cancelled','settled','failed']));
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_kind_check CHECK (kind = ANY (ARRAY['preauth','capture','refund','topup']));

UPDATE public.payments SET amount_minor = ROUND(COALESCE(amount_rwf,0) * 100)::bigint WHERE amount_minor = 0;
UPDATE public.payments SET captured_minor = amount_minor WHERE status = 'settled' AND captured_minor = 0;
UPDATE public.payments SET kind = 'topup' WHERE session_id IS NULL AND kind = 'capture';

CREATE INDEX IF NOT EXISTS payments_session_kind_idx ON public.payments (session_id, kind);
CREATE INDEX IF NOT EXISTS payments_provider_ref_idx ON public.payments (provider_ref);

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_events (
  id bigserial PRIMARY KEY,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['request','response','callback'])),
  action text NOT NULL,
  provider_ref text,
  http_status integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read payment events" ON public.payment_events
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS payment_events_no_change ON public.payment_events;
CREATE TRIGGER payment_events_no_change BEFORE UPDATE OR DELETE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.payment_events_append_only();
