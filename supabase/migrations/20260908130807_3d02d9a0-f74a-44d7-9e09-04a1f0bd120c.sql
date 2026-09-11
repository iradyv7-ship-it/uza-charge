CREATE TABLE public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id uuid NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  grace_before_minutes integer NOT NULL DEFAULT 10,
  grace_after_minutes integer NOT NULL DEFAULT 10,
  hold_from timestamptz NOT NULL DEFAULT now(),
  hold_to timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'booked',
  note text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservations_window_valid CHECK (ends_at > starts_at),
  CONSTRAINT reservations_grace_valid CHECK (grace_before_minutes BETWEEN 0 AND 60 AND grace_after_minutes BETWEEN 0 AND 60),
  CONSTRAINT reservations_status_valid CHECK (status IN ('booked','active','honoured','expired','cancelled','no_show'))
);

CREATE INDEX reservations_connector_window_idx ON public.reservations (connector_id, starts_at);
CREATE INDEX reservations_driver_idx ON public.reservations (driver_id, starts_at DESC);

CREATE OR REPLACE FUNCTION public.reservations_set_hold()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.hold_from := NEW.starts_at - (NEW.grace_before_minutes * interval '1 minute');
  NEW.hold_to := NEW.ends_at + (NEW.grace_after_minutes * interval '1 minute');
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservations_hold_window
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservations_set_hold();

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    connector_id WITH =,
    tstzrange(hold_from, hold_to, '[)') WITH &&
  ) WHERE (status IN ('booked','active'));

GRANT SELECT, INSERT, UPDATE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers read their own bookings"
  ON public.reservations FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY "Drivers create their own bookings"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "Drivers update their own bookings"
  ON public.reservations FOR UPDATE TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "Owner team reads bookings on their piles"
  ON public.reservations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connectors c
    JOIN public.chargers ch ON ch.id = c.charger_id
    JOIN public.stations st ON st.id = ch.station_id
    WHERE c.id = reservations.connector_id
      AND st.owner_id IS NOT NULL
      AND public.has_owner_access(st.owner_id)
  ));

CREATE POLICY "Owner team manages bookings on their piles"
  ON public.reservations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connectors c
    JOIN public.chargers ch ON ch.id = c.charger_id
    JOIN public.stations st ON st.id = ch.station_id
    WHERE c.id = reservations.connector_id
      AND st.owner_id IS NOT NULL
      AND public.has_owner_access(st.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.connectors c
    JOIN public.chargers ch ON ch.id = c.charger_id
    JOIN public.stations st ON st.id = ch.station_id
    WHERE c.id = reservations.connector_id
      AND st.owner_id IS NOT NULL
      AND public.has_owner_access(st.owner_id)
  ));

CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
