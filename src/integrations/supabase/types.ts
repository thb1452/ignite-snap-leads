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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      call_logs: {
        Row: {
          call_type: string
          created_at: string
          duration: number | null
          id: string
          notes: string | null
          phone_number: string
          property_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          call_type: string
          created_at?: string
          duration?: number | null
          id?: string
          notes?: string | null
          phone_number: string
          property_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          call_type?: string
          created_at?: string
          duration?: number | null
          id?: string
          notes?: string | null
          phone_number?: string
          property_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_activity: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          property_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      list_properties: {
        Row: {
          added_at: string | null
          created_by: string | null
          id: string
          list_id: string | null
          property_id: string | null
        }
        Insert: {
          added_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          property_id?: string | null
        }
        Update: {
          added_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_properties_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          credits: number | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits?: number | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          city: string
          created_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          snap_insight: string | null
          snap_score: number | null
          state: string
          updated_at: string | null
          zip: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state: string
          updated_at?: string | null
          zip: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state?: string
          updated_at?: string | null
          zip?: string
        }
        Relationships: []
      }
      property_contacts: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          property_id: string
          raw_payload: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          property_id: string
          raw_payload?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          property_id?: string
          raw_payload?: Json | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      skiptrace_bulk_items: {
        Row: {
          duration_ms: number | null
          message: string | null
          property_id: string
          run_id: string
          status: string | null
        }
        Insert: {
          duration_ms?: number | null
          message?: string | null
          property_id: string
          run_id: string
          status?: string | null
        }
        Update: {
          duration_ms?: number | null
          message?: string | null
          property_id?: string
          run_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skiptrace_bulk_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "skiptrace_bulk_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      skiptrace_bulk_runs: {
        Row: {
          failed: number
          finished_at: string | null
          list_id: string | null
          queued: number
          run_id: string
          settings: Json
          started_at: string
          succeeded: number
          total: number
          user_id: string
        }
        Insert: {
          failed?: number
          finished_at?: string | null
          list_id?: string | null
          queued?: number
          run_id: string
          settings: Json
          started_at?: string
          succeeded?: number
          total: number
          user_id: string
        }
        Update: {
          failed?: number
          finished_at?: string | null
          list_id?: string | null
          queued?: number
          run_id?: string
          settings?: Json
          started_at?: string
          succeeded?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skiptrace_bulk_runs_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      violations: {
        Row: {
          case_id: string | null
          created_at: string | null
          days_open: number | null
          description: string | null
          id: string
          last_updated: string | null
          opened_date: string | null
          property_id: string | null
          status: string
          violation_type: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string | null
          days_open?: number | null
          description?: string | null
          id?: string
          last_updated?: string | null
          opened_date?: string | null
          property_id?: string | null
          status: string
          violation_type: string
        }
        Update: {
          case_id?: string | null
          created_at?: string | null
          days_open?: number | null
          description?: string | null
          id?: string
          last_updated?: string | null
          opened_date?: string | null
          property_id?: string | null
          status?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "violations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_user_credits: {
        Row: {
          balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_bulk_run_inc: {
        Args: { p_field: string; p_run_id: string }
        Returns: undefined
      }
      fn_consume_credit: {
        Args: { p_meta?: Json; p_reason: string }
        Returns: number
      }
      fn_properties_untraced_in_list: {
        Args: { p_limit?: number; p_list_id: string }
        Returns: {
          property_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
