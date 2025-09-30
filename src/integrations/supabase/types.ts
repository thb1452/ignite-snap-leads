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
      audit_events: {
        Row: {
          created_at: string
          entity: string
          entity_id: string
          id: number
          kind: string
          metadata: Json | null
          org_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          kind: string
          metadata?: Json | null
          org_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          kind?: string
          metadata?: Json | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          confidence: number | null
          created_at: string
          id: number
          is_dnc: boolean | null
          lead_id: number
          line_type: string | null
          org_id: string
          source: string | null
          type: string
          value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: number
          is_dnc?: boolean | null
          lead_id: number
          line_type?: string | null
          org_id: string
          source?: string | null
          type: string
          value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: number
          is_dnc?: boolean | null
          lead_id?: number
          line_type?: string | null
          org_id?: string
          source?: string | null
          type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      staging_violations: {
        Row: {
          created_at: string
          id: number
          org_id: string
          raw: Json
          upload_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          org_id: string
          raw: Json
          upload_id: string
        }
        Update: {
          created_at?: string
          id?: number
          org_id?: string
          raw?: Json
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_violations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_violations_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          created_at: string
          filename: string
          id: string
          org_id: string
          size_bytes: number
          status: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          org_id: string
          size_bytes: number
          status?: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          org_id?: string
          size_bytes?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      violations: {
        Row: {
          address: string | null
          case_id: string | null
          city: string | null
          created_at: string
          id: number
          insight: string | null
          last_updated: string | null
          opened_date: string | null
          org_id: string
          snap_score: number | null
          state: string | null
          status: string | null
          updated_at: string
          violation: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          case_id?: string | null
          city?: string | null
          created_at?: string
          id?: number
          insight?: string | null
          last_updated?: string | null
          opened_date?: string | null
          org_id: string
          snap_score?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string
          violation?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          case_id?: string | null
          city?: string | null
          created_at?: string
          id?: number
          insight?: string | null
          last_updated?: string | null
          opened_date?: string | null
          org_id?: string
          snap_score?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string
          violation?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "violations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
