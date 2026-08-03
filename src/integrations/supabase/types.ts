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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      chargers: {
        Row: {
          connector_count: number
          created_at: string
          firmware_version: string | null
          id: string
          last_heartbeat: string | null
          max_output_pct: number
          model: string | null
          serial: string
          station_id: string
          status: string
          vendor: string | null
        }
        Insert: {
          connector_count?: number
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_heartbeat?: string | null
          max_output_pct?: number
          model?: string | null
          serial: string
          station_id: string
          status?: string
          vendor?: string | null
        }
        Update: {
          connector_count?: number
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_heartbeat?: string | null
          max_output_pct?: number
          model?: string | null
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
            referencedRelation: "chargers"
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
      payments: {
        Row: {
          amount_rwf: number
          created_at: string
          driver_id: string | null
          id: string
          method: string
          provider_ref: string | null
          session_id: string | null
          status: string
        }
        Insert: {
          amount_rwf: number
          created_at?: string
          driver_id?: string | null
          id?: string
          method: string
          provider_ref?: string | null
          session_id?: string | null
          status?: string
        }
        Update: {
          amount_rwf?: number
          created_at?: string
          driver_id?: string | null
          id?: string
          method?: string
          provider_ref?: string | null
          session_id?: string | null
          status?: string
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
      sessions: {
        Row: {
          connector_id: string
          cost_rwf: number
          created_at: string
          driver_id: string | null
          ended_at: string | null
          id: string
          kwh: number
          serial_no: string
          soc_end: number | null
          soc_start: number | null
          start_method: string
          started_at: string
          status: string
          stop_reason_code: string | null
          vin: string | null
        }
        Insert: {
          connector_id: string
          cost_rwf?: number
          created_at?: string
          driver_id?: string | null
          ended_at?: string | null
          id?: string
          kwh?: number
          serial_no?: string
          soc_end?: number | null
          soc_start?: number | null
          start_method?: string
          started_at?: string
          status?: string
          stop_reason_code?: string | null
          vin?: string | null
        }
        Update: {
          connector_id?: string
          cost_rwf?: number
          created_at?: string
          driver_id?: string | null
          ended_at?: string | null
          id?: string
          kwh?: number
          serial_no?: string
          soc_end?: number | null
          soc_start?: number | null
          start_method?: string
          started_at?: string
          status?: string
          stop_reason_code?: string | null
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
        ]
      }
      stations: {
        Row: {
          area: string | null
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          kind: string
          name: string
          operator_id: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: string
          name: string
          operator_id: string
        }
        Update: {
          area?: string | null
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: string
          name?: string
          operator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      compute_session_cost: { Args: { _session_id: string }; Returns: Json }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
