UPDATE public.subscription_plans SET price_minor_per_charge_point = 2500000, min_monthly_minor = 2500000 WHERE code = 'starter';
UPDATE public.subscription_plans SET price_minor_per_charge_point = 2000000, min_monthly_minor = 10000000 WHERE code = 'pro';
UPDATE public.subscription_plans SET price_minor_per_charge_point = 1500000, min_monthly_minor = 50000000 WHERE code = 'enterprise';
UPDATE public.invoices SET total_minor = total_minor * 100, subtotal_minor = subtotal_minor * 100 WHERE status <> 'paid';
UPDATE public.invoice_lines SET unit_minor = unit_minor * 100, amount_minor = amount_minor * 100;
