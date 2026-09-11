export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bank_members: {
        Row: {
          bank_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          bank_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          bank_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_members_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          active: boolean
          code: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country_code: string
          created_at: string
          deposit_bps: number
          id: string
          min_client_contribution_minor: number
          name: string
          terms_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          deposit_bps?: number
          id?: string
          min_client_contribution_minor?: number
          name: string
          terms_status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          deposit_bps?: number
          id?: string
          min_client_contribution_minor?: number
          name?: string
          terms_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      charge_point_status_history: {
        Row: {
          changed_at: string
          charger_id: string
          connector_id: string | null
          id: number
          source: string
          status: string
        }
        Insert: {
          changed_at?: string
          charger_id: string
          connector_id?: string | null
          id?: number
          source?: string
          status: string
        }
        Update: {
          changed_at?: string
          charger_id?: string
          connector_id?: string | null
          id?: number
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_status_history_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_status_history_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_status_history_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_commands: {
        Row: {
          charger_id: string
          created_at: string
          id: string
          payload: Json
          requested_by: string | null
          status: string
          type: string
        }
        Insert: {
          charger_id: string
          created_at?: string
          id?: string
          payload?: Json
          requested_by?: string | null
          status?: string
          type: string
        }
        Update: {
          charger_id?: string
          created_at?: string
          id?: string
          payload?: Json
          requested_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "charger_commands_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_commands_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_events: {
        Row: {
          charger_id: string | null
          id: number
          payload: Json
          received_at: string
          type: string
        }
        Insert: {
          charger_id?: string | null
          id?: never
          payload?: Json
          received_at?: string
          type: string
        }
        Update: {
          charger_id?: string | null
          id?: never
          payload?: Json
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "charger_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      chargers: {
        Row: {
          boot_at: string | null
          configuration: Json
          connector_count: number
          created_at: string
          firmware_status: string | null
          firmware_version: string | null
          heartbeat_interval_s: number
          id: string
          is_simulated: boolean
          last_heartbeat: string | null
          last_seen_at: string | null
          max_output_pct: number
          model: string | null
          ocpp_identity: string
          ocpp_protocol: string
          power_type: string
          rated_power_kw: number | null
          serial: string
          station_id: string
          status: string
          vendor: string | null
        }
        Insert: {
          boot_at?: string | null
          configuration?: Json
          connector_count?: number
          created_at?: string
          firmware_status?: string | null
          firmware_version?: string | null
          heartbeat_interval_s?: number
          id?: string
          is_simulated?: boolean
          last_heartbeat?: string | null
          last_seen_at?: string | null
          max_output_pct?: number
          model?: string | null
          ocpp_identity: string
          ocpp_protocol?: string
          power_type?: string
          rated_power_kw?: number | null
          serial: string
          station_id: string
          status?: string
          vendor?: string | null
        }
        Update: {
          boot_at?: string | null
          configuration?: Json
          connector_count?: number
          created_at?: string
          firmware_status?: string | null
          firmware_version?: string | null
          heartbeat_interval_s?: number
          id?: string
          is_simulated?: boolean
          last_heartbeat?: string | null
          last_seen_at?: string | null
          max_output_pct?: number
          model?: string | null
          ocpp_identity?: string
          ocpp_protocol?: string
          power_type?: string
          rated_power_kw?: number | null
          serial?: string
          station_id?: string
          status?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors: {
        Row: {
          charger_id: string
          created_at: string
          id: string
          label: string
          power_kw: number
          status: string
          type: string
        }
        Insert: {
          charger_id: string
          created_at?: string
          id?: string
          label: string
          power_kw?: number
          status?: string
          type?: string
        }
        Update: {
          charger_id?: string
          created_at?: string
          id?: string
          label?: string
          power_kw?: number
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectors_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          default_pay_method: string
          full_name: string | null
          id: string
          phone: string | null
          user_id: string | null
          wallet_balance_rwf: number
        }
        Insert: {
          created_at?: string
          default_pay_method?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
          wallet_balance_rwf?: number
        }
        Update: {
          created_at?: string
          default_pay_method?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
          wallet_balance_rwf?: number
        }
        Relationships: []
      }
      faults: {
        Row: {
          charger_id: string
          cleared_at: string | null
          code: string
          id: string
          label: string
          raised_at: string
          severity: string
        }
        Insert: {
          charger_id: string
          cleared_at?: string | null
          code: string
          id?: string
          label: string
          raised_at?: string
          severity?: string
        }
        Update: {
          charger_id?: string
          cleared_at?: string | null
          code?: string
          id?: string
          label?: string
          raised_at?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "faults_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faults_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_applications: {
        Row: {
          bank_id: string | null
          bridge_minor: number
          client_contribution_minor: number
          collateral_release_month: number
          created_at: string
          decided_at: string | null
          decision_note: string | null
          deposit_required_minor: number
          driver_id: string
          financed_total_minor: number
          id: string
          principal_minor: number
          rule_version: number
          status: string
          submitted_at: string | null
          term_months: number
          trace: Json
          updated_at: string
          vehicle_price_minor: number
        }
        Insert: {
          bank_id?: string | null
          bridge_minor?: number
          client_contribution_minor?: number
          collateral_release_month?: number
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          deposit_required_minor?: number
          driver_id: string
          financed_total_minor?: number
          id?: string
          principal_minor?: number
          rule_version?: number
          status?: string
          submitted_at?: string | null
          term_months?: number
          trace?: Json
          updated_at?: string
          vehicle_price_minor: number
        }
        Update: {
          bank_id?: string | null
          bridge_minor?: number
          client_contribution_minor?: number
          collateral_release_month?: number
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          deposit_required_minor?: number
          driver_id?: string
          financed_total_minor?: number
          id?: string
          principal_minor?: number
          rule_version?: number
          status?: string
          submitted_at?: string | null
          term_months?: number
          trace?: Json
          updated_at?: string
          vehicle_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_applications_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_applications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_audit: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id: string
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string
          id?: number
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount_minor: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          kind: string
          quantity: number
          unit_minor: number
        }
        Insert: {
          amount_minor?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          kind: string
          quantity?: number
          unit_minor?: number
        }
        Update: {
          amount_minor?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          kind?: string
          quantity?: number
          unit_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          charge_point_count: number
          created_at: string
          currency: string
          due_on: string | null
          id: string
          number: string
          owner_id: string
          paid_at: string | null
          pay_method: string | null
          period_end: string
          period_start: string
          provider_ref: string | null
          status: string
          subscription_id: string | null
          subtotal_minor: number
          total_minor: number
          updated_at: string
        }
        Insert: {
          charge_point_count?: number
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          number: string
          owner_id: string
          paid_at?: string | null
          pay_method?: string | null
          period_end: string
          period_start: string
          provider_ref?: string | null
          status?: string
          subscription_id?: string | null
          subtotal_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Update: {
          charge_point_count?: number
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          number?: string
          owner_id?: string
          paid_at?: string | null
          pay_method?: string | null
          period_end?: string
          period_start?: string
          provider_ref?: string | null
          status?: string
          subscription_id?: string | null
          subtotal_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "owner_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          application_id: string
          bank_id: string | null
          cadence: string
          collateral_blocked_minor: number
          collateral_release_month: number
          collateral_released_minor: number
          created_at: string
          driver_id: string
          id: string
          instalment_minor: number
          next_due_on: string | null
          paid_to_date_minor: number
          principal_minor: number
          start_on: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          application_id: string
          bank_id?: string | null
          cadence?: string
          collateral_blocked_minor?: number
          collateral_release_month?: number
          collateral_released_minor?: number
          created_at?: string
          driver_id: string
          id?: string
          instalment_minor: number
          next_due_on?: string | null
          paid_to_date_minor?: number
          principal_minor: number
          start_on?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          bank_id?: string | null
          cadence?: string
          collateral_blocked_minor?: number
          collateral_release_month?: number
          collateral_released_minor?: number
          created_at?: string
          driver_id?: string
          id?: string
          instalment_minor?: number
          next_due_on?: string | null
          paid_to_date_minor?: number
          principal_minor?: number
          start_on?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "finance_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_values: {
        Row: {
          current: number | null
          id: number
          kwh: number | null
          power_kw: number | null
          session_id: string
          soc: number | null
          temp_c: number | null
          ts: string
          voltage: number | null
        }
        Insert: {
          current?: number | null
          id?: never
          kwh?: number | null
          power_kw?: number | null
          session_id: string
          soc?: number | null
          temp_c?: number | null
          ts?: string
          voltage?: number | null
        }
        Update: {
          current?: number | null
          id?: never
          kwh?: number | null
          power_kw?: number | null
          session_id?: string
          soc?: number | null
          temp_c?: number | null
          ts?: string
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_values_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ocpp_events: {
        Row: {
          action: string | null
          charger_id: string | null
          direction: string
          error: string | null
          id: number
          message_id: string | null
          message_type: number
          ocpp_identity: string
          payload: Json
          received_at: string
          valid: boolean
        }
        Insert: {
          action?: string | null
          charger_id?: string | null
          direction: string
          error?: string | null
          id?: number
          message_id?: string | null
          message_type: number
          ocpp_identity: string
          payload?: Json
          received_at?: string
          valid?: boolean
        }
        Update: {
          action?: string | null
          charger_id?: string | null
          direction?: string
          error?: string | null
          id?: number
          message_id?: string | null
          message_type?: number
          ocpp_identity?: string
          payload?: Json
          received_at?: string
          valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ocpp_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocpp_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string
          id: string
          momo_merchant_id: string | null
          name: string
          revenue_share_pct: number
        }
        Insert: {
          created_at?: string
          id?: string
          momo_merchant_id?: string | null
          name: string
          revenue_share_pct?: number
        }
        Update: {
          created_at?: string
          id?: string
          momo_merchant_id?: string | null
          name?: string
          revenue_share_pct?: number
        }
        Relationships: []
      }
      owner_members: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_subscriptions: {
        Row: {
          billing_day: number
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          listed_publicly: boolean
          owner_id: string
          pay_destination: string | null
          pay_method: string
          plan_id: string
          status: string
          trial_ends_on: string | null
          updated_at: string
        }
        Insert: {
          billing_day?: number
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          listed_publicly?: boolean
          owner_id: string
          pay_destination?: string | null
          pay_method?: string
          plan_id: string
          status?: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Update: {
          billing_day?: number
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          listed_publicly?: boolean
          owner_id?: string
          pay_destination?: string | null
          pay_method?: string
          plan_id?: string
          status?: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          active: boolean
          airtel_merchant_id: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country_code: string
          created_at: string
          id: string
          kind: string
          legacy_operator_id: string | null
          momo_merchant_id: string | null
          name: string
          payout_schedule: string
          tin: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          airtel_merchant_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          id?: string
          kind?: string
          legacy_operator_id?: string | null
          momo_merchant_id?: string | null
          name: string
          payout_schedule?: string
          tin?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          airtel_merchant_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          id?: string
          kind?: string
          legacy_operator_id?: string | null
          momo_merchant_id?: string | null
          name?: string
          payout_schedule?: string
          tin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_legacy_operator_id_fkey"
            columns: ["legacy_operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          action: string
          direction: string
          error: string | null
          http_status: number | null
          id: number
          payload: Json
          payment_id: string | null
          provider: string
          provider_ref: string | null
          received_at: string
        }
        Insert: {
          action: string
          direction: string
          error?: string | null
          http_status?: number | null
          id?: number
          payload?: Json
          payment_id?: string | null
          provider: string
          provider_ref?: string | null
          received_at?: string
        }
        Update: {
          action?: string
          direction?: string
          error?: string | null
          http_status?: number | null
          id?: number
          payload?: Json
          payment_id?: string | null
          provider?: string
          provider_ref?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          amount_rwf: number
          authorized_minor: number
          captured_minor: number
          created_at: string
          driver_id: string | null
          failure_reason: string | null
          id: string
          kind: string
          method: string
          payer_phone: string | null
          provider_ref: string | null
          provider_status: string | null
          refunded_minor: number
          session_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          amount_rwf: number
          authorized_minor?: number
          captured_minor?: number
          created_at?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          kind?: string
          method: string
          payer_phone?: string | null
          provider_ref?: string | null
          provider_status?: string | null
          refunded_minor?: number
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          amount_rwf?: number
          authorized_minor?: number
          captured_minor?: number
          created_at?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          kind?: string
          method?: string
          payer_phone?: string | null
          provider_ref?: string | null
          provider_status?: string | null
          refunded_minor?: number
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_minor: number
          created_at: string
          destination: string | null
          id: string
          method: string
          owner_id: string
          paid_at: string | null
          provider_ref: string | null
          scheduled_for: string | null
          settlement_run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          destination?: string | null
          id?: string
          method?: string
          owner_id: string
          paid_at?: string | null
          provider_ref?: string | null
          scheduled_for?: string | null
          settlement_run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          destination?: string | null
          id?: string
          method?: string
          owner_id?: string
          paid_at?: string | null
          provider_ref?: string | null
          scheduled_for?: string | null
          settlement_run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_settlement_run_id_fkey"
            columns: ["settlement_run_id"]
            isOneToOne: false
            referencedRelation: "settlement_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          currency: string
          driver_id: string | null
          duration_minutes: number
          energy_kwh: number
          energy_minor: number
          id: string
          idle_minor: number
          idle_minutes: number
          issued_at: string
          lines: Json
          number: string
          owner_id: string | null
          session_fee_minor: number
          session_id: string
          tariff_version_id: string | null
          time_minor: number
          total_minor: number
        }
        Insert: {
          currency?: string
          driver_id?: string | null
          duration_minutes?: number
          energy_kwh?: number
          energy_minor?: number
          id?: string
          idle_minor?: number
          idle_minutes?: number
          issued_at?: string
          lines?: Json
          number: string
          owner_id?: string | null
          session_fee_minor?: number
          session_id: string
          tariff_version_id?: string | null
          time_minor?: number
          total_minor?: number
        }
        Update: {
          currency?: string
          driver_id?: string | null
          duration_minutes?: number
          energy_kwh?: number
          energy_minor?: number
          id?: string
          idle_minor?: number
          idle_minutes?: number
          issued_at?: string
          lines?: Json
          number?: string
          owner_id?: string | null
          session_fee_minor?: number
          session_id?: string
          tariff_version_id?: string | null
          time_minor?: number
          total_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_tariff_version_id_fkey"
            columns: ["tariff_version_id"]
            isOneToOne: false
            referencedRelation: "tariff_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          connector_id: string
          created_at: string
          driver_id: string
          ends_at: string
          grace_after_minutes: number
          grace_before_minutes: number
          hold_from: string
          hold_to: string
          id: string
          note: string | null
          session_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          connector_id: string
          created_at?: string
          driver_id: string
          ends_at: string
          grace_after_minutes?: number
          grace_before_minutes?: number
          hold_from?: string
          hold_to?: string
          id?: string
          note?: string | null
          session_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          connector_id?: string
          created_at?: string
          driver_id?: string
          ends_at?: string
          grace_after_minutes?: number
          grace_before_minutes?: number
          hold_from?: string
          hold_to?: string
          id?: string
          note?: string | null
          session_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_split_rules: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          energy_cost_minor_per_kwh: number
          host_share_bps: number
          id: string
          note: string | null
          owner_id: string
          platform_share_bps: number
          version: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          energy_cost_minor_per_kwh: number
          host_share_bps: number
          id?: string
          note?: string | null
          owner_id: string
          platform_share_bps: number
          version: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          energy_cost_minor_per_kwh?: number
          host_share_bps?: number
          id?: string
          note?: string | null
          owner_id?: string
          platform_share_bps?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_split_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      rfid_cards: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          logical_number: string
          offline_enabled: boolean
          physical_uid: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          logical_number: string
          offline_enabled?: boolean
          physical_uid: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          logical_number?: string
          offline_enabled?: boolean
          physical_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfid_cards_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_entries: {
        Row: {
          amount_minor: number
          created_at: string
          driver_id: string
          external_ref: string | null
          id: string
          kind: string
          note: string | null
          occurred_on: string
          pot_id: string
          recorded_by: string | null
          reversal_of: string | null
          source: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          driver_id: string
          external_ref?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          pot_id: string
          recorded_by?: string | null
          reversal_of?: string | null
          source?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          driver_id?: string
          external_ref?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          pot_id?: string
          recorded_by?: string | null
          reversal_of?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_entries_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "savings_pots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_entries_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "savings_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_pots: {
        Row: {
          active: boolean
          category: string
          created_at: string
          driver_id: string
          id: string
          name: string
          sort_order: number
          system_managed: boolean
          target_cadence: string
          target_minor: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          driver_id: string
          id?: string
          name: string
          sort_order?: number
          system_managed?: boolean
          target_cadence?: string
          target_minor?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          driver_id?: string
          id?: string
          name?: string
          sort_order?: number
          system_managed?: boolean
          target_cadence?: string
          target_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_pots_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          charging_minutes: number
          connector_id: string
          cost_rwf: number
          created_at: string
          driver_id: string | null
          ended_at: string | null
          energy_minor: number
          id: string
          id_tag: string | null
          idle_minor: number
          idle_minutes: number
          kwh: number
          ocpp_transaction_id: number | null
          serial_no: string
          session_fee_minor: number
          soc_end: number | null
          soc_start: number | null
          split_rule_version: number | null
          start_method: string
          started_at: string
          status: string
          stop_reason_code: string | null
          tariff_version_id: string | null
          time_minor: number
          total_minor: number
          vin: string | null
        }
        Insert: {
          charging_minutes?: number
          connector_id: string
          cost_rwf?: number
          created_at?: string
          driver_id?: string | null
          ended_at?: string | null
          energy_minor?: number
          id?: string
          id_tag?: string | null
          idle_minor?: number
          idle_minutes?: number
          kwh?: number
          ocpp_transaction_id?: number | null
          serial_no?: string
          session_fee_minor?: number
          soc_end?: number | null
          soc_start?: number | null
          split_rule_version?: number | null
          start_method?: string
          started_at?: string
          status?: string
          stop_reason_code?: string | null
          tariff_version_id?: string | null
          time_minor?: number
          total_minor?: number
          vin?: string | null
        }
        Update: {
          charging_minutes?: number
          connector_id?: string
          cost_rwf?: number
          created_at?: string
          driver_id?: string | null
          ended_at?: string | null
          energy_minor?: number
          id?: string
          id_tag?: string | null
          idle_minor?: number
          idle_minutes?: number
          kwh?: number
          ocpp_transaction_id?: number | null
          serial_no?: string
          session_fee_minor?: number
          soc_end?: number | null
          soc_start?: number | null
          split_rule_version?: number | null
          start_method?: string
          started_at?: string
          status?: string
          stop_reason_code?: string | null
          tariff_version_id?: string | null
          time_minor?: number
          total_minor?: number
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tariff_version_id_fkey"
            columns: ["tariff_version_id"]
            isOneToOne: false
            referencedRelation: "tariff_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_runs: {
        Row: {
          energy_cost_minor: number
          generated_at: string
          gross_minor: number
          host_minor: number
          id: string
          owner_id: string
          period_end: string
          period_start: string
          platform_minor: number
          session_count: number
          split_rule_version: number | null
          status: string
          total_kwh: number
          updated_at: string
        }
        Insert: {
          energy_cost_minor?: number
          generated_at?: string
          gross_minor?: number
          host_minor?: number
          id?: string
          owner_id: string
          period_end: string
          period_start: string
          platform_minor?: number
          session_count?: number
          split_rule_version?: number | null
          status?: string
          total_kwh?: number
          updated_at?: string
        }
        Update: {
          energy_cost_minor?: number
          generated_at?: string
          gross_minor?: number
          host_minor?: number
          id?: string
          owner_id?: string
          period_end?: string
          period_start?: string
          platform_minor?: number
          session_count?: number
          split_rule_version?: number | null
          status?: string
          total_kwh?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          address: string | null
          area: string | null
          city: string | null
          country_code: string
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          grid_connection_kva: number | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          area?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          grid_connection_kva?: number | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          area?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          grid_connection_kva?: number | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          area: string | null
          city: string | null
          country_code: string
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          kind: string
          name: string
          operator_id: string
          owner_id: string | null
          site_id: string | null
        }
        Insert: {
          area?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: string
          name: string
          operator_id: string
          owner_id?: string | null
          site_id?: string | null
        }
        Update: {
          area?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: string
          name?: string
          operator_id?: string
          owner_id?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          allows_api_access: boolean
          allows_public_listing: boolean
          allows_reservations: boolean
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          included_charge_points: number
          min_monthly_minor: number
          name: string
          price_minor_per_charge_point: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allows_api_access?: boolean
          allows_public_listing?: boolean
          allows_reservations?: boolean
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_charge_points?: number
          min_monthly_minor?: number
          name: string
          price_minor_per_charge_point?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allows_api_access?: boolean
          allows_public_listing?: boolean
          allows_reservations?: boolean
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_charge_points?: number
          min_monthly_minor?: number
          name?: string
          price_minor_per_charge_point?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tariff_rates: {
        Row: {
          energy_rwf_per_kwh: number
          id: string
          service_rwf_per_kwh: number
          tariff_id: string
          tier: string
        }
        Insert: {
          energy_rwf_per_kwh: number
          id?: string
          service_rwf_per_kwh?: number
          tariff_id: string
          tier: string
        }
        Update: {
          energy_rwf_per_kwh?: number
          id?: string
          service_rwf_per_kwh?: number
          tariff_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariff_rates_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_segments: {
        Row: {
          half_hour_index: number
          id: string
          tariff_id: string
          tier: string
        }
        Insert: {
          half_hour_index: number
          id?: string
          tariff_id: string
          tier: string
        }
        Update: {
          half_hour_index?: number
          id?: string
          tariff_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariff_segments_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_tou_windows: {
        Row: {
          half_hour_index: number
          id: string
          multiplier: number
          tariff_version_id: string
          tier: string
        }
        Insert: {
          half_hour_index: number
          id?: string
          multiplier?: number
          tariff_version_id: string
          tier: string
        }
        Update: {
          half_hour_index?: number
          id?: string
          multiplier?: number
          tariff_version_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariff_tou_windows_tariff_version_id_fkey"
            columns: ["tariff_version_id"]
            isOneToOne: false
            referencedRelation: "tariff_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_versions: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          energy_minor_per_kwh: number
          id: string
          idle_fee_minor_per_minute: number
          idle_grace_minutes: number
          name: string
          owner_id: string
          published: boolean
          session_fee_minor: number
          station_id: string | null
          time_minor_per_minute: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          energy_minor_per_kwh: number
          id?: string
          idle_fee_minor_per_minute?: number
          idle_grace_minutes?: number
          name: string
          owner_id: string
          published?: boolean
          session_fee_minor?: number
          station_id?: string | null
          time_minor_per_minute?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          energy_minor_per_kwh?: number
          id?: string
          idle_fee_minor_per_minute?: number
          idle_grace_minutes?: number
          name?: string
          owner_id?: string
          published?: boolean
          session_fee_minor?: number
          station_id?: string | null
          time_minor_per_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariff_versions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_versions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      tariffs: {
        Row: {
          created_at: string
          id: string
          name: string
          operator_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          operator_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          operator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariffs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          hours: number
          id: string
          name: string
          required_for_finance: boolean
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          hours?: number
          id?: string
          name: string
          required_for_finance?: boolean
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          hours?: number
          id?: string
          name?: string
          required_for_finance?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      training_records: {
        Row: {
          assessor: string | null
          completed_on: string | null
          created_at: string
          driver_id: string
          id: string
          note: string | null
          program_id: string
          score_pct: number | null
          started_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assessor?: string | null
          completed_on?: string | null
          created_at?: string
          driver_id: string
          id?: string
          note?: string | null
          program_id: string
          score_pct?: number | null
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assessor?: string | null
          completed_on?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          note?: string | null
          program_id?: string
          score_pct?: number | null
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_records_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_records_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          id: string
          meter_start: number
          meter_stop: number
          session_id: string
          settled: boolean
          tier_breakdown: Json
          total_kwh: number
          total_rwf: number
        }
        Insert: {
          created_at?: string
          id?: string
          meter_start?: number
          meter_stop?: number
          session_id: string
          settled?: boolean
          tier_breakdown?: Json
          total_kwh?: number
          total_rwf?: number
        }
        Update: {
          created_at?: string
          id?: string
          meter_start?: number
          meter_stop?: number
          session_id?: string
          settled?: boolean
          tier_breakdown?: Json
          total_kwh?: number
          total_rwf?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      charge_points: {
        Row: {
          connector_count: number | null
          created_at: string | null
          firmware_status: string | null
          firmware_version: string | null
          heartbeat_interval_s: number | null
          id: string | null
          is_simulated: boolean | null
          last_seen_at: string | null
          max_output_pct: number | null
          model: string | null
          ocpp_identity: string | null
          owner_id: string | null
          power_type: string | null
          rated_power_kw: number | null
          serial: string | null
          site_id: string | null
          station_id: string | null
          status: string | null
          vendor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      compute_session_cost: { Args: { _session_id: string }; Returns: Json }
      current_driver_id: { Args: never; Returns: string }
      has_bank_access: { Args: { _bank_id: string }; Returns: boolean }
      has_owner_access: { Args: { _owner_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      session_tariff_id: { Args: { _session_id: string }; Returns: string }
      tier_for_ts: {
        Args: { _tariff_id: string; _ts: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "driver"
        | "operator"
        | "admin"
        | "investor"
        | "regulator"
        | "battery_passport"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "driver",
        "operator",
        "admin",
        "investor",
        "regulator",
        "battery_passport",
      ],
    },
  },
} as const
