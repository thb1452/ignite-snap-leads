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
          {
            foreignKeyName: "call_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      clean_leads: {
        Row: {
          address: string
          city: string
          county_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          last_updated: string | null
          opened_date: string | null
          property_id: string | null
          snap_insight: string | null
          snap_score: number | null
          state: string
          violation_description: string | null
          violation_type: string | null
          zip: string | null
        }
        Insert: {
          address: string
          city: string
          county_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_updated?: string | null
          opened_date?: string | null
          property_id?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state: string
          violation_description?: string | null
          violation_type?: string | null
          zip?: string | null
        }
        Update: {
          address?: string
          city?: string
          county_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_updated?: string | null
          opened_date?: string | null
          property_id?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state?: string
          violation_description?: string | null
          violation_type?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clean_leads_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clean_leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clean_leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      counties: {
        Row: {
          assigned_to: string | null
          county_name: string
          created_at: string | null
          foia_portal_url: string | null
          foia_status: string | null
          id: string
          last_request_date: string | null
          last_upload_date: string | null
          list_count: number | null
          notes: string | null
          portal_type: string | null
          state: string
          updated_at: string | null
          upload_status: string | null
        }
        Insert: {
          assigned_to?: string | null
          county_name: string
          created_at?: string | null
          foia_portal_url?: string | null
          foia_status?: string | null
          id?: string
          last_request_date?: string | null
          last_upload_date?: string | null
          list_count?: number | null
          notes?: string | null
          portal_type?: string | null
          state: string
          updated_at?: string | null
          upload_status?: string | null
        }
        Update: {
          assigned_to?: string | null
          county_name?: string
          created_at?: string | null
          foia_portal_url?: string | null
          foia_status?: string | null
          id?: string
          last_request_date?: string | null
          last_upload_date?: string | null
          list_count?: number | null
          notes?: string | null
          portal_type?: string | null
          state?: string
          updated_at?: string | null
          upload_status?: string | null
        }
        Relationships: []
      }
      credential_target_cooldown: {
        Row: {
          id: string
          press_account_id: string
          target_id: string
          used_at: string
        }
        Insert: {
          id?: string
          press_account_id: string
          target_id: string
          used_at?: string
        }
        Update: {
          id?: string
          press_account_id?: string
          target_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_target_cooldown_press_account_id_fkey"
            columns: ["press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_target_cooldown_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          job_id_extracted: string | null
          meta: Json | null
          property_id_extracted: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          job_id_extracted?: string | null
          meta?: Json | null
          property_id_extracted?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          job_id_extracted?: string | null
          meta?: Json | null
          property_id_extracted?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger_skiptrace: {
        Row: {
          created_at: string | null
          delta: number
          id: string
          job_id: string | null
          meta: Json | null
          property_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delta: number
          id?: string
          job_id?: string | null
          meta?: Json | null
          property_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          delta?: number
          id?: string
          job_id?: string | null
          meta?: Json | null
          property_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_skiptrace_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "skiptrace_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_skiptrace_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_skiptrace_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      email_analytics: {
        Row: {
          clicked_at: string | null
          email_subject: string | null
          email_type: string
          id: string
          new_violations_count: number | null
          opened_at: string | null
          properties_featured: number | null
          sent_at: string
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          email_subject?: string | null
          email_type: string
          id?: string
          new_violations_count?: number | null
          opened_at?: string | null
          properties_featured?: number | null
          sent_at?: string
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          email_subject?: string | null
          email_type?: string
          id?: string
          new_violations_count?: number | null
          opened_at?: string | null
          properties_featured?: number | null
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          digest_day: number
          digest_hour: number
          id: string
          timezone: string
          updated_at: string
          user_id: string
          weekly_digest_enabled: boolean
        }
        Insert: {
          created_at?: string
          digest_day?: number
          digest_hour?: number
          id?: string
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_digest_enabled?: boolean
        }
        Update: {
          created_at?: string
          digest_day?: number
          digest_hour?: number
          id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_digest_enabled?: boolean
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
      events: {
        Row: {
          job_id: string
          payload: Json | null
          ts: string
          type: string
          user_id: string | null
        }
        Insert: {
          job_id: string
          payload?: Json | null
          ts?: string
          type: string
          user_id?: string | null
        }
        Update: {
          job_id?: string
          payload?: Json | null
          ts?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      foia_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          target_id: string
          va_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          target_id: string
          va_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          target_id?: string
          va_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foia_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "foia_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foia_assignments_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foia_assignments_va_id_fkey"
            columns: ["va_id"]
            isOneToOne: false
            referencedRelation: "foia_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foia_invites: {
        Row: {
          accepted: boolean
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          token: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
        }
        Relationships: []
      }
      foia_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: []
      }
      foia_requests: {
        Row: {
          county_id: string | null
          created_at: string | null
          data_format: string | null
          data_quality_score: number | null
          data_years_requested: string | null
          estimated_row_count: number | null
          fee_amount: number | null
          fulfillment_file_url: string | null
          fulfillment_received_at: string | null
          id: string
          invoice_amount: number | null
          invoice_paid: boolean | null
          is_snap_usable: boolean | null
          notes: string | null
          parsed_status: string | null
          press_account_id: string | null
          redaction_flag: boolean | null
          request_date: string
          request_method: string | null
          requested_by: string
          response_date: string | null
          response_received_at: string | null
          sent_at: string | null
          status: string | null
          target_id: string | null
          updated_at: string
          va_id: string | null
        }
        Insert: {
          county_id?: string | null
          created_at?: string | null
          data_format?: string | null
          data_quality_score?: number | null
          data_years_requested?: string | null
          estimated_row_count?: number | null
          fee_amount?: number | null
          fulfillment_file_url?: string | null
          fulfillment_received_at?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_paid?: boolean | null
          is_snap_usable?: boolean | null
          notes?: string | null
          parsed_status?: string | null
          press_account_id?: string | null
          redaction_flag?: boolean | null
          request_date?: string
          request_method?: string | null
          requested_by: string
          response_date?: string | null
          response_received_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_id?: string | null
          updated_at?: string
          va_id?: string | null
        }
        Update: {
          county_id?: string | null
          created_at?: string | null
          data_format?: string | null
          data_quality_score?: number | null
          data_years_requested?: string | null
          estimated_row_count?: number | null
          fee_amount?: number | null
          fulfillment_file_url?: string | null
          fulfillment_received_at?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_paid?: boolean | null
          is_snap_usable?: boolean | null
          notes?: string | null
          parsed_status?: string | null
          press_account_id?: string | null
          redaction_flag?: boolean | null
          request_date?: string
          request_method?: string | null
          requested_by?: string
          response_date?: string | null
          response_received_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_id?: string | null
          updated_at?: string
          va_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foia_requests_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foia_requests_press_account_id_fkey"
            columns: ["press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foia_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foia_requests_va_id_fkey"
            columns: ["va_id"]
            isOneToOne: false
            referencedRelation: "foia_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foia_templates: {
        Row: {
          created_at: string | null
          id: string
          name: string
          state: string | null
          success_rate: number | null
          template_text: string
          use_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          state?: string | null
          success_rate?: number | null
          template_text: string
          use_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          state?: string | null
          success_rate?: number | null
          template_text?: string
          use_count?: number | null
        }
        Relationships: []
      }
      geocoding_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_count: number
          finished_at: string | null
          geocoded_count: number
          id: string
          skipped_count: number
          started_at: string | null
          status: string
          total_properties: number
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          geocoded_count?: number
          id?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          total_properties?: number
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          geocoded_count?: number
          id?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          total_properties?: number
          user_id?: string
        }
        Relationships: []
      }
      jurisdictions: {
        Row: {
          city: string
          county: string | null
          created_at: string
          default_zip_range: string | null
          enforcement_profile: Json | null
          id: string
          name: string
          state: string
        }
        Insert: {
          city: string
          county?: string | null
          created_at?: string
          default_zip_range?: string | null
          enforcement_profile?: Json | null
          id?: string
          name: string
          state: string
        }
        Update: {
          city?: string
          county?: string | null
          created_at?: string
          default_zip_range?: string | null
          enforcement_profile?: Json | null
          id?: string
          name?: string
          state?: string
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
          {
            foreignKeyName: "lead_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
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
          {
            foreignKeyName: "list_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
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
      press_accounts: {
        Row: {
          created_at: string
          domain: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      press_rotation: {
        Row: {
          created_at: string
          id: string
          press_account_id: string
          rotation_month: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          press_account_id: string
          rotation_month: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          press_account_id?: string
          rotation_month?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "press_rotation_press_account_id_fkey"
            columns: ["press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "press_rotation_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
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
          avg_days_open: number | null
          city: string
          county: string | null
          created_at: string | null
          distress_signals: string[] | null
          enforcement_type: string
          escalated: boolean | null
          geom: unknown
          id: string
          jurisdiction_id: string | null
          last_analyzed_at: string | null
          last_enforcement_date: string | null
          latitude: number | null
          longitude: number | null
          multi_department: boolean | null
          newest_violation_date: string | null
          oldest_violation_date: string | null
          open_violations: number | null
          opportunity_class: string | null
          photo_url: string | null
          repeat_offender: boolean | null
          scope: string | null
          snap_insight: string | null
          snap_score: number | null
          state: string
          total_violations: number | null
          updated_at: string | null
          violation_types: string[] | null
          zip: string
        }
        Insert: {
          address: string
          avg_days_open?: number | null
          city: string
          county?: string | null
          created_at?: string | null
          distress_signals?: string[] | null
          enforcement_type?: string
          escalated?: boolean | null
          geom?: unknown
          id?: string
          jurisdiction_id?: string | null
          last_analyzed_at?: string | null
          last_enforcement_date?: string | null
          latitude?: number | null
          longitude?: number | null
          multi_department?: boolean | null
          newest_violation_date?: string | null
          oldest_violation_date?: string | null
          open_violations?: number | null
          opportunity_class?: string | null
          photo_url?: string | null
          repeat_offender?: boolean | null
          scope?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state: string
          total_violations?: number | null
          updated_at?: string | null
          violation_types?: string[] | null
          zip: string
        }
        Update: {
          address?: string
          avg_days_open?: number | null
          city?: string
          county?: string | null
          created_at?: string | null
          distress_signals?: string[] | null
          enforcement_type?: string
          escalated?: boolean | null
          geom?: unknown
          id?: string
          jurisdiction_id?: string | null
          last_analyzed_at?: string | null
          last_enforcement_date?: string | null
          latitude?: number | null
          longitude?: number | null
          multi_department?: boolean | null
          newest_violation_date?: string | null
          oldest_violation_date?: string | null
          open_violations?: number | null
          opportunity_class?: string | null
          photo_url?: string | null
          repeat_offender?: boolean | null
          scope?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state?: string
          total_violations?: number | null
          updated_at?: string | null
          violation_types?: string[] | null
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "v_jurisdiction_stats"
            referencedColumns: ["jurisdiction_id"]
          },
        ]
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
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_alerts: {
        Row: {
          acknowledged: boolean
          created_at: string
          id: string
          new_press_account_id: string | null
          old_press_account_id: string | null
          reason: string
          targets_assigned: number
          va_id: string
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          new_press_account_id?: string | null
          old_press_account_id?: string | null
          reason?: string
          targets_assigned?: number
          va_id: string
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          new_press_account_id?: string | null
          old_press_account_id?: string | null
          reason?: string
          targets_assigned?: number
          va_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_alerts_new_press_account_id_fkey"
            columns: ["new_press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_alerts_old_press_account_id_fkey"
            columns: ["old_press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_alerts_va_id_fkey"
            columns: ["va_id"]
            isOneToOne: false
            referencedRelation: "foia_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_properties: {
        Row: {
          created_at: string
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
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
      skiptrace_consent_log: {
        Row: {
          consented_at: string
          created_at: string
          id: string
          ip_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consented_at?: string
          created_at?: string
          id?: string
          ip_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consented_at?: string
          created_at?: string
          id?: string
          ip_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      skiptrace_jobs: {
        Row: {
          counts: Json | null
          created_at: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_key: string | null
          property_ids: string[]
          started_at: string | null
          status: string
          user_id: string
          vendor: string
        }
        Insert: {
          counts?: Json | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_key?: string | null
          property_ids: string[]
          started_at?: string | null
          status?: string
          user_id: string
          vendor?: string
        }
        Update: {
          counts?: Json | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_key?: string | null
          property_ids?: string[]
          started_at?: string | null
          status?: string
          user_id?: string
          vendor?: string
        }
        Relationships: []
      }
      skiptrace_outcomes: {
        Row: {
          created_at: string | null
          job_id: string
          property_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          job_id: string
          property_id: string
          status: string
        }
        Update: {
          created_at?: string | null
          job_id?: string
          property_id?: string
          status?: string
        }
        Relationships: []
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
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staging_uploads: {
        Row: {
          completed_at: string | null
          county_id: string | null
          created_at: string | null
          error_messages: Json | null
          failed_rows: number | null
          file_name: string
          id: string
          processed_rows: number | null
          status: string | null
          total_rows: number | null
          uploaded_by: string | null
        }
        Insert: {
          completed_at?: string | null
          county_id?: string | null
          created_at?: string | null
          error_messages?: Json | null
          failed_rows?: number | null
          file_name: string
          id?: string
          processed_rows?: number | null
          status?: string | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Update: {
          completed_at?: string | null
          county_id?: string | null
          created_at?: string | null
          error_messages?: Json | null
          failed_rows?: number | null
          file_name?: string
          id?: string
          processed_rows?: number | null
          status?: string | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_uploads_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          data_tier: string
          description: string | null
          display_name: string
          features: Json | null
          has_advanced_filters: boolean
          has_api_access: boolean
          has_dedicated_manager: boolean
          has_escalation_alerts: boolean
          has_rolling_intelligence: boolean
          has_violation_filtering: boolean
          id: string
          is_active: boolean
          max_counties: number
          max_monthly_exports: number
          max_skip_traces_per_month: number
          max_states: number | null
          max_user_seats: number
          name: string
          price_annual_cents: number
          price_monthly_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_tier?: string
          description?: string | null
          display_name: string
          features?: Json | null
          has_advanced_filters?: boolean
          has_api_access?: boolean
          has_dedicated_manager?: boolean
          has_escalation_alerts?: boolean
          has_rolling_intelligence?: boolean
          has_violation_filtering?: boolean
          id?: string
          is_active?: boolean
          max_counties?: number
          max_monthly_exports?: number
          max_skip_traces_per_month?: number
          max_states?: number | null
          max_user_seats?: number
          name: string
          price_annual_cents?: number
          price_monthly_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_tier?: string
          description?: string | null
          display_name?: string
          features?: Json | null
          has_advanced_filters?: boolean
          has_api_access?: boolean
          has_dedicated_manager?: boolean
          has_escalation_alerts?: boolean
          has_rolling_intelligence?: boolean
          has_violation_filtering?: boolean
          id?: string
          is_active?: boolean
          max_counties?: number
          max_monthly_exports?: number
          max_skip_traces_per_month?: number
          max_states?: number | null
          max_user_seats?: number
          name?: string
          price_annual_cents?: number
          price_monthly_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_usage: {
        Row: {
          api_calls_count: number
          created_at: string
          exports_count: number
          id: string
          period_end: string
          period_start: string
          skip_traces_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_calls_count?: number
          created_at?: string
          exports_count?: number
          id?: string
          period_end: string
          period_start: string
          skip_traces_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_calls_count?: number
          created_at?: string
          exports_count?: number
          id?: string
          period_end?: string
          period_start?: string
          skip_traces_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          county: string | null
          created_at: string
          foia_url: string | null
          id: string
          is_duplicate: boolean
          jurisdiction_name: string
          population: number | null
          portal_difficulty_score: number | null
          source_file: string | null
          state: string
          target_type: string
          url_hash: string | null
        }
        Insert: {
          county?: string | null
          created_at?: string
          foia_url?: string | null
          id?: string
          is_duplicate?: boolean
          jurisdiction_name: string
          population?: number | null
          portal_difficulty_score?: number | null
          source_file?: string | null
          state: string
          target_type: string
          url_hash?: string | null
        }
        Update: {
          county?: string | null
          created_at?: string
          foia_url?: string | null
          id?: string
          is_duplicate?: boolean
          jurisdiction_name?: string
          population?: number | null
          portal_difficulty_score?: number | null
          source_file?: string | null
          state?: string
          target_type?: string
          url_hash?: string | null
        }
        Relationships: []
      }
      upload_history: {
        Row: {
          county_id: string | null
          error_message: string | null
          file_name: string
          id: string
          row_count: number | null
          status: string
          upload_date: string | null
          uploaded_by: string | null
        }
        Insert: {
          county_id?: string | null
          error_message?: string | null
          file_name: string
          id?: string
          row_count?: number | null
          status: string
          upload_date?: string | null
          uploaded_by?: string | null
        }
        Update: {
          county_id?: string | null
          error_message?: string | null
          file_name?: string
          id?: string
          row_count?: number | null
          status?: string
          upload_date?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_history_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_jobs: {
        Row: {
          bad_address_samples: Json | null
          bad_addresses: number | null
          city: string | null
          county: string | null
          created_at: string
          error_message: string | null
          file_size: number
          filename: string
          finished_at: string | null
          id: string
          jurisdiction_id: string | null
          processed_rows: number | null
          properties_created: number | null
          properties_matched: number | null
          scope: string | null
          source_type: string | null
          started_at: string | null
          state: string | null
          status: string | null
          storage_path: string
          total_rows: number | null
          updated_at: string
          user_id: string
          violations_created: number | null
          violations_updated: number | null
          warnings: Json | null
        }
        Insert: {
          bad_address_samples?: Json | null
          bad_addresses?: number | null
          city?: string | null
          county?: string | null
          created_at?: string
          error_message?: string | null
          file_size: number
          filename: string
          finished_at?: string | null
          id?: string
          jurisdiction_id?: string | null
          processed_rows?: number | null
          properties_created?: number | null
          properties_matched?: number | null
          scope?: string | null
          source_type?: string | null
          started_at?: string | null
          state?: string | null
          status?: string | null
          storage_path: string
          total_rows?: number | null
          updated_at?: string
          user_id: string
          violations_created?: number | null
          violations_updated?: number | null
          warnings?: Json | null
        }
        Update: {
          bad_address_samples?: Json | null
          bad_addresses?: number | null
          city?: string | null
          county?: string | null
          created_at?: string
          error_message?: string | null
          file_size?: number
          filename?: string
          finished_at?: string | null
          id?: string
          jurisdiction_id?: string | null
          processed_rows?: number | null
          properties_created?: number | null
          properties_matched?: number | null
          scope?: string | null
          source_type?: string | null
          started_at?: string | null
          state?: string | null
          status?: string | null
          storage_path?: string
          total_rows?: number | null
          updated_at?: string
          user_id?: string
          violations_created?: number | null
          violations_updated?: number | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_jobs_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_jobs_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "v_jurisdiction_stats"
            referencedColumns: ["jurisdiction_id"]
          },
        ]
      }
      upload_staging: {
        Row: {
          address: string
          case_id: string | null
          city: string | null
          created_at: string | null
          error: string | null
          id: string
          job_id: string
          jurisdiction_id: string | null
          last_updated: string | null
          opened_date: string | null
          processed: boolean | null
          property_id: string | null
          raw_description: string | null
          row_num: number
          state: string | null
          status: string | null
          violation: string
          zip: string | null
        }
        Insert: {
          address: string
          case_id?: string | null
          city?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          job_id: string
          jurisdiction_id?: string | null
          last_updated?: string | null
          opened_date?: string | null
          processed?: boolean | null
          property_id?: string | null
          raw_description?: string | null
          row_num: number
          state?: string | null
          status?: string | null
          violation: string
          zip?: string | null
        }
        Update: {
          address?: string
          case_id?: string | null
          city?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          job_id?: string
          jurisdiction_id?: string | null
          last_updated?: string | null
          opened_date?: string | null
          processed?: boolean | null
          property_id?: string | null
          raw_description?: string | null
          row_num?: number
          state?: string | null
          status?: string | null
          violation?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_staging_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "upload_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_staging_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_staging_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "v_jurisdiction_stats"
            referencedColumns: ["jurisdiction_id"]
          },
        ]
      }
      user_allowed_states: {
        Row: {
          created_at: string
          id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          token?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          consented_skiptrace: boolean | null
          created_at: string
          credits: number
          id: string
          onboarding_completed: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consented_skiptrace?: boolean | null
          created_at?: string
          credits?: number
          id?: string
          onboarding_completed?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consented_skiptrace?: boolean | null
          created_at?: string
          credits?: number
          id?: string
          onboarding_completed?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          cancel_at: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_exports_limit: number | null
          trial_exports_used: number | null
          trial_started_at: string | null
          trial_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_exports_limit?: number | null
          trial_exports_used?: number | null
          trial_started_at?: string | null
          trial_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_exports_limit?: number | null
          trial_exports_used?: number | null
          trial_started_at?: string | null
          trial_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      va_credential_slots: {
        Row: {
          batch_number: number
          created_at: string
          id: string
          is_active: boolean
          press_account_id: string
          slot_number: number
          va_id: string
        }
        Insert: {
          batch_number?: number
          created_at?: string
          id?: string
          is_active?: boolean
          press_account_id: string
          slot_number?: number
          va_id: string
        }
        Update: {
          batch_number?: number
          created_at?: string
          id?: string
          is_active?: boolean
          press_account_id?: string
          slot_number?: number
          va_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "va_credential_slots_press_account_id_fkey"
            columns: ["press_account_id"]
            isOneToOne: false
            referencedRelation: "press_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_credential_slots_va_id_fkey"
            columns: ["va_id"]
            isOneToOne: false
            referencedRelation: "foia_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      violations: {
        Row: {
          case_id: string | null
          closed_at: string | null
          created_at: string | null
          days_open: number | null
          description: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          last_updated: string | null
          opened_date: string | null
          previous_status: string | null
          property_id: string | null
          raw_description: string | null
          status: string
          status_changed_at: string | null
          violation_type: string
        }
        Insert: {
          case_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          days_open?: number | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          last_updated?: string | null
          opened_date?: string | null
          previous_status?: string | null
          property_id?: string | null
          raw_description?: string | null
          status: string
          status_changed_at?: string | null
          violation_type: string
        }
        Update: {
          case_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          days_open?: number | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          last_updated?: string | null
          opened_date?: string | null
          previous_status?: string | null
          property_id?: string | null
          raw_description?: string | null
          status?: string
          status_changed_at?: string | null
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
          {
            foreignKeyName: "violations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      mv_distinct_cities: {
        Row: {
          city: string | null
          state: string | null
        }
        Relationships: []
      }
      mv_distinct_states: {
        Row: {
          state: string | null
        }
        Relationships: []
      }
      v_hot_properties: {
        Row: {
          address: string | null
          city: string | null
          distress_signals: string[] | null
          escalated: boolean | null
          id: string | null
          multi_department: boolean | null
          oldest_violation_date: string | null
          snap_insight: string | null
          snap_score: number | null
          state: string | null
          total_violations: number | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          distress_signals?: string[] | null
          escalated?: boolean | null
          id?: string | null
          multi_department?: boolean | null
          oldest_violation_date?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state?: string | null
          total_violations?: number | null
        }
        Update: {
          address?: string | null
          city?: string | null
          distress_signals?: string[] | null
          escalated?: boolean | null
          id?: string | null
          multi_department?: boolean | null
          oldest_violation_date?: string | null
          snap_insight?: string | null
          snap_score?: number | null
          state?: string | null
          total_violations?: number | null
        }
        Relationships: []
      }
      v_jurisdiction_stats: {
        Row: {
          avg_score: number | null
          city: string | null
          distressed_count: number | null
          enforcement_profile: Json | null
          jurisdiction_id: string | null
          jurisdiction_name: string | null
          property_count: number | null
          state: string | null
        }
        Relationships: []
      }
      v_opportunity_funnel: {
        Row: {
          avg_score: number | null
          opportunity_class: string | null
          property_count: number | null
        }
        Relationships: []
      }
      v_property_contact_stats: {
        Row: {
          contact_rows: number | null
          emails_found: number | null
          phones_found: number | null
          property_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_hot_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_credits: {
        Row: {
          balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      backfill_insights_batch: {
        Args: { batch_size?: number }
        Returns: {
          processed: number
          remaining: number
        }[]
      }
      backfill_property_aggregates_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          processed: number
          remaining: number
          updated: number
        }[]
      }
      bulk_upsert_violations: { Args: { p_violations: Json }; Returns: Json }
      check_foia_invite: {
        Args: { p_token: string }
        Returns: {
          accepted: boolean
          email: string
          expires_at: string
        }[]
      }
      complete_foia_signup: {
        Args: {
          p_email: string
          p_full_name: string
          p_role?: string
          p_token?: string
          p_user_id: string
        }
        Returns: undefined
      }
      consume_credit: { Args: { p_user_id: string }; Returns: number }
      current_user_email: { Args: never; Returns: string }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      fn_add_filtered_to_list: {
        Args: {
          p_city?: string
          p_enforcement_type?: string
          p_jurisdiction_id?: string
          p_limit?: number
          p_list_id: string
          p_max_score?: number
          p_min_score?: number
          p_state?: string
        }
        Returns: Json
      }
      fn_backfill_zips_by_city_centroids: {
        Args: { p_batch_size?: number; p_city: string; p_state: string }
        Returns: Json
      }
      fn_backfill_zips_by_city_mode: {
        Args: { p_city: string; p_state: string }
        Returns: number
      }
      fn_backfill_zips_nearest_neighbor: {
        Args: { p_batch_size?: number; p_city?: string; p_state?: string }
        Returns: Json
      }
      fn_bulk_insert_properties: {
        Args: { p_properties: Json }
        Returns: {
          address: string
          city: string
          property_id: string
          state: string
          was_created: boolean
          zip: string
        }[]
      }
      fn_bulk_run_inc: {
        Args: { p_field: string; p_run_id: string }
        Returns: undefined
      }
      fn_category_property_counts: {
        Args: { p_city?: string; p_state?: string }
        Returns: {
          category_id: string
          category_label: string
          property_count: number
        }[]
      }
      fn_charge_credits: {
        Args: { p_job_id: string; p_property_ids: string[] }
        Returns: Json
      }
      fn_check_county_limit: { Args: { p_amount?: number }; Returns: Json }
      fn_check_subscription_limit:
        | {
            Args: {
              p_amount?: number
              p_usage_type: string
              p_user_id?: string
            }
            Returns: Json
          }
        | {
            Args: { p_amount?: number; p_usage_type: string; p_user_id: string }
            Returns: Json
          }
      fn_consume_credit: {
        Args: { p_meta?: Json; p_reason: string }
        Returns: number
      }
      fn_consume_usage: {
        Args: { p_amount?: number; p_usage_type: string }
        Returns: Json
      }
      fn_consume_usage_atomic: {
        Args: { p_amount?: number; p_usage_type: string }
        Returns: Json
      }
      fn_dashboard_stats: { Args: never; Returns: Json }
      fn_data_health_report: { Args: never; Returns: Json }
      fn_distinct_cities: {
        Args: { p_state?: string }
        Returns: {
          city: string
        }[]
      }
      fn_distinct_states: {
        Args: never
        Returns: {
          state: string
        }[]
      }
      fn_fulfillment_overview: {
        Args: never
        Returns: {
          avg_estimated_rows: number
          avg_fee_nonzero: number
          avg_quality: number
          avg_response_days: number
          fee_incidence_rate: number
          file_upload_rate: number
          format_csv: number
          format_image: number
          format_mixed: number
          format_other: number
          format_pdf: number
          redacted_count: number
          total_fees: number
          total_fulfilled: number
          with_file: number
        }[]
      }
      fn_get_current_usage: { Args: { p_user_id: string }; Returns: Json }
      fn_get_list_properties: {
        Args: { p_list_id: string; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      fn_get_trial_status: { Args: { p_user_id: string }; Returns: Json }
      fn_get_user_allowed_states: {
        Args: { p_user_id?: string }
        Returns: string[]
      }
      fn_get_user_lists: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
          property_count: number
        }[]
      }
      fn_get_user_subscription: {
        Args: { p_user_id?: string }
        Returns: {
          current_period_end: string
          current_period_start: string
          display_name: string
          has_advanced_filters: boolean
          has_api_access: boolean
          has_escalation_alerts: boolean
          has_rolling_intelligence: boolean
          has_violation_filtering: boolean
          max_counties: number
          max_monthly_exports: number
          max_skip_traces_per_month: number
          max_user_seats: number
          plan_id: string
          plan_name: string
          status: string
          stripe_subscription_id: string
          subscription_id: string
          user_id: string
        }[]
      }
      fn_increment_trial_exports: {
        Args: { p_count?: number; p_user_id: string }
        Returns: Json
      }
      fn_increment_usage:
        | {
            Args: {
              p_amount?: number
              p_usage_type: string
              p_user_id?: string
            }
            Returns: boolean
          }
        | {
            Args: { p_amount?: number; p_usage_type: string; p_user_id: string }
            Returns: boolean
          }
      fn_job_status: { Args: { p_job_id: string }; Returns: Json }
      fn_jurisdiction_intelligence: {
        Args: never
        Returns: {
          avg_data_quality: number
          avg_fee_amount: number
          avg_fee_nonzero: number
          avg_response_days: number
          county: string
          fee_incidence_rate: number
          fee_risk: string
          fulfilled_count: number
          fulfillment_rate: number
          hostility_score: number
          jis: number
          jurisdiction_name: string
          needs_review_count: number
          no_portal_count: number
          population: number
          portal_difficulty_score: number
          redaction_pattern: string
          redaction_pct: number
          rejected_count: number
          rejection_rate: number
          rejection_tier: string
          speed_tier: string
          state: string
          target_id: string
          target_type: string
          total_requests: number
        }[]
      }
      fn_jurisdiction_stats: {
        Args: never
        Returns: {
          avg_score: number
          city: string
          distressed_count: number
          enforcement_profile: Json
          jurisdiction_id: string
          jurisdiction_name: string
          property_count: number
          state: string
        }[]
      }
      fn_map_markers: {
        Args: {
          p_city?: string
          p_limit?: number
          p_search?: string
          p_snap_max?: number
          p_snap_min?: number
          p_state?: string
        }
        Returns: Json
      }
      fn_map_markers_by_category: {
        Args: {
          p_category: string
          p_city?: string
          p_limit?: number
          p_snap_max?: number
          p_snap_min?: number
          p_state?: string
        }
        Returns: {
          address: string
          city: string
          enforcement_type: string
          id: string
          latitude: number
          longitude: number
          snap_score: number
          state: string
        }[]
      }
      fn_map_markers_in_bounds: {
        Args: {
          p_category?: string
          p_city?: string
          p_limit?: number
          p_max_lat: number
          p_max_lng: number
          p_min_lat: number
          p_min_lng: number
          p_snap_max?: number
          p_snap_min?: number
          p_state?: string
        }
        Returns: {
          address: string
          city: string
          enforcement_type: string
          id: string
          latitude: number
          longitude: number
          snap_score: number
          state: string
        }[]
      }
      fn_opportunity_funnel: {
        Args: never
        Returns: {
          avg_score: number
          opportunity_class: string
          property_count: number
        }[]
      }
      fn_properties_by_bbox:
        | {
            Args: {
              p_limit?: number
              p_max_lat: number
              p_max_lng: number
              p_min_lat: number
              p_min_lng: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_last_seen_after?: string
              p_max_lat: number
              p_max_lng: number
              p_min_lat: number
              p_min_lng: number
              p_score_min?: number
              p_source?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_east: number
              p_last_seen_lte?: number
              p_limit?: number
              p_north: number
              p_offset?: number
              p_score_gte?: number
              p_south: number
              p_west: number
            }
            Returns: Json
          }
      fn_properties_by_category:
        | {
            Args: {
              p_category: string
              p_city?: string
              p_last_seen_days?: number
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_snap_max?: number
              p_snap_min?: number
              p_state?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_category: string
              p_city?: string
              p_last_seen_days?: number
              p_multiple_violations_only?: boolean
              p_open_violations_only?: boolean
              p_page?: number
              p_page_size?: number
              p_repeat_offender_only?: boolean
              p_search?: string
              p_snap_max?: number
              p_snap_min?: number
              p_sort_by?: string
              p_state?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_category: string
              p_city?: string
              p_last_seen_days?: number
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_snap_max?: number
              p_snap_min?: number
              p_sort_by?: string
              p_state?: string
            }
            Returns: Json
          }
      fn_properties_paged:
        | {
            Args: {
              p_city?: string
              p_last_seen_days?: number
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_snap_max?: number
              p_snap_min?: number
              p_sort_by?: string
              p_state?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_city?: string
              p_last_seen_days?: number
              p_multiple_violations_only?: boolean
              p_open_violations_only?: boolean
              p_page?: number
              p_page_size?: number
              p_repeat_offender_only?: boolean
              p_search?: string
              p_snap_max?: number
              p_snap_min?: number
              p_sort_by?: string
              p_state?: string
            }
            Returns: Json
          }
      fn_properties_untraced_in_list: {
        Args: { p_limit?: number; p_list_id: string }
        Returns: {
          property_id: string
        }[]
      }
      fn_refund_credits: {
        Args: { p_job_id: string; p_property_ids: string[]; p_reason: string }
        Returns: Json
      }
      fn_start_trial: {
        Args: { p_trial_tier: string; p_user_id: string }
        Returns: Json
      }
      fn_state_response_analytics: {
        Args: never
        Returns: {
          avg_data_quality: number
          avg_fee_amount: number
          avg_fee_nonzero: number
          avg_response_days: number
          fee_incidence_rate: number
          fulfilled_count: number
          fulfillment_rate: number
          redaction_pct: number
          rejection_rate: number
          state: string
          total_requests: number
        }[]
      }
      fn_update_user_states: { Args: { p_states: string[] }; Returns: Json }
      fn_user_needs_state_selection: { Args: never; Returns: boolean }
      fn_violation_counts_by_area: {
        Args: { p_city?: string; p_state?: string }
        Returns: {
          count: number
          violation_type: string
        }[]
      }
      fn_zip_pressure: {
        Args: { p_city?: string; p_state?: string }
        Returns: {
          avg_lat: number
          avg_lng: number
          avg_score: number
          property_count: number
          zip: string
        }[]
      }
      generate_enforcement_insight: {
        Args: {
          p_avg_days_open: number
          p_distress_signals: string[]
          p_escalated: boolean
          p_multi_department: boolean
          p_open_violations: number
          p_repeat_offender: boolean
          p_total_violations: number
          p_violation_types: string[]
        }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_foia_admin: { Args: never; Returns: boolean }
      is_foia_va: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      refresh_outdated_insights_batch: {
        Args: { batch_size?: number }
        Returns: {
          processed: number
          remaining: number
        }[]
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "va" | "user"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      app_role: ["admin", "va", "user"],
    },
  },
} as const
