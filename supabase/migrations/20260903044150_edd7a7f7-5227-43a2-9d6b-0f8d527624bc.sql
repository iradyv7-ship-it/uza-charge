-- 1. Plan catalogue
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_minor_per_charge_point bigint NOT NULL DEFAULT 0,
  min_monthly_minor bigint NOT NULL DEFAULT 0,
  included_charge_points integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RWF',
  allows_public_listing boolean NOT NULL DEFAULT false,
  allows_reservations boolean NOT NULL DEFAULT false,
  allows_api_access boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read active plans"
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (active OR public.is_staff(auth.uid()));

CREATE POLICY "Staff manage plans"
  ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Owner subscriptions
CREATE TABLE public.owner_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trialing',
  billing_day integer NOT NULL DEFAULT 1,
  trial_ends_on date,
  current_period_start date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Kigali')::date,
  current_period_end date,
  listed_publicly boolean NOT NULL DEFAULT false,
  pay_method text NOT NULL DEFAULT 'momo',
  pay_destination text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

CREATE INDEX owner_subscriptions_owner_idx ON public.owner_subscriptions (owner_id);

GRANT SELECT ON public.owner_subscriptions TO authenticated;
GRANT ALL ON public.owner_subscriptions TO service_role;
ALTER TABLE public.owner_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their own subscription"
  ON public.owner_subscriptions FOR SELECT TO authenticated
  USING (public.has_owner_access(owner_id));

CREATE POLICY "Staff manage subscriptions"
  ON public.owner_subscriptions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER owner_subscriptions_updated_at
  BEFORE UPDATE ON public.owner_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.owner_subscriptions(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  charge_point_count integer NOT NULL DEFAULT 0,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RWF',
  status text NOT NULL DEFAULT 'draft',
  due_on date,
  paid_at timestamptz,
  pay_method text,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoices_owner_idx ON public.invoices (owner_id, period_start DESC);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.has_owner_access(owner_id));

CREATE POLICY "Staff manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Invoice lines
CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_minor bigint NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_lines_invoice_idx ON public.invoice_lines (invoice_id);

GRANT SELECT ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read lines of their own invoices"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id AND public.has_owner_access(i.owner_id)
  ));

CREATE POLICY "Staff manage invoice lines"
  ON public.invoice_lines FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 5. Seed the plan catalogue (prices ASSUMED until confirmed by UZA)
INSERT INTO public.subscription_plans
  (code, name, description, price_minor_per_charge_point, min_monthly_minor,
   included_charge_points, allows_public_listing, allows_reservations, allows_api_access,
   features, sort_order)
VALUES
  ('starter', 'Starter',
   'Live monitoring and daily reports for a single site.',
   25000, 25000, 1, false, false, false,
   '["Live charge-point health","Daily energy and revenue report","Session history and receipts","Remote reboot and unlock"]'::jsonb, 1),
  ('pro', 'Pro',
   'Full control room, public locator listing and bookings.',
   20000, 100000, 5, true, true, false,
   '["Everything in Starter","Public locator listing with verified badge","Slot bookings from drivers","Utilisation and forecast","Settlement statements and payouts","CSV and PDF exports"]'::jsonb, 2),
  ('enterprise', 'Enterprise',
   'Multi-site networks, API access and grid-grade reporting.',
   15000, 500000, 25, true, true, true,
   '["Everything in Pro","Unlimited sites and teams","API and webhook access","Grid and regulator reporting","Solar and V2G tracking","Named account manager"]'::jsonb, 3);

-- 6. Put every existing owner on a trialling Starter subscription
INSERT INTO public.owner_subscriptions (owner_id, plan_id, status, trial_ends_on, current_period_end)
SELECT o.id,
       (SELECT id FROM public.subscription_plans WHERE code = 'starter'),
       'trialing',
       ((now() AT TIME ZONE 'Africa/Kigali')::date + 30),
       ((now() AT TIME ZONE 'Africa/Kigali')::date + 30)
FROM public.owners o
ON CONFLICT (owner_id) DO NOTHING;
