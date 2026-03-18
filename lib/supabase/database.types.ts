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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          assigned_to: string | null
          company: string
          company_size: string | null
          contacted_at: string | null
          converted_at: string | null
          created_at: string | null
          demo_date: string | null
          email: string
          full_name: string
          id: string
          job_title: string
          message: string | null
          notes: string | null
          primary_interest: string | null
          referral_source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company: string
          company_size?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          demo_date?: string | null
          email: string
          full_name: string
          id?: string
          job_title: string
          message?: string | null
          notes?: string | null
          primary_interest?: string | null
          referral_source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company?: string
          company_size?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          demo_date?: string | null
          email?: string
          full_name?: string
          id?: string
          job_title?: string
          message?: string | null
          notes?: string | null
          primary_interest?: string | null
          referral_source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      accessibility_checks: {
        Row: {
          check_date: string | null
          checked_by: string | null
          company_id: string | null
          created_at: string | null
          document_name: string
          document_type: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          overall_score: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          check_date?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string | null
          document_name: string
          document_type?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          overall_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          check_date?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string | null
          document_name?: string
          document_type?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          overall_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      accessibility_issues: {
        Row: {
          check_id: string | null
          created_at: string | null
          description: string | null
          id: string
          issue_type: string
          location: string | null
          remediation: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
          wcag_reference: string | null
        }
        Insert: {
          check_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          issue_type: string
          location?: string | null
          remediation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          wcag_reference?: string | null
        }
        Update: {
          check_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          issue_type?: string
          location?: string | null
          remediation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          wcag_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accessibility_issues_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "accessibility_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_feed: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          opportunity_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          opportunity_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          opportunity_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          ip_address: string | null
          timestamp: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          timestamp?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          timestamp?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      agent_conversations: {
        Row: {
          agent_type: string
          context_data: Json | null
          created_at: string | null
          id: string
          messages: Json | null
          opportunity_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_type: string
          context_data?: Json | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          opportunity_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_type?: string
          context_data?: Json | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          opportunity_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_outputs: {
        Row: {
          agent_type: string
          applied_at: string | null
          confidence_score: number | null
          content: Json
          conversation_id: string | null
          created_at: string | null
          id: string
          output_type: string
          status: string | null
          target_module: string | null
        }
        Insert: {
          agent_type: string
          applied_at?: string | null
          confidence_score?: number | null
          content: Json
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          output_type: string
          status?: string | null
          target_module?: string | null
        }
        Update: {
          agent_type?: string
          applied_at?: string | null
          confidence_score?: number | null
          content?: Json
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          output_type?: string
          status?: string | null
          target_module?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_outputs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_logs: {
        Row: {
          action: string
          agent_name: string
          created_at: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json | null
          opportunity_id: string | null
          output_tokens: number | null
          success: boolean | null
          total_cost: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          agent_name: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          opportunity_id?: string | null
          output_tokens?: number | null
          success?: boolean | null
          total_cost?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          agent_name?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          opportunity_id?: string | null
          output_tokens?: number | null
          success?: boolean | null
          total_cost?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_approvals: {
        Row: {
          agent_type: string
          ai_output: string
          confidence_score: number | null
          content_type: string | null
          created_at: string | null
          feedback: string | null
          human_edited: string | null
          id: string
          opportunity_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_type: string
          ai_output: string
          confidence_score?: number | null
          content_type?: string | null
          created_at?: string | null
          feedback?: string | null
          human_edited?: string | null
          id?: string
          opportunity_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_type?: string
          ai_output?: string
          confidence_score?: number | null
          content_type?: string | null
          created_at?: string | null
          feedback?: string | null
          human_edited?: string | null
          id?: string
          opportunity_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_approvals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_approvals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interactions: {
        Row: {
          agent_type: string
          company_id: string | null
          created_at: string | null
          id: string
          opportunity_id: string | null
          prompt: string
          response: string | null
          saved_to_playbook: boolean | null
          tokens_input: number | null
          tokens_output: number | null
          user_email: string | null
          user_id: string | null
          user_rating: number | null
        }
        Insert: {
          agent_type: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          opportunity_id?: string | null
          prompt: string
          response?: string | null
          saved_to_playbook?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_email?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Update: {
          agent_type?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          opportunity_id?: string | null
          prompt?: string
          response?: string | null
          saved_to_playbook?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_email?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Relationships: []
      }
      ai_routing_rules: {
        Row: {
          content_keywords: string[] | null
          created_at: string | null
          cui_markings: string[] | null
          description: string | null
          id: string
          is_active: boolean | null
          modules: string[] | null
          priority: number | null
          rule_name: string
          target_provider: string
        }
        Insert: {
          content_keywords?: string[] | null
          created_at?: string | null
          cui_markings?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          modules?: string[] | null
          priority?: number | null
          rule_name: string
          target_provider?: string
        }
        Update: {
          content_keywords?: string[] | null
          created_at?: string | null
          cui_markings?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          modules?: string[] | null
          priority?: number | null
          rule_name?: string
          target_provider?: string
        }
        Relationships: []
      }
      ai_visuals: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          image_url: string | null
          mermaid_code: string | null
          metadata: Json | null
          opportunity_id: string | null
          prompt: string
          status: string | null
          svg_content: string | null
          title: string
          updated_at: string | null
          visual_type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          mermaid_code?: string | null
          metadata?: Json | null
          opportunity_id?: string | null
          prompt: string
          status?: string | null
          svg_content?: string | null
          title: string
          updated_at?: string | null
          visual_type: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          mermaid_code?: string | null
          metadata?: Json | null
          opportunity_id?: string | null
          prompt?: string
          status?: string | null
          svg_content?: string | null
          title?: string
          updated_at?: string | null
          visual_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_visuals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      amendment_changes: {
        Row: {
          action_required: string | null
          amendment_id: string | null
          assigned_to: string | null
          change_type: string | null
          created_at: string | null
          id: string
          impact_description: string | null
          new_text: string | null
          original_text: string | null
          section_reference: string | null
          status: string | null
        }
        Insert: {
          action_required?: string | null
          amendment_id?: string | null
          assigned_to?: string | null
          change_type?: string | null
          created_at?: string | null
          id?: string
          impact_description?: string | null
          new_text?: string | null
          original_text?: string | null
          section_reference?: string | null
          status?: string | null
        }
        Update: {
          action_required?: string | null
          amendment_id?: string | null
          assigned_to?: string | null
          change_type?: string | null
          created_at?: string | null
          id?: string
          impact_description?: string | null
          new_text?: string | null
          original_text?: string | null
          section_reference?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amendment_changes_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      amendment_impacts: {
        Row: {
          action_required: string | null
          amendment_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string
          due_date: string | null
          id: string
          impact_area: string
          owner_id: string | null
          section_affected: string | null
          status: string | null
        }
        Insert: {
          action_required?: string | null
          amendment_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: string
          impact_area: string
          owner_id?: string | null
          section_affected?: string | null
          status?: string | null
        }
        Update: {
          action_required?: string | null
          amendment_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          impact_area?: string
          owner_id?: string | null
          section_affected?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amendment_impacts_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "rfp_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      amendments: {
        Row: {
          amendment_number: string
          amendment_type: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          impact_level: string | null
          notes: string | null
          opportunity_id: string | null
          release_date: string | null
          requires_revision: boolean | null
          response_due: string | null
          sections_affected: string[] | null
          source_url: string | null
          status: string | null
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amendment_number: string
          amendment_type?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          impact_level?: string | null
          notes?: string | null
          opportunity_id?: string | null
          release_date?: string | null
          requires_revision?: boolean | null
          response_due?: string | null
          sections_affected?: string[] | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amendment_number?: string
          amendment_type?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          impact_level?: string | null
          notes?: string | null
          opportunity_id?: string | null
          release_date?: string | null
          requires_revision?: boolean | null
          response_due?: string | null
          sections_affected?: string[] | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amendments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_snapshots: {
        Row: {
          active_opportunities: number | null
          avg_deal_size: number | null
          avg_pwin: number | null
          company_id: string | null
          compliance_score: number | null
          created_at: string | null
          id: string
          loss_count: number | null
          metrics: Json | null
          pipeline_value: number | null
          proposals_in_progress: number | null
          snapshot_date: string
          team_utilization: number | null
          win_count: number | null
        }
        Insert: {
          active_opportunities?: number | null
          avg_deal_size?: number | null
          avg_pwin?: number | null
          company_id?: string | null
          compliance_score?: number | null
          created_at?: string | null
          id?: string
          loss_count?: number | null
          metrics?: Json | null
          pipeline_value?: number | null
          proposals_in_progress?: number | null
          snapshot_date: string
          team_utilization?: number | null
          win_count?: number | null
        }
        Update: {
          active_opportunities?: number | null
          avg_deal_size?: number | null
          avg_pwin?: number | null
          company_id?: string | null
          compliance_score?: number | null
          created_at?: string | null
          id?: string
          loss_count?: number | null
          metrics?: Json | null
          pipeline_value?: number | null
          proposals_in_progress?: number | null
          snapshot_date?: string
          team_utilization?: number | null
          win_count?: number | null
        }
        Relationships: []
      }
      approval_actions: {
        Row: {
          acted_at: string | null
          action: string
          approver_id: string | null
          approver_name: string | null
          comments: string | null
          id: string
          request_id: string | null
          step_number: number
        }
        Insert: {
          acted_at?: string | null
          action: string
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          id?: string
          request_id?: string | null
          step_number: number
        }
        Update: {
          acted_at?: string | null
          action?: string
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          id?: string
          request_id?: string | null
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          requested_by: string | null
          requested_by_name: string | null
          status: string | null
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          steps: Json
          updated_at: string | null
          workflow_type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          steps?: Json
          updated_at?: string | null
          workflow_type: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json
          updated_at?: string | null
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          company_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
          user_role: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
          user_role?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_audit_log: {
        Row: {
          created_at: string | null
          event_type: string
          id: number
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_lockout: {
        Row: {
          created_at: string | null
          email: string | null
          failed_attempts: number | null
          id: string
          last_failed_at: string | null
          last_failed_ip: unknown
          locked_until: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          failed_attempts?: number | null
          id?: string
          last_failed_at?: string | null
          last_failed_ip?: unknown
          locked_until?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          failed_attempts?: number | null
          id?: string
          last_failed_at?: string | null
          last_failed_ip?: unknown
          locked_until?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      capture_events: {
        Row: {
          all_day: boolean | null
          attendees: Json | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: string
          id: string
          is_milestone: boolean | null
          location: string | null
          opportunity_id: string | null
          reminder_minutes: number | null
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
          virtual_link: string | null
        }
        Insert: {
          all_day?: boolean | null
          attendees?: Json | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type: string
          id?: string
          is_milestone?: boolean | null
          location?: string | null
          opportunity_id?: string | null
          reminder_minutes?: number | null
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
          virtual_link?: string | null
        }
        Update: {
          all_day?: boolean | null
          attendees?: Json | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          is_milestone?: boolean | null
          location?: string | null
          opportunity_id?: string | null
          reminder_minutes?: number | null
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          virtual_link?: string | null
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          agent_name: string
          company_id: string
          context_snapshot: Json | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_starred: boolean | null
          message_count: number | null
          messages: Json
          opportunity_id: string | null
          title: string | null
          token_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_name: string
          company_id: string
          context_snapshot?: Json | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          message_count?: number | null
          messages?: Json
          opportunity_id?: string | null
          title?: string | null
          token_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_name?: string
          company_id?: string
          context_snapshot?: Json | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          message_count?: number | null
          messages?: Json
          opportunity_id?: string | null
          title?: string | null
          token_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string
          tokens_used: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          tokens_used?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          agent_type: string
          context: Json | null
          created_at: string | null
          id: string
          message_count: number | null
          opportunity_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_type: string
          context?: Json | null
          created_at?: string | null
          id?: string
          message_count?: number | null
          opportunity_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_type?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          message_count?: number | null
          opportunity_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      color_team_findings: {
        Row: {
          created_at: string | null
          description: string
          finding_type: string | null
          id: string
          page_number: number | null
          recommendation: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          section: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          finding_type?: string | null
          id?: string
          page_number?: number | null
          recommendation?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          section?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          finding_type?: string | null
          id?: string
          page_number?: number | null
          recommendation?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          section?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "color_team_findings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "color_team_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      color_team_reviewers: {
        Row: {
          created_at: string | null
          findings_submitted: number | null
          id: string
          review_id: string | null
          role: string | null
          section_assigned: string | null
          status: string | null
          user_email: string | null
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string | null
          findings_submitted?: number | null
          id?: string
          review_id?: string | null
          role?: string | null
          section_assigned?: string | null
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string | null
          findings_submitted?: number | null
          id?: string
          review_id?: string | null
          role?: string | null
          section_assigned?: string | null
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "color_team_reviewers_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "color_team_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      color_team_reviews: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          critical_issues: number | null
          duration_hours: number | null
          entry_criteria: string | null
          exit_criteria: string | null
          findings_count: number | null
          id: string
          lead_reviewer_id: string | null
          lead_reviewer_name: string | null
          location: string | null
          opportunity_id: string | null
          overall_rating: string | null
          recommendations: string | null
          review_name: string
          review_scope: string | null
          review_type: string
          scheduled_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          critical_issues?: number | null
          duration_hours?: number | null
          entry_criteria?: string | null
          exit_criteria?: string | null
          findings_count?: number | null
          id?: string
          lead_reviewer_id?: string | null
          lead_reviewer_name?: string | null
          location?: string | null
          opportunity_id?: string | null
          overall_rating?: string | null
          recommendations?: string | null
          review_name: string
          review_scope?: string | null
          review_type: string
          scheduled_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          critical_issues?: number | null
          duration_hours?: number | null
          entry_criteria?: string | null
          exit_criteria?: string | null
          findings_count?: number | null
          id?: string
          lead_reviewer_id?: string | null
          lead_reviewer_name?: string | null
          location?: string | null
          opportunity_id?: string | null
          overall_rating?: string | null
          recommendations?: string | null
          review_name?: string
          review_scope?: string | null
          review_type?: string
          scheduled_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "color_team_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "color_team_reviews_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          is_internal: boolean | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_internal?: boolean | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_internal?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string | null
          created_by: string | null
          domain: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          max_opportunities: number | null
          max_users: number | null
          name: string
          primary_color: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_tier: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_opportunities?: number | null
          max_users?: number | null
          name: string
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_opportunities?: number | null
          max_users?: number | null
          name?: string
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          category: string
          chunk_count: number | null
          company_id: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          metadata: Json | null
          processed_at: string | null
          status: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category: string
          chunk_count?: number | null
          company_id?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          chunk_count?: number | null
          company_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      company_onboarding: {
        Row: {
          company_id: string | null
          company_profile: Json | null
          completed_steps: Json | null
          created_at: string | null
          current_step: number | null
          documents_uploaded: number | null
          id: string
          last_trained_at: string | null
          training_status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          company_profile?: Json | null
          completed_steps?: Json | null
          created_at?: string | null
          current_step?: number | null
          documents_uploaded?: number | null
          id?: string
          last_trained_at?: string | null
          training_status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          company_profile?: Json | null
          completed_steps?: Json | null
          created_at?: string | null
          current_step?: number | null
          documents_uploaded?: number | null
          id?: string
          last_trained_at?: string | null
          training_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      competitive_matrix: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          matrix_name: string
          opportunity_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          matrix_name: string
          opportunity_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          matrix_name?: string
          opportunity_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      competitor_ghosts: {
        Row: {
          competitor_id: string | null
          counter_strategy: string | null
          created_at: string | null
          description: string | null
          ghost_type: string
          id: string
          opportunity_id: string | null
          owner_id: string | null
          status: string | null
          target_section: string | null
          title: string
        }
        Insert: {
          competitor_id?: string | null
          counter_strategy?: string | null
          created_at?: string | null
          description?: string | null
          ghost_type: string
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          status?: string | null
          target_section?: string | null
          title: string
        }
        Update: {
          competitor_id?: string | null
          counter_strategy?: string | null
          created_at?: string | null
          description?: string | null
          ghost_type?: string
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          status?: string | null
          target_section?: string | null
          title?: string
        }
        Relationships: []
      }
      competitor_intel_history: {
        Row: {
          competitor_id: string | null
          confidence: string | null
          content: string | null
          id: string
          intel_type: string | null
          recorded_at: string | null
          recorded_by: string | null
          source: string | null
        }
        Insert: {
          competitor_id?: string | null
          confidence?: string | null
          content?: string | null
          id?: string
          intel_type?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          source?: string | null
        }
        Update: {
          competitor_id?: string | null
          confidence?: string | null
          content?: string | null
          id?: string
          intel_type?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          source?: string | null
        }
        Relationships: []
      }
      competitors: {
        Row: {
          counter_strategy: string | null
          created_at: string | null
          ghost_themes: string[] | null
          id: string
          incumbent: boolean | null
          likely_strategy: string | null
          name: string
          notes: string | null
          opportunity_id: string | null
          pwin_estimate: number | null
          strengths: string[] | null
          threat_level: string | null
          updated_at: string | null
          weaknesses: string[] | null
        }
        Insert: {
          counter_strategy?: string | null
          created_at?: string | null
          ghost_themes?: string[] | null
          id?: string
          incumbent?: boolean | null
          likely_strategy?: string | null
          name: string
          notes?: string | null
          opportunity_id?: string | null
          pwin_estimate?: number | null
          strengths?: string[] | null
          threat_level?: string | null
          updated_at?: string | null
          weaknesses?: string[] | null
        }
        Update: {
          counter_strategy?: string | null
          created_at?: string | null
          ghost_themes?: string[] | null
          id?: string
          incumbent?: boolean | null
          likely_strategy?: string | null
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          pwin_estimate?: number | null
          strengths?: string[] | null
          threat_level?: string | null
          updated_at?: string | null
          weaknesses?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checklist_items: {
        Row: {
          assigned_to: string | null
          category: string | null
          checklist_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          evidence_location: string | null
          id: string
          item_number: string | null
          notes: string | null
          priority: string | null
          requirement_text: string
          rfp_reference: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          evidence_location?: string | null
          id?: string
          item_number?: string | null
          notes?: string | null
          priority?: string | null
          requirement_text: string
          rfp_reference?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          evidence_location?: string | null
          id?: string
          item_number?: string | null
          notes?: string | null
          priority?: string | null
          requirement_text?: string
          rfp_reference?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "compliance_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checklists: {
        Row: {
          checklist_name: string
          checklist_type: string | null
          completed_items: number | null
          created_at: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          checklist_name: string
          checklist_type?: string | null
          completed_items?: number | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          checklist_name?: string
          checklist_type?: string | null
          completed_items?: number | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checklists_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          proposal_section: string | null
          requirement: string
          response: string | null
          section: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          proposal_section?: string | null
          requirement: string
          response?: string | null
          section?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          proposal_section?: string | null
          requirement?: string
          response?: string | null
          section?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_requirements: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string | null
          evidence_links: Json | null
          id: string
          notes: string | null
          opportunity_id: string | null
          page_reference: string | null
          priority: string | null
          reference: string
          requirement: string
          reviewer: string | null
          section: string | null
          status: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          volume_reference: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          evidence_links?: Json | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_reference?: string | null
          priority?: string | null
          reference: string
          requirement: string
          reviewer?: string | null
          section?: string | null
          status?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          volume_reference?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          evidence_links?: Json | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_reference?: string | null
          priority?: string | null
          reference?: string
          requirement?: string
          reviewer?: string | null
          section?: string | null
          status?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          volume_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_requirements_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_requirements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_requirements_reviewer_fkey"
            columns: ["reviewer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_requirements_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_clauses: {
        Row: {
          clause_number: string
          clause_title: string | null
          clause_type: string | null
          compliance_status: string | null
          created_at: string | null
          full_text: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string | null
          updated_at: string | null
        }
        Insert: {
          clause_number: string
          clause_title?: string | null
          clause_type?: string | null
          compliance_status?: string | null
          created_at?: string | null
          full_text?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          updated_at?: string | null
        }
        Update: {
          clause_number?: string
          clause_title?: string | null
          clause_type?: string | null
          compliance_status?: string | null
          created_at?: string | null
          full_text?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_clauses_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_clauses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_deliverables: {
        Row: {
          acceptance_criteria: string | null
          accepted_date: string | null
          assigned_to: string | null
          cdrl_number: string | null
          company_id: string | null
          created_at: string | null
          data_item_number: string | null
          deliverable_type: string | null
          description: string | null
          due_date: string | null
          file_links: Json | null
          frequency: string | null
          government_poc: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          priority: string | null
          rejection_reason: string | null
          reviewer: string | null
          status: string | null
          submission_method: string | null
          submitted_date: string | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          acceptance_criteria?: string | null
          accepted_date?: string | null
          assigned_to?: string | null
          cdrl_number?: string | null
          company_id?: string | null
          created_at?: string | null
          data_item_number?: string | null
          deliverable_type?: string | null
          description?: string | null
          due_date?: string | null
          file_links?: Json | null
          frequency?: string | null
          government_poc?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          rejection_reason?: string | null
          reviewer?: string | null
          status?: string | null
          submission_method?: string | null
          submitted_date?: string | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          acceptance_criteria?: string | null
          accepted_date?: string | null
          assigned_to?: string | null
          cdrl_number?: string | null
          company_id?: string | null
          created_at?: string | null
          data_item_number?: string | null
          deliverable_type?: string | null
          description?: string | null
          due_date?: string | null
          file_links?: Json | null
          frequency?: string | null
          government_poc?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          rejection_reason?: string | null
          reviewer?: string | null
          status?: string | null
          submission_method?: string | null
          submitted_date?: string | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_deliverables_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deliverables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deliverables_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deliverables_reviewer_fkey"
            columns: ["reviewer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_details: {
        Row: {
          award_date: string | null
          contract_number: string | null
          contracting_officer: string | null
          cor_name: string | null
          id: string
          opportunity_id: string
          pop_end: string | null
          pop_start: string | null
          updated_at: string | null
        }
        Insert: {
          award_date?: string | null
          contract_number?: string | null
          contracting_officer?: string | null
          cor_name?: string | null
          id?: string
          opportunity_id: string
          pop_end?: string | null
          pop_start?: string | null
          updated_at?: string | null
        }
        Update: {
          award_date?: string | null
          contract_number?: string | null
          contracting_officer?: string | null
          cor_name?: string | null
          id?: string
          opportunity_id?: string
          pop_end?: string | null
          pop_start?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          clause_count: number | null
          contract_type: string | null
          created_at: string | null
          expiry_date: string | null
          findings: number | null
          id: string
          risk_level: string | null
          vehicle_name: string
        }
        Insert: {
          clause_count?: number | null
          contract_type?: string | null
          created_at?: string | null
          expiry_date?: string | null
          findings?: number | null
          id?: string
          risk_level?: string | null
          vehicle_name: string
        }
        Update: {
          clause_count?: number | null
          contract_type?: string | null
          created_at?: string | null
          expiry_date?: string | null
          findings?: number | null
          id?: string
          risk_level?: string | null
          vehicle_name?: string
        }
        Relationships: []
      }
      cost_labor_categories: {
        Row: {
          annual_hours: number | null
          base_period_hours: number | null
          cost_volume_id: string | null
          created_at: string | null
          headcount: number | null
          hourly_rate: number
          id: string
          labor_category: string
          level: string | null
          loaded_rate: number | null
          notes: string | null
          option1_hours: number | null
          option2_hours: number | null
          option3_hours: number | null
          option4_hours: number | null
          sort_order: number | null
          total_cost: number | null
          total_hours: number | null
        }
        Insert: {
          annual_hours?: number | null
          base_period_hours?: number | null
          cost_volume_id?: string | null
          created_at?: string | null
          headcount?: number | null
          hourly_rate: number
          id?: string
          labor_category: string
          level?: string | null
          loaded_rate?: number | null
          notes?: string | null
          option1_hours?: number | null
          option2_hours?: number | null
          option3_hours?: number | null
          option4_hours?: number | null
          sort_order?: number | null
          total_cost?: number | null
          total_hours?: number | null
        }
        Update: {
          annual_hours?: number | null
          base_period_hours?: number | null
          cost_volume_id?: string | null
          created_at?: string | null
          headcount?: number | null
          hourly_rate?: number
          id?: string
          labor_category?: string
          level?: string | null
          loaded_rate?: number | null
          notes?: string | null
          option1_hours?: number | null
          option2_hours?: number | null
          option3_hours?: number | null
          option4_hours?: number | null
          sort_order?: number | null
          total_cost?: number | null
          total_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_labor_categories_cost_volume_id_fkey"
            columns: ["cost_volume_id"]
            isOneToOne: false
            referencedRelation: "cost_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_odcs: {
        Row: {
          category: string
          cost_volume_id: string | null
          created_at: string | null
          description: string | null
          id: string
          notes: string | null
          period: string | null
          quantity: number | null
          recurring: boolean | null
          total_cost: number | null
          unit_cost: number | null
        }
        Insert: {
          category: string
          cost_volume_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          period?: string | null
          quantity?: number | null
          recurring?: boolean | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Update: {
          category?: string
          cost_volume_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          period?: string | null
          quantity?: number | null
          recurring?: boolean | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_odcs_cost_volume_id_fkey"
            columns: ["cost_volume_id"]
            isOneToOne: false
            referencedRelation: "cost_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_volumes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_period_months: number | null
          company_id: string | null
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          direct_labor_total: number | null
          fee_percent: number | null
          fee_total: number | null
          fringe_rate: number | null
          ga_rate: number | null
          id: string
          indirect_costs_total: number | null
          notes: string | null
          odc_total: number | null
          opportunity_id: string | null
          option_periods: number | null
          overhead_rate: number | null
          period_of_performance_months: number | null
          status: string | null
          subcontract_total: number | null
          total_ceiling: number | null
          total_proposed: number | null
          updated_at: string | null
          version: number | null
          volume_name: string
          wrap_rate: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_period_months?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          direct_labor_total?: number | null
          fee_percent?: number | null
          fee_total?: number | null
          fringe_rate?: number | null
          ga_rate?: number | null
          id?: string
          indirect_costs_total?: number | null
          notes?: string | null
          odc_total?: number | null
          opportunity_id?: string | null
          option_periods?: number | null
          overhead_rate?: number | null
          period_of_performance_months?: number | null
          status?: string | null
          subcontract_total?: number | null
          total_ceiling?: number | null
          total_proposed?: number | null
          updated_at?: string | null
          version?: number | null
          volume_name: string
          wrap_rate?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_period_months?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          direct_labor_total?: number | null
          fee_percent?: number | null
          fee_total?: number | null
          fringe_rate?: number | null
          ga_rate?: number | null
          id?: string
          indirect_costs_total?: number | null
          notes?: string | null
          odc_total?: number | null
          opportunity_id?: string | null
          option_periods?: number | null
          overhead_rate?: number | null
          period_of_performance_months?: number | null
          status?: string | null
          subcontract_total?: number | null
          total_ceiling?: number | null
          total_proposed?: number | null
          updated_at?: string | null
          version?: number | null
          volume_name?: string
          wrap_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_volumes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_volumes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      cui_classification_audit: {
        Row: {
          action: string | null
          agent_type: string
          classification_category: string
          classification_confidence: number
          classification_reasoning: string | null
          company_id: string | null
          created_at: string
          id: string
          matched_patterns_count: number | null
          model_routed: string
          opportunity_id: string | null
          query_hash: string
          query_length: number | null
          requires_fedramp_high: boolean
          user_dn: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          agent_type: string
          classification_category: string
          classification_confidence: number
          classification_reasoning?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          matched_patterns_count?: number | null
          model_routed: string
          opportunity_id?: string | null
          query_hash: string
          query_length?: number | null
          requires_fedramp_high: boolean
          user_dn?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          agent_type?: string
          classification_category?: string
          classification_confidence?: number
          classification_reasoning?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          matched_patterns_count?: number | null
          model_routed?: string
          opportunity_id?: string | null
          query_hash?: string
          query_length?: number | null
          requires_fedramp_high?: boolean
          user_dn?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cui_classification_audit_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cui_classification_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cui_watermarks: {
        Row: {
          accessed_count: number | null
          document_type: string | null
          generated_at: string | null
          id: string
          last_accessed_at: string | null
          opportunity_id: string | null
          partner_access_id: string | null
          watermark_code: string
        }
        Insert: {
          accessed_count?: number | null
          document_type?: string | null
          generated_at?: string | null
          id?: string
          last_accessed_at?: string | null
          opportunity_id?: string | null
          partner_access_id?: string | null
          watermark_code: string
        }
        Update: {
          accessed_count?: number | null
          document_type?: string | null
          generated_at?: string | null
          id?: string
          last_accessed_at?: string | null
          opportunity_id?: string | null
          partner_access_id?: string | null
          watermark_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "cui_watermarks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cui_watermarks_partner_access_id_fkey"
            columns: ["partner_access_id"]
            isOneToOne: false
            referencedRelation: "partner_access"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_role_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          custom_role_id: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean | null
          opportunity_id: string | null
          organization_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          custom_role_id?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_id?: string | null
          organization_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          custom_role_id?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_id?: string | null
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_assignments_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          allowed_ai_agents: string[] | null
          auto_revoke_on_submit: boolean | null
          base_role: string
          can_export_cui: boolean | null
          classification_ceiling: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          force_cui_watermark: boolean | null
          gate_approval_levels: string[] | null
          id: string
          is_active: boolean | null
          is_external_role: boolean | null
          module_permissions: Json | null
          organization_id: string | null
          role_name: string
          session_timeout_seconds: number | null
          ui_complexity_level: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_ai_agents?: string[] | null
          auto_revoke_on_submit?: boolean | null
          base_role?: string
          can_export_cui?: boolean | null
          classification_ceiling?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          force_cui_watermark?: boolean | null
          gate_approval_levels?: string[] | null
          id?: string
          is_active?: boolean | null
          is_external_role?: boolean | null
          module_permissions?: Json | null
          organization_id?: string | null
          role_name: string
          session_timeout_seconds?: number | null
          ui_complexity_level?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_ai_agents?: string[] | null
          auto_revoke_on_submit?: boolean | null
          base_role?: string
          can_export_cui?: boolean | null
          classification_ceiling?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          force_cui_watermark?: boolean | null
          gate_approval_levels?: string[] | null
          id?: string
          is_active?: boolean | null
          is_external_role?: boolean | null
          module_permissions?: Json | null
          organization_id?: string | null
          role_name?: string
          session_timeout_seconds?: number | null
          ui_complexity_level?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          height: number | null
          id: string
          is_visible: boolean | null
          position_x: number | null
          position_y: number | null
          title: string | null
          user_id: string | null
          widget_type: string
          width: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          position_x?: number | null
          position_y?: number | null
          title?: string | null
          user_id?: string | null
          widget_type: string
          width?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          position_x?: number | null
          position_y?: number | null
          title?: string | null
          user_id?: string | null
          widget_type?: string
          width?: number | null
        }
        Relationships: []
      }
      deal_sources: {
        Row: {
          display_name: string
          icon: string | null
          id: string
          source_key: string
        }
        Insert: {
          display_name: string
          icon?: string | null
          id?: string
          source_key: string
        }
        Update: {
          display_name?: string
          icon?: string | null
          id?: string
          source_key?: string
        }
        Relationships: []
      }
      debriefs: {
        Row: {
          action_items: Json | null
          attendees: Json | null
          company_id: string | null
          competitor_insights: Json | null
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          debrief_date: string | null
          debrief_type: string | null
          evaluator_feedback: Json | null
          id: string
          lessons_learned: Json | null
          notes: string | null
          opportunity_id: string | null
          opportunity_name: string | null
          outcome: string | null
          strengths: Json | null
          updated_at: string | null
          weaknesses: Json | null
        }
        Insert: {
          action_items?: Json | null
          attendees?: Json | null
          company_id?: string | null
          competitor_insights?: Json | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          debrief_date?: string | null
          debrief_type?: string | null
          evaluator_feedback?: Json | null
          id?: string
          lessons_learned?: Json | null
          notes?: string | null
          opportunity_id?: string | null
          opportunity_name?: string | null
          outcome?: string | null
          strengths?: Json | null
          updated_at?: string | null
          weaknesses?: Json | null
        }
        Update: {
          action_items?: Json | null
          attendees?: Json | null
          company_id?: string | null
          competitor_insights?: Json | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          debrief_date?: string | null
          debrief_type?: string | null
          evaluator_feedback?: Json | null
          id?: string
          lessons_learned?: Json | null
          notes?: string | null
          opportunity_id?: string | null
          opportunity_name?: string | null
          outcome?: string | null
          strengths?: Json | null
          updated_at?: string | null
          weaknesses?: Json | null
        }
        Relationships: []
      }
      discriminators: {
        Row: {
          created_at: string | null
          discriminator_text: string
          discriminator_type: string | null
          evidence_source: string | null
          id: string
          opportunity_id: string | null
          quantified_value: string | null
          status: string | null
          vs_competitor: string | null
        }
        Insert: {
          created_at?: string | null
          discriminator_text: string
          discriminator_type?: string | null
          evidence_source?: string | null
          id?: string
          opportunity_id?: string | null
          quantified_value?: string | null
          status?: string | null
          vs_competitor?: string | null
        }
        Update: {
          created_at?: string | null
          discriminator_text?: string
          discriminator_type?: string | null
          evidence_source?: string | null
          id?: string
          opportunity_id?: string | null
          quantified_value?: string | null
          status?: string | null
          vs_competitor?: string | null
        }
        Relationships: []
      }
      doc_collaborations: {
        Row: {
          collaborators: Json | null
          company_id: string | null
          content: string | null
          created_at: string | null
          doc_type: string
          id: string
          last_edited_at: string | null
          last_edited_by: string | null
          lock_expires: string | null
          lock_holder: string | null
          opportunity_id: string | null
          owner_id: string | null
          permissions: Json | null
          status: string | null
          title: string
          word_count: number | null
        }
        Insert: {
          collaborators?: Json | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          doc_type: string
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          lock_expires?: string | null
          lock_holder?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          permissions?: Json | null
          status?: string | null
          title: string
          word_count?: number | null
        }
        Update: {
          collaborators?: Json | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          doc_type?: string
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          lock_expires?: string | null
          lock_holder?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          permissions?: Json | null
          status?: string | null
          title?: string
          word_count?: number | null
        }
        Relationships: []
      }
      doc_comments: {
        Row: {
          content: string
          created_at: string | null
          doc_id: string | null
          id: string
          position: Json | null
          status: string | null
          thread_id: string | null
          user_avatar: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          doc_id?: string | null
          id?: string
          position?: Json | null
          status?: string | null
          thread_id?: string | null
          user_avatar?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          doc_id?: string | null
          id?: string
          position?: Json | null
          status?: string | null
          thread_id?: string | null
          user_avatar?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_comments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "doc_collaborations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          company_id: string | null
          content: string
          created_at: string | null
          document_id: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          company_id?: string | null
          content: string
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          company_id?: string | null
          content?: string
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_comments: {
        Row: {
          annotation_data: Json | null
          assigned_to: string | null
          company_id: string | null
          content: string
          created_at: string | null
          document_id: string | null
          document_type: string | null
          id: string
          opportunity_id: string | null
          parent_id: string | null
          priority: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          annotation_data?: Json | null
          assigned_to?: string | null
          company_id?: string | null
          content: string
          created_at?: string | null
          document_id?: string | null
          document_type?: string | null
          id?: string
          opportunity_id?: string | null
          parent_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          annotation_data?: Json | null
          assigned_to?: string | null
          company_id?: string | null
          content?: string
          created_at?: string | null
          document_id?: string | null
          document_type?: string | null
          id?: string
          opportunity_id?: string | null
          parent_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_comments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string | null
          company_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          tags: Json | null
          template_name: string
          template_type: string
          updated_at: string | null
          updated_by: string | null
          version: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          tags?: Json | null
          template_name: string
          template_type: string
          updated_at?: string | null
          updated_by?: string | null
          version?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          tags?: Json | null
          template_name?: string
          template_type?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: string | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          changes_summary: string | null
          company_id: string | null
          content: Json | null
          created_at: string | null
          created_by: string | null
          diff_from_previous: Json | null
          document_id: string | null
          document_type: string
          file_size: number | null
          file_url: string | null
          id: string
          is_milestone: boolean | null
          opportunity_id: string | null
          version_label: string | null
          version_number: number
        }
        Insert: {
          changes_summary?: string | null
          company_id?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          diff_from_previous?: Json | null
          document_id?: string | null
          document_type: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_milestone?: boolean | null
          opportunity_id?: string | null
          version_label?: string | null
          version_number: number
        }
        Update: {
          changes_summary?: string | null
          company_id?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          diff_from_previous?: Json | null
          document_id?: string | null
          document_type?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_milestone?: boolean | null
          opportunity_id?: string | null
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string | null
          created_at: string | null
          current_version: number | null
          description: string | null
          document_name: string
          document_type: string | null
          file_size: number | null
          file_url: string | null
          folder_path: string | null
          id: string
          is_locked: boolean | null
          locked_at: string | null
          locked_by: string | null
          mime_type: string | null
          opportunity_id: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          current_version?: number | null
          description?: string | null
          document_name: string
          document_type?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_path?: string | null
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          mime_type?: string | null
          opportunity_id?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          current_version?: number | null
          description?: string | null
          document_name?: string
          document_type?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_path?: string | null
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          mime_type?: string | null
          opportunity_id?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      exec_snapshots: {
        Row: {
          active_proposals: number | null
          avg_pwin: number | null
          company_id: string | null
          created_at: string | null
          id: string
          losses_quarter: number | null
          metrics: Json | null
          opportunity_count: number | null
          pipeline_value: number | null
          snapshot_date: string
          team_utilization: number | null
          weighted_pipeline: number | null
          win_rate: number | null
          wins_quarter: number | null
          won_value_quarter: number | null
        }
        Insert: {
          active_proposals?: number | null
          avg_pwin?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          losses_quarter?: number | null
          metrics?: Json | null
          opportunity_count?: number | null
          pipeline_value?: number | null
          snapshot_date: string
          team_utilization?: number | null
          weighted_pipeline?: number | null
          win_rate?: number | null
          wins_quarter?: number | null
          won_value_quarter?: number | null
        }
        Update: {
          active_proposals?: number | null
          avg_pwin?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          losses_quarter?: number | null
          metrics?: Json | null
          opportunity_count?: number | null
          pipeline_value?: number | null
          snapshot_date?: string
          team_utilization?: number | null
          weighted_pipeline?: number | null
          win_rate?: number | null
          wins_quarter?: number | null
          won_value_quarter?: number | null
        }
        Relationships: []
      }
      executive_reports: {
        Row: {
          company_id: string | null
          created_at: string | null
          data_snapshot: Json | null
          date_range_end: string | null
          date_range_start: string | null
          filters: Json | null
          generated_at: string | null
          generated_by: string | null
          id: string
          is_scheduled: boolean | null
          last_sent_at: string | null
          recipients: string[] | null
          report_code: string | null
          report_type: string | null
          schedule_frequency: string | null
          summary_metrics: Json | null
          title: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          data_snapshot?: Json | null
          date_range_end?: string | null
          date_range_start?: string | null
          filters?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          is_scheduled?: boolean | null
          last_sent_at?: string | null
          recipients?: string[] | null
          report_code?: string | null
          report_type?: string | null
          schedule_frequency?: string | null
          summary_metrics?: Json | null
          title: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          data_snapshot?: Json | null
          date_range_end?: string | null
          date_range_start?: string | null
          filters?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          is_scheduled?: boolean | null
          last_sent_at?: string | null
          recipients?: string[] | null
          report_code?: string | null
          report_type?: string | null
          schedule_frequency?: string | null
          summary_metrics?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executive_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_summaries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          closing_statement: string | null
          company_id: string | null
          compliance_score: number | null
          created_at: string | null
          created_by: string | null
          id: string
          key_differentiators: string | null
          opening_hook: string | null
          opportunity_id: string | null
          proof_points: string | null
          readability_score: number | null
          solution_overview: string | null
          status: string | null
          target_word_count: number | null
          title: string
          understanding_statement: string | null
          updated_at: string | null
          value_proposition: string | null
          version: number | null
          win_themes_used: string[] | null
          word_count: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          closing_statement?: string | null
          company_id?: string | null
          compliance_score?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          key_differentiators?: string | null
          opening_hook?: string | null
          opportunity_id?: string | null
          proof_points?: string | null
          readability_score?: number | null
          solution_overview?: string | null
          status?: string | null
          target_word_count?: number | null
          title: string
          understanding_statement?: string | null
          updated_at?: string | null
          value_proposition?: string | null
          version?: number | null
          win_themes_used?: string[] | null
          word_count?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          closing_statement?: string | null
          company_id?: string | null
          compliance_score?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          key_differentiators?: string | null
          opening_hook?: string | null
          opportunity_id?: string | null
          proof_points?: string | null
          readability_score?: number | null
          solution_overview?: string | null
          status?: string | null
          target_word_count?: number | null
          title?: string
          understanding_statement?: string | null
          updated_at?: string | null
          value_proposition?: string | null
          version?: number | null
          win_themes_used?: string[] | null
          word_count?: number | null
        }
        Relationships: []
      }
      exhibit_graphics: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          current_pages: number | null
          description: string | null
          due_date: string | null
          exhibit_number: string
          exhibit_type: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          page_limit: number | null
          section_reference: string | null
          sort_order: number | null
          source_file: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          current_pages?: number | null
          description?: string | null
          due_date?: string | null
          exhibit_number: string
          exhibit_type?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          section_reference?: string | null
          sort_order?: number | null
          source_file?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          current_pages?: number | null
          description?: string | null
          due_date?: string | null
          exhibit_number?: string
          exhibit_type?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          section_reference?: string | null
          sort_order?: number | null
          source_file?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_suggestions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          status: string | null
          submitted_by: string | null
          title: string
          updated_at: string | null
          votes: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string | null
          votes?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string | null
          votes?: number | null
        }
        Relationships: []
      }
      feature_votes: {
        Row: {
          created_at: string | null
          id: string
          suggestion_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          suggestion_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          suggestion_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "feature_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      file_attachments: {
        Row: {
          classification: string | null
          company_id: string
          description: string | null
          file_size: number | null
          file_type: string | null
          filename: string
          id: string
          opportunity_id: string | null
          section_id: string | null
          storage_path: string
          tags: string[] | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          classification?: string | null
          company_id: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          filename: string
          id?: string
          opportunity_id?: string | null
          section_id?: string | null
          storage_path: string
          tags?: string[] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          classification?: string | null
          company_id?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string
          id?: string
          opportunity_id?: string | null
          section_id?: string | null
          storage_path?: string
          tags?: string[] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      frenemy_entities: {
        Row: {
          cage_code: string | null
          capabilities: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          entity_name: string
          id: string
          intel_notes: string | null
          opportunity_id: string | null
          relationship: string | null
          set_aside_status: string | null
          strengths: string | null
          threat_score: number | null
          updated_at: string | null
          weaknesses: string | null
          win_rate: number | null
        }
        Insert: {
          cage_code?: string | null
          capabilities?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          entity_name: string
          id?: string
          intel_notes?: string | null
          opportunity_id?: string | null
          relationship?: string | null
          set_aside_status?: string | null
          strengths?: string | null
          threat_score?: number | null
          updated_at?: string | null
          weaknesses?: string | null
          win_rate?: number | null
        }
        Update: {
          cage_code?: string | null
          capabilities?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          entity_name?: string
          id?: string
          intel_notes?: string | null
          opportunity_id?: string | null
          relationship?: string | null
          set_aside_status?: string | null
          strengths?: string | null
          threat_score?: number | null
          updated_at?: string | null
          weaknesses?: string | null
          win_rate?: number | null
        }
        Relationships: []
      }
      gate_reviews: {
        Row: {
          company_id: string | null
          conditions: string[] | null
          created_at: string | null
          decision: string | null
          gate_name: string | null
          gate_number: number | null
          id: string
          opportunity_id: string | null
          pwin_at_gate: number | null
        }
        Insert: {
          company_id?: string | null
          conditions?: string[] | null
          created_at?: string | null
          decision?: string | null
          gate_name?: string | null
          gate_number?: number | null
          id?: string
          opportunity_id?: string | null
          pwin_at_gate?: number | null
        }
        Update: {
          company_id?: string | null
          conditions?: string[] | null
          created_at?: string | null
          decision?: string | null
          gate_name?: string | null
          gate_number?: number | null
          id?: string
          opportunity_id?: string | null
          pwin_at_gate?: number | null
        }
        Relationships: []
      }
      generated_reports: {
        Row: {
          company_id: string | null
          created_at: string | null
          file_url: string | null
          generated_at: string | null
          id: string
          opportunity_id: string | null
          output_format: string | null
          parameters: Json | null
          report_type: string
          status: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string
          opportunity_id?: string | null
          output_format?: string | null
          parameters?: Json | null
          report_type: string
          status?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string
          opportunity_id?: string | null
          output_format?: string | null
          parameters?: Json | null
          report_type?: string
          status?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_visuals: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          mermaid_code: string | null
          opportunity_id: string | null
          prompt: string | null
          status: string | null
          title: string
          visual_type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          mermaid_code?: string | null
          opportunity_id?: string | null
          prompt?: string | null
          status?: string | null
          title: string
          visual_type?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          mermaid_code?: string | null
          opportunity_id?: string | null
          prompt?: string | null
          status?: string | null
          title?: string
          visual_type?: string
        }
        Relationships: []
      }
      government_questions: {
        Row: {
          amendment_number: string | null
          assigned_to: string | null
          category: string | null
          created_at: string | null
          id: string
          is_amendment_related: boolean | null
          notes: string | null
          opportunity_id: string | null
          priority: string | null
          question_number: string | null
          question_text: string
          response_date: string | null
          response_impact: string | null
          response_text: string | null
          section_reference: string | null
          sort_order: number | null
          source: string | null
          status: string | null
          submitted_date: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          amendment_number?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_amendment_related?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          question_number?: string | null
          question_text: string
          response_date?: string | null
          response_impact?: string | null
          response_text?: string | null
          section_reference?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string | null
          submitted_date?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          amendment_number?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_amendment_related?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          question_number?: string | null
          question_text?: string
          response_date?: string | null
          response_impact?: string | null
          response_text?: string | null
          section_reference?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string | null
          submitted_date?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      graphic_versions: {
        Row: {
          change_notes: string | null
          file_url: string | null
          graphic_id: string | null
          id: string
          uploaded_at: string | null
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          file_url?: string | null
          graphic_id?: string | null
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          file_url?: string | null
          graphic_id?: string | null
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "graphic_versions_graphic_id_fkey"
            columns: ["graphic_id"]
            isOneToOne: false
            referencedRelation: "proposal_graphics"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          category: string
          company_id: string | null
          content: string | null
          created_at: string | null
          helpful_count: number | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          related_articles: string[] | null
          slug: string | null
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          video_url: string | null
          view_count: number | null
        }
        Insert: {
          category: string
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          related_articles?: string[] | null
          slug?: string | null
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
        }
        Update: {
          category?: string
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          related_articles?: string[] | null
          slug?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hitl_queue: {
        Row: {
          agent_source: string | null
          ai_output: string
          assigned_reviewer: string | null
          company_id: string | null
          confidence_score: number | null
          content_type: string
          created_at: string | null
          evidence_coverage: number | null
          id: string
          opportunity_id: string | null
          priority: string | null
          section: string
          section_ref: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_source?: string | null
          ai_output: string
          assigned_reviewer?: string | null
          company_id?: string | null
          confidence_score?: number | null
          content_type: string
          created_at?: string | null
          evidence_coverage?: number | null
          id?: string
          opportunity_id?: string | null
          priority?: string | null
          section: string
          section_ref?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_source?: string | null
          ai_output?: string
          assigned_reviewer?: string | null
          company_id?: string | null
          confidence_score?: number | null
          content_type?: string
          created_at?: string | null
          evidence_coverage?: number | null
          id?: string
          opportunity_id?: string | null
          priority?: string | null
          section?: string
          section_ref?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hitl_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hitl_reviews: {
        Row: {
          action: string
          created_at: string | null
          id: string
          original_content: string | null
          queue_item_id: string | null
          review_notes: string | null
          reviewer_id: string | null
          revised_content: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          original_content?: string | null
          queue_item_id?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          revised_content?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          original_content?: string | null
          queue_item_id?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          revised_content?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hitl_reviews_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "hitl_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_field_mapping: {
        Row: {
          hubspot_field: string
          hubspot_type: string | null
          id: string
          missionpulse_field: string
          notes: string | null
          sync_direction: string | null
        }
        Insert: {
          hubspot_field: string
          hubspot_type?: string | null
          id?: string
          missionpulse_field: string
          notes?: string | null
          sync_direction?: string | null
        }
        Update: {
          hubspot_field?: string
          hubspot_type?: string | null
          id?: string
          missionpulse_field?: string
          notes?: string | null
          sync_direction?: string | null
        }
        Relationships: []
      }
      hubspot_field_mappings: {
        Row: {
          created_at: string | null
          direction: string | null
          hubspot_field: string
          id: string
          is_active: boolean | null
          missionpulse_field: string
          transform_config: Json | null
          transform_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string | null
          hubspot_field: string
          id?: string
          is_active?: boolean | null
          missionpulse_field: string
          transform_config?: Json | null
          transform_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string | null
          hubspot_field?: string
          id?: string
          is_active?: boolean | null
          missionpulse_field?: string
          transform_config?: Json | null
          transform_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      hubspot_sync_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          fields_synced: Json | null
          hubspot_deal_id: string | null
          id: string
          opportunity_id: string | null
          sync_direction: string | null
          sync_status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          fields_synced?: Json | null
          hubspot_deal_id?: string | null
          id?: string
          opportunity_id?: string | null
          sync_direction?: string | null
          sync_status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          fields_synced?: Json | null
          hubspot_deal_id?: string | null
          id?: string
          opportunity_id?: string | null
          sync_direction?: string | null
          sync_status?: string | null
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string | null
          error_details: Json | null
          id: string
          integration_id: string | null
          records_processed: number | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          records_processed?: number | null
          status: string
        }
        Update: {
          action?: string
          created_at?: string | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          records_processed?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          integration_id: string | null
          records_synced: number | null
          started_at: string | null
          success: boolean | null
          sync_type: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          records_synced?: number | null
          started_at?: string | null
          success?: boolean | null
          sync_type?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          records_synced?: number | null
          started_at?: string | null
          success?: boolean | null
          sync_type?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          company_id: string | null
          config: Json | null
          created_at: string | null
          credentials_encrypted: string | null
          error_message: string | null
          id: string
          last_sync: string | null
          name: string
          provider: string
          status: string | null
          sync_frequency: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          config?: Json | null
          created_at?: string | null
          credentials_encrypted?: string | null
          error_message?: string | null
          id?: string
          last_sync?: string | null
          name: string
          provider: string
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          config?: Json | null
          created_at?: string | null
          credentials_encrypted?: string | null
          error_message?: string | null
          id?: string
          last_sync?: string | null
          name?: string
          provider?: string
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      intel_collection: {
        Row: {
          attachments: Json | null
          classification: string | null
          collected_by: string | null
          company_id: string | null
          confidence_level: string | null
          content: string
          created_at: string | null
          expires_at: string | null
          id: string
          intel_type: string
          opportunity_id: string | null
          relevance_score: number | null
          source_name: string | null
          source_type: string | null
          tags: string[] | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          attachments?: Json | null
          classification?: string | null
          collected_by?: string | null
          company_id?: string | null
          confidence_level?: string | null
          content: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          intel_type: string
          opportunity_id?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_type?: string | null
          tags?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          attachments?: Json | null
          classification?: string | null
          collected_by?: string | null
          company_id?: string | null
          confidence_level?: string | null
          content?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          intel_type?: string
          opportunity_id?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_type?: string | null
          tags?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      intel_recordings: {
        Row: {
          action_items: Json | null
          ai_summary: string | null
          attendees: string[] | null
          audio_url: string | null
          competitor_mentions: Json | null
          created_at: string | null
          duration_seconds: number | null
          extracted_intel: Json | null
          id: string
          meeting_type: string | null
          opportunity_id: string | null
          processed: boolean | null
          recorded_by: string | null
          recording_date: string | null
          synced_to_intel: boolean | null
          title: string
          transcription: string | null
          updated_at: string | null
        }
        Insert: {
          action_items?: Json | null
          ai_summary?: string | null
          attendees?: string[] | null
          audio_url?: string | null
          competitor_mentions?: Json | null
          created_at?: string | null
          duration_seconds?: number | null
          extracted_intel?: Json | null
          id?: string
          meeting_type?: string | null
          opportunity_id?: string | null
          processed?: boolean | null
          recorded_by?: string | null
          recording_date?: string | null
          synced_to_intel?: boolean | null
          title: string
          transcription?: string | null
          updated_at?: string | null
        }
        Update: {
          action_items?: Json | null
          ai_summary?: string | null
          attendees?: string[] | null
          audio_url?: string | null
          competitor_mentions?: Json | null
          created_at?: string | null
          duration_seconds?: number | null
          extracted_intel?: Json | null
          id?: string
          meeting_type?: string | null
          opportunity_id?: string | null
          processed?: boolean | null
          recorded_by?: string | null
          recording_date?: string | null
          synced_to_intel?: boolean | null
          title?: string
          transcription?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      interview_prep: {
        Row: {
          candidate_name: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          evaluator_names: string[] | null
          id: string
          interview_date: string | null
          interview_type: string | null
          notes: string | null
          opportunity_id: string | null
          overall_score: number | null
          position_title: string | null
          recommendation: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          candidate_name: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          evaluator_names?: string[] | null
          id?: string
          interview_date?: string | null
          interview_type?: string | null
          notes?: string | null
          opportunity_id?: string | null
          overall_score?: number | null
          position_title?: string | null
          recommendation?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          candidate_name?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          evaluator_names?: string[] | null
          id?: string
          interview_date?: string | null
          interview_type?: string | null
          notes?: string | null
          opportunity_id?: string | null
          overall_score?: number | null
          position_title?: string | null
          recommendation?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      interview_questions: {
        Row: {
          actual_response: string | null
          created_at: string | null
          evaluator_notes: string | null
          expected_response: string | null
          id: string
          interview_id: string | null
          question_category: string | null
          question_text: string
          score: number | null
          sort_order: number | null
        }
        Insert: {
          actual_response?: string | null
          created_at?: string | null
          evaluator_notes?: string | null
          expected_response?: string | null
          id?: string
          interview_id?: string | null
          question_category?: string | null
          question_text: string
          score?: number | null
          sort_order?: number | null
        }
        Update: {
          actual_response?: string | null
          created_at?: string | null
          evaluator_notes?: string | null
          expected_response?: string | null
          id?: string
          interview_id?: string | null
          question_category?: string | null
          question_text?: string
          score?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interview_prep"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string | null
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          author_id: string | null
          author_name: string | null
          category: string | null
          company_id: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          is_published: boolean | null
          likes: number | null
          source_id: string | null
          source_type: string | null
          tags: Json | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean | null
          likes?: number | null
          source_id?: string | null
          source_type?: string | null
          tags?: Json | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean | null
          likes?: number | null
          source_id?: string | null
          source_type?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      kb_categories: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      key_personnel: {
        Row: {
          annual_salary: number | null
          availability_status: string | null
          certifications: string[] | null
          clearance_level: string | null
          clearance_status: string | null
          company_id: string | null
          created_at: string | null
          current_project: string | null
          education_level: string | null
          email: string | null
          employee_type: string | null
          first_name: string
          hire_date: string | null
          hourly_rate: number | null
          id: string
          labor_category: string | null
          last_name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          resume_url: string | null
          skills: string[] | null
          title: string | null
          updated_at: string | null
          years_experience: number | null
        }
        Insert: {
          annual_salary?: number | null
          availability_status?: string | null
          certifications?: string[] | null
          clearance_level?: string | null
          clearance_status?: string | null
          company_id?: string | null
          created_at?: string | null
          current_project?: string | null
          education_level?: string | null
          email?: string | null
          employee_type?: string | null
          first_name: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          labor_category?: string | null
          last_name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          title?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Update: {
          annual_salary?: number | null
          availability_status?: string | null
          certifications?: string[] | null
          clearance_level?: string | null
          clearance_status?: string | null
          company_id?: string | null
          created_at?: string | null
          current_project?: string | null
          education_level?: string | null
          email?: string | null
          employee_type?: string | null
          first_name?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          labor_category?: string | null
          last_name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          title?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "key_personnel_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number | null
          company_id: string | null
          content: string
          created_at: string | null
          document_id: string | null
          fts: unknown
          id: string
          metadata: Json | null
          token_count: number | null
        }
        Insert: {
          chunk_index?: number | null
          company_id?: string | null
          content: string
          created_at?: string | null
          document_id?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          token_count?: number | null
        }
        Update: {
          chunk_index?: number | null
          company_id?: string | null
          content?: string
          created_at?: string | null
          document_id?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          token_count?: number | null
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          category: string
          chunk_count: number | null
          company_id: string | null
          created_at: string | null
          error_message: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          metadata: Json | null
          processed_at: string | null
          status: string | null
          storage_path: string | null
          tags: string[] | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: string | null
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: string | null
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      knowledge_embeddings: {
        Row: {
          chunk_index: number | null
          chunk_text: string
          company_id: string | null
          created_at: string | null
          document_id: string | null
          embedding: Json | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index?: number | null
          chunk_text: string
          company_id?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding?: Json | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number | null
          chunk_text?: string
          company_id?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding?: Json | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_categories: {
        Row: {
          alt_lcats: string[] | null
          bill_rate_high: number | null
          bill_rate_low: number | null
          company_id: string | null
          created_at: string | null
          family: string
          gsa_lcat: string | null
          id: string
          level: number | null
          level_name: string
          years_experience: number | null
        }
        Insert: {
          alt_lcats?: string[] | null
          bill_rate_high?: number | null
          bill_rate_low?: number | null
          company_id?: string | null
          created_at?: string | null
          family: string
          gsa_lcat?: string | null
          id?: string
          level?: number | null
          level_name: string
          years_experience?: number | null
        }
        Update: {
          alt_lcats?: string[] | null
          bill_rate_high?: number | null
          bill_rate_low?: number | null
          company_id?: string | null
          created_at?: string | null
          family?: string
          gsa_lcat?: string | null
          id?: string
          level?: number | null
          level_name?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      launch_checklist: {
        Row: {
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string
          due_date: string | null
          id: string
          is_complete: boolean | null
          opportunity_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          opportunity_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          opportunity_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      launch_checklist_items: {
        Row: {
          assigned_to: string | null
          category: string
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          item_name: string
          notes: string | null
          priority: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          item_name: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      launch_checklists: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          item: string
          notes: string | null
          opportunity_id: string | null
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          item: string
          notes?: string | null
          opportunity_id?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          item?: string
          notes?: string | null
          opportunity_id?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_checklists_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_checklists_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_roi: {
        Row: {
          contract_value: number | null
          hourly_rate: number | null
          id: string
          labor_hours: number | null
          opportunity_id: string
          other_costs: number | null
          pwin: number | null
          updated_at: string | null
        }
        Insert: {
          contract_value?: number | null
          hourly_rate?: number | null
          id?: string
          labor_hours?: number | null
          opportunity_id: string
          other_costs?: number | null
          pwin?: number | null
          updated_at?: string | null
        }
        Update: {
          contract_value?: number | null
          hourly_rate?: number | null
          id?: string
          labor_hours?: number | null
          opportunity_id?: string
          other_costs?: number | null
          pwin?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lessons_learned: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          impact_area: string[] | null
          lesson_type: string | null
          opportunity_id: string | null
          outcome: string | null
          recommendation: string | null
          root_cause: string | null
          source_phase: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          impact_area?: string[] | null
          lesson_type?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          recommendation?: string | null
          root_cause?: string | null
          source_phase?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          impact_area?: string[] | null
          lesson_type?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          recommendation?: string | null
          root_cause?: string | null
          source_phase?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      matrix_competitors: {
        Row: {
          competitor_name: string
          competitor_type: string | null
          created_at: string | null
          id: string
          matrix_id: string | null
          strengths: string | null
          weaknesses: string | null
        }
        Insert: {
          competitor_name: string
          competitor_type?: string | null
          created_at?: string | null
          id?: string
          matrix_id?: string | null
          strengths?: string | null
          weaknesses?: string | null
        }
        Update: {
          competitor_name?: string
          competitor_type?: string | null
          created_at?: string | null
          id?: string
          matrix_id?: string | null
          strengths?: string | null
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matrix_competitors_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "competitive_matrix"
            referencedColumns: ["id"]
          },
        ]
      }
      matrix_criteria: {
        Row: {
          category: string | null
          created_at: string | null
          criteria_name: string
          id: string
          matrix_id: string | null
          our_notes: string | null
          our_score: number | null
          sort_order: number | null
          weight: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          criteria_name: string
          id?: string
          matrix_id?: string | null
          our_notes?: string | null
          our_score?: number | null
          sort_order?: number | null
          weight?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          criteria_name?: string
          id?: string
          matrix_id?: string | null
          our_notes?: string | null
          our_score?: number | null
          sort_order?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matrix_criteria_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "competitive_matrix"
            referencedColumns: ["id"]
          },
        ]
      }
      matrix_scores: {
        Row: {
          competitor_id: string | null
          created_at: string | null
          criteria_id: string | null
          id: string
          matrix_id: string | null
          notes: string | null
          score: number | null
        }
        Insert: {
          competitor_id?: string | null
          created_at?: string | null
          criteria_id?: string | null
          id?: string
          matrix_id?: string | null
          notes?: string | null
          score?: number | null
        }
        Update: {
          competitor_id?: string | null
          created_at?: string | null
          criteria_id?: string | null
          id?: string
          matrix_id?: string | null
          notes?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matrix_scores_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "matrix_competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matrix_scores_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "matrix_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matrix_scores_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "competitive_matrix"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_notifications: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          notification_type: string | null
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type?: string | null
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type?: string | null
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      mobile_quick_actions: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          status: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          status?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          status?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      mp_feature_usage: {
        Row: {
          feature: string
          id: string
          last_used_at: string | null
          user_id: string
          uses_remaining: number
          uses_total: number
        }
        Insert: {
          feature: string
          id?: string
          last_used_at?: string | null
          user_id: string
          uses_remaining?: number
          uses_total?: number
        }
        Update: {
          feature?: string
          id?: string
          last_used_at?: string | null
          user_id?: string
          uses_remaining?: number
          uses_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "mp_feature_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mp_users"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_scoring_history: {
        Row: {
          avg_score: number | null
          created_at: string | null
          feature: string
          file_name: string | null
          file_type: string | null
          id: string
          model_used: string | null
          overall_grade: string | null
          red_flags: Json | null
          scores: Json | null
          tokens_input: number | null
          tokens_output: number | null
          top_fix: string | null
          user_id: string
          verdict: string | null
        }
        Insert: {
          avg_score?: number | null
          created_at?: string | null
          feature?: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          model_used?: string | null
          overall_grade?: string | null
          red_flags?: Json | null
          scores?: Json | null
          tokens_input?: number | null
          tokens_output?: number | null
          top_fix?: string | null
          user_id: string
          verdict?: string | null
        }
        Update: {
          avg_score?: number | null
          created_at?: string | null
          feature?: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          model_used?: string | null
          overall_grade?: string | null
          red_flags?: Json | null
          scores?: Json | null
          tokens_input?: number | null
          tokens_output?: number | null
          top_fix?: string | null
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mp_scoring_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mp_users"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_users: {
        Row: {
          company: string | null
          converted_at: string | null
          converted_profile_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          last_active_at: string | null
          marketing_consent: boolean | null
          role: string | null
          source: string
          stripe_customer_id: string | null
          tier: string
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          converted_at?: string | null
          converted_profile_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          marketing_consent?: boolean | null
          role?: string | null
          source?: string
          stripe_customer_id?: string | null
          tier?: string
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          converted_at?: string | null
          converted_profile_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          marketing_consent?: boolean | null
          role?: string | null
          source?: string
          stripe_customer_id?: string | null
          tier?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mp_users_converted_profile_id_fkey"
            columns: ["converted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          in_app_enabled: boolean | null
          notification_type: string
          push_enabled: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          notification_type: string
          push_enabled?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          notification_type?: string
          push_enabled?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          link_text: string | null
          link_url: string | null
          message: string | null
          notification_type: string
          opportunity_id: string | null
          priority: string | null
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          link_text?: string | null
          link_url?: string | null
          message?: string | null
          notification_type: string
          opportunity_id?: string | null
          priority?: string | null
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          link_text?: string | null
          link_url?: string | null
          message?: string | null
          notification_type?: string
          opportunity_id?: string | null
          priority?: string | null
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          agency: string | null
          award_date: string | null
          bd_investment: number | null
          ceiling: number | null
          close_date: string | null
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          contract_vehicle: string | null
          created_at: string | null
          custom_properties: Json | null
          deal_source: string | null
          description: string | null
          due_date: string | null
          go_no_go: string | null
          govwin_id: string | null
          hubspot_deal_id: string | null
          hubspot_synced_at: string | null
          id: string
          incumbent: string | null
          is_recompete: boolean | null
          metadata: Json | null
          naics_code: string | null
          nickname: string | null
          notes: string | null
          owner_id: string | null
          period_of_performance: string | null
          phase: string | null
          pipeline_stage: string | null
          place_of_performance: string | null
          pop_end: string | null
          pop_start: string | null
          priority: string | null
          pwin: number | null
          sam_opportunity_id: string | null
          sam_url: string | null
          set_aside: string | null
          shipley_phase: string | null
          solicitation_number: string | null
          status: string | null
          sub_agency: string | null
          submission_date: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          win_probability: number | null
        }
        Insert: {
          agency?: string | null
          award_date?: string | null
          bd_investment?: number | null
          ceiling?: number | null
          close_date?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contract_vehicle?: string | null
          created_at?: string | null
          custom_properties?: Json | null
          deal_source?: string | null
          description?: string | null
          due_date?: string | null
          go_no_go?: string | null
          govwin_id?: string | null
          hubspot_deal_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          incumbent?: string | null
          is_recompete?: boolean | null
          metadata?: Json | null
          naics_code?: string | null
          nickname?: string | null
          notes?: string | null
          owner_id?: string | null
          period_of_performance?: string | null
          phase?: string | null
          pipeline_stage?: string | null
          place_of_performance?: string | null
          pop_end?: string | null
          pop_start?: string | null
          priority?: string | null
          pwin?: number | null
          sam_opportunity_id?: string | null
          sam_url?: string | null
          set_aside?: string | null
          shipley_phase?: string | null
          solicitation_number?: string | null
          status?: string | null
          sub_agency?: string | null
          submission_date?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          win_probability?: number | null
        }
        Update: {
          agency?: string | null
          award_date?: string | null
          bd_investment?: number | null
          ceiling?: number | null
          close_date?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contract_vehicle?: string | null
          created_at?: string | null
          custom_properties?: Json | null
          deal_source?: string | null
          description?: string | null
          due_date?: string | null
          go_no_go?: string | null
          govwin_id?: string | null
          hubspot_deal_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          incumbent?: string | null
          is_recompete?: boolean | null
          metadata?: Json | null
          naics_code?: string | null
          nickname?: string | null
          notes?: string | null
          owner_id?: string | null
          period_of_performance?: string | null
          phase?: string | null
          pipeline_stage?: string | null
          place_of_performance?: string | null
          pop_end?: string | null
          pop_start?: string | null
          priority?: string | null
          pwin?: number | null
          sam_opportunity_id?: string | null
          sam_url?: string | null
          set_aside?: string | null
          shipley_phase?: string | null
          solicitation_number?: string | null
          status?: string | null
          sub_agency?: string | null
          submission_date?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_assignments: {
        Row: {
          assignee_email: string | null
          assignee_name: string
          created_at: string | null
          id: string
          opportunity_id: string
          role: string
        }
        Insert: {
          assignee_email?: string | null
          assignee_name: string
          created_at?: string | null
          id?: string
          opportunity_id: string
          role: string
        }
        Update: {
          assignee_email?: string | null
          assignee_name?: string
          created_at?: string | null
          id?: string
          opportunity_id?: string
          role?: string
        }
        Relationships: []
      }
      opportunity_boe: {
        Row: {
          assumptions: string | null
          created_at: string | null
          created_by: string | null
          extended_cost: number | null
          id: string
          labor_category_id: string | null
          opportunity_id: string | null
          period: string | null
          rate_used: number | null
          task_description: string | null
          total_hours: number | null
          wbs_number: string | null
        }
        Insert: {
          assumptions?: string | null
          created_at?: string | null
          created_by?: string | null
          extended_cost?: number | null
          id?: string
          labor_category_id?: string | null
          opportunity_id?: string | null
          period?: string | null
          rate_used?: number | null
          task_description?: string | null
          total_hours?: number | null
          wbs_number?: string | null
        }
        Update: {
          assumptions?: string | null
          created_at?: string | null
          created_by?: string | null
          extended_cost?: number | null
          id?: string
          labor_category_id?: string | null
          opportunity_id?: string | null
          period?: string | null
          rate_used?: number | null
          task_description?: string | null
          total_hours?: number | null
          wbs_number?: string | null
        }
        Relationships: []
      }
      opportunity_clauses: {
        Row: {
          clause_id: string | null
          compliance_notes: string | null
          created_at: string | null
          id: string
          opportunity_id: string | null
          status: string | null
        }
        Insert: {
          clause_id?: string | null
          compliance_notes?: string | null
          created_at?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string | null
        }
        Update: {
          clause_id?: string | null
          compliance_notes?: string | null
          created_at?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      opportunity_comments: {
        Row: {
          author: string | null
          content: string
          created_at: string | null
          id: string
          is_pinned: boolean | null
          opportunity_id: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          opportunity_id: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          opportunity_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      opportunity_compliance: {
        Row: {
          completed_at: string | null
          created_at: string | null
          gap_description: string | null
          id: string
          opportunity_id: string | null
          remediation_plan: string | null
          requirement_id: string | null
          status: string | null
          target_date: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          gap_description?: string | null
          id?: string
          opportunity_id?: string | null
          remediation_plan?: string | null
          requirement_id?: string | null
          status?: string | null
          target_date?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          gap_description?: string | null
          id?: string
          opportunity_id?: string | null
          remediation_plan?: string | null
          requirement_id?: string | null
          status?: string | null
          target_date?: string | null
        }
        Relationships: []
      }
      orals_attempts: {
        Row: {
          attempted_at: string | null
          evaluator_notes: string | null
          id: string
          question_id: string | null
          responder_name: string | null
          response_summary: string | null
          score: number | null
          session_id: string | null
          time_used: number | null
        }
        Insert: {
          attempted_at?: string | null
          evaluator_notes?: string | null
          id?: string
          question_id?: string | null
          responder_name?: string | null
          response_summary?: string | null
          score?: number | null
          session_id?: string | null
          time_used?: number | null
        }
        Update: {
          attempted_at?: string | null
          evaluator_notes?: string | null
          id?: string
          question_id?: string | null
          responder_name?: string | null
          response_summary?: string | null
          score?: number | null
          session_id?: string | null
          time_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orals_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "orals_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orals_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "orals_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      orals_decks: {
        Row: {
          created_at: string | null
          deck_type: string | null
          id: string
          opportunity_id: string | null
          practice_sessions: Json | null
          presenter_notes: string | null
          qa_bank: Json | null
          slides: Json | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deck_type?: string | null
          id?: string
          opportunity_id?: string | null
          practice_sessions?: Json | null
          presenter_notes?: string | null
          qa_bank?: Json | null
          slides?: Json | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deck_type?: string | null
          id?: string
          opportunity_id?: string | null
          practice_sessions?: Json | null
          presenter_notes?: string | null
          qa_bank?: Json | null
          slides?: Json | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orals_decks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      orals_qa: {
        Row: {
          answer: string | null
          assigned_to: string | null
          category: string | null
          created_at: string | null
          deck_id: string | null
          difficulty: string | null
          id: string
          question: string
        }
        Insert: {
          answer?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          deck_id?: string | null
          difficulty?: string | null
          id?: string
          question: string
        }
        Update: {
          answer?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          deck_id?: string | null
          difficulty?: string | null
          id?: string
          question?: string
        }
        Relationships: []
      }
      orals_questions: {
        Row: {
          avg_score: number | null
          category: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          id: string
          last_practiced: string | null
          opportunity_id: string | null
          question: string
          source: string | null
          suggested_answer: string | null
          tags: string[] | null
          time_limit: number | null
          times_asked: number | null
          updated_at: string | null
        }
        Insert: {
          avg_score?: number | null
          category: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          id?: string
          last_practiced?: string | null
          opportunity_id?: string | null
          question: string
          source?: string | null
          suggested_answer?: string | null
          tags?: string[] | null
          time_limit?: number | null
          times_asked?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_score?: number | null
          category?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          id?: string
          last_practiced?: string | null
          opportunity_id?: string | null
          question?: string
          source?: string | null
          suggested_answer?: string | null
          tags?: string[] | null
          time_limit?: number | null
          times_asked?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orals_sessions: {
        Row: {
          action_items: string[] | null
          areas_for_improvement: string[] | null
          avg_score: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          facilitator_id: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          participants: string[] | null
          questions_attempted: number | null
          session_date: string | null
          session_type: string | null
          strengths: string[] | null
          total_questions: number | null
          updated_at: string | null
        }
        Insert: {
          action_items?: string[] | null
          areas_for_improvement?: string[] | null
          avg_score?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          facilitator_id?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          participants?: string[] | null
          questions_attempted?: number | null
          session_date?: string | null
          session_type?: string | null
          strengths?: string[] | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Update: {
          action_items?: string[] | null
          areas_for_improvement?: string[] | null
          avg_score?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          facilitator_id?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          participants?: string[] | null
          questions_attempted?: number | null
          session_date?: string | null
          session_type?: string | null
          strengths?: string[] | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orals_slides: {
        Row: {
          content: string | null
          created_at: string | null
          deck_id: string | null
          id: string
          slide_number: number
          speaker_notes: string | null
          time_allocation: number | null
          title: string | null
          visual_type: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          deck_id?: string | null
          id?: string
          slide_number: number
          speaker_notes?: string | null
          time_allocation?: number | null
          title?: string | null
          visual_type?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          deck_id?: string | null
          id?: string
          slide_number?: number
          speaker_notes?: string | null
          time_allocation?: number | null
          title?: string | null
          visual_type?: string | null
        }
        Relationships: []
      }
      outline_sections: {
        Row: {
          assigned_to: string | null
          compliance_requirements: string[] | null
          created_at: string | null
          id: string
          instructions: string | null
          outline_id: string | null
          page_limit: number | null
          parent_id: string | null
          rfp_reference: string | null
          section_number: string
          sort_order: number | null
          status: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          compliance_requirements?: string[] | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          outline_id?: string | null
          page_limit?: number | null
          parent_id?: string | null
          rfp_reference?: string | null
          section_number: string
          sort_order?: number | null
          status?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          compliance_requirements?: string[] | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          outline_id?: string | null
          page_limit?: number | null
          parent_id?: string | null
          rfp_reference?: string | null
          section_number?: string
          sort_order?: number | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "outline_sections_outline_id_fkey"
            columns: ["outline_id"]
            isOneToOne: false
            referencedRelation: "proposal_outlines"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_access: {
        Row: {
          access_expires_at: string | null
          access_granted_at: string | null
          access_granted_by: string | null
          access_level: string | null
          allowed_sections: string[] | null
          auto_revoke_on_submit: boolean | null
          company_id: string | null
          created_at: string | null
          cui_watermark_id: string | null
          id: string
          is_active: boolean | null
          nda_signed: boolean | null
          nda_signed_at: string | null
          opportunity_id: string | null
          partner_company_name: string
          partner_contact_email: string
          partner_contact_name: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          teaming_agreement_ref: string | null
          updated_at: string | null
        }
        Insert: {
          access_expires_at?: string | null
          access_granted_at?: string | null
          access_granted_by?: string | null
          access_level?: string | null
          allowed_sections?: string[] | null
          auto_revoke_on_submit?: boolean | null
          company_id?: string | null
          created_at?: string | null
          cui_watermark_id?: string | null
          id?: string
          is_active?: boolean | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          opportunity_id?: string | null
          partner_company_name: string
          partner_contact_email: string
          partner_contact_name?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          teaming_agreement_ref?: string | null
          updated_at?: string | null
        }
        Update: {
          access_expires_at?: string | null
          access_granted_at?: string | null
          access_granted_by?: string | null
          access_level?: string | null
          allowed_sections?: string[] | null
          auto_revoke_on_submit?: boolean | null
          company_id?: string | null
          created_at?: string | null
          cui_watermark_id?: string | null
          id?: string
          is_active?: boolean | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          opportunity_id?: string | null
          partner_company_name?: string
          partner_contact_email?: string
          partner_contact_name?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          teaming_agreement_ref?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_access_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_activity_log: {
        Row: {
          action_type: string | null
          created_at: string | null
          id: string
          invitation_id: string | null
          ip_address: unknown
          module_accessed: string | null
          partner_email: string
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          ip_address?: unknown
          module_accessed?: string | null
          partner_email: string
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          ip_address?: unknown
          module_accessed?: string | null
          partner_email?: string
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_activity_log_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "partner_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invitations: {
        Row: {
          access_expires_at: string | null
          access_level: string | null
          allowed_modules: string[] | null
          company_id: string | null
          created_at: string | null
          id: string
          invitation_type: string | null
          invited_at: string | null
          invited_by: string | null
          nda_required: boolean | null
          nda_signed: boolean | null
          nda_signed_date: string | null
          notes: string | null
          opportunity_id: string | null
          partner_company_name: string
          partner_contact_name: string | null
          partner_email: string
          partner_phone: string | null
          responded_at: string | null
          status: string | null
          teaming_agreement_status: string | null
          updated_at: string | null
        }
        Insert: {
          access_expires_at?: string | null
          access_level?: string | null
          allowed_modules?: string[] | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          invitation_type?: string | null
          invited_at?: string | null
          invited_by?: string | null
          nda_required?: boolean | null
          nda_signed?: boolean | null
          nda_signed_date?: string | null
          notes?: string | null
          opportunity_id?: string | null
          partner_company_name: string
          partner_contact_name?: string | null
          partner_email: string
          partner_phone?: string | null
          responded_at?: string | null
          status?: string | null
          teaming_agreement_status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_expires_at?: string | null
          access_level?: string | null
          allowed_modules?: string[] | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          invitation_type?: string | null
          invited_at?: string | null
          invited_by?: string | null
          nda_required?: boolean | null
          nda_signed?: boolean | null
          nda_signed_date?: string | null
          notes?: string | null
          opportunity_id?: string | null
          partner_company_name?: string
          partner_contact_name?: string | null
          partner_email?: string
          partner_phone?: string | null
          responded_at?: string | null
          status?: string | null
          teaming_agreement_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invitations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          assigned_opportunities: string[] | null
          capabilities: string[] | null
          contact_email: string | null
          created_at: string | null
          id: string
          partner_name: string
          socioeconomic_status: string | null
          status: string | null
          trust_score: number | null
        }
        Insert: {
          assigned_opportunities?: string[] | null
          capabilities?: string[] | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          partner_name: string
          socioeconomic_status?: string | null
          status?: string | null
          trust_score?: number | null
        }
        Update: {
          assigned_opportunities?: string[] | null
          capabilities?: string[] | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          partner_name?: string
          socioeconomic_status?: string | null
          status?: string | null
          trust_score?: number | null
        }
        Relationships: []
      }
      past_performance: {
        Row: {
          client_agency: string | null
          client_contact: string | null
          client_email: string | null
          client_phone: string | null
          contract_number: string | null
          contract_title: string
          contract_type: string | null
          contract_value: number | null
          cpars_rating: string | null
          created_at: string | null
          description: string | null
          id: string
          key_accomplishments: string[] | null
          opportunity_id: string | null
          period_end: string | null
          period_start: string | null
          relevance_score: number | null
          updated_at: string | null
        }
        Insert: {
          client_agency?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_phone?: string | null
          contract_number?: string | null
          contract_title: string
          contract_type?: string | null
          contract_value?: number | null
          cpars_rating?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key_accomplishments?: string[] | null
          opportunity_id?: string | null
          period_end?: string | null
          period_start?: string | null
          relevance_score?: number | null
          updated_at?: string | null
        }
        Update: {
          client_agency?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_phone?: string | null
          contract_number?: string | null
          contract_title?: string
          contract_type?: string | null
          contract_value?: number | null
          cpars_rating?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key_accomplishments?: string[] | null
          opportunity_id?: string | null
          period_end?: string | null
          period_start?: string | null
          relevance_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "past_performance_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      past_performance_contacts: {
        Row: {
          contact_type: string | null
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          last_verified: string | null
          name: string
          notes: string | null
          organization: string | null
          past_performance_id: string | null
          phone: string | null
          title: string | null
        }
        Insert: {
          contact_type?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          last_verified?: string | null
          name: string
          notes?: string | null
          organization?: string | null
          past_performance_id?: string | null
          phone?: string | null
          title?: string | null
        }
        Update: {
          contact_type?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          last_verified?: string | null
          name?: string
          notes?: string | null
          organization?: string | null
          past_performance_id?: string | null
          phone?: string | null
          title?: string | null
        }
        Relationships: []
      }
      personnel_assignments: {
        Row: {
          backup_personnel_id: string | null
          commitment_percent: number | null
          created_at: string | null
          end_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          personnel_id: string | null
          proposed_labor_category: string | null
          proposed_level: string | null
          proposed_role: string
          start_date: string | null
          status: string | null
        }
        Insert: {
          backup_personnel_id?: string | null
          commitment_percent?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          personnel_id?: string | null
          proposed_labor_category?: string | null
          proposed_level?: string | null
          proposed_role: string
          start_date?: string | null
          status?: string | null
        }
        Update: {
          backup_personnel_id?: string | null
          commitment_percent?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          personnel_id?: string | null
          proposed_labor_category?: string | null
          proposed_level?: string | null
          proposed_role?: string
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_assignments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_assignments_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "key_personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_certifications: {
        Row: {
          certification_name: string
          created_at: string | null
          credential_id: string | null
          expiration_date: string | null
          id: string
          issue_date: string | null
          issuing_organization: string | null
          personnel_id: string | null
          status: string | null
          verification_url: string | null
        }
        Insert: {
          certification_name: string
          created_at?: string | null
          credential_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_organization?: string | null
          personnel_id?: string | null
          status?: string | null
          verification_url?: string | null
        }
        Update: {
          certification_name?: string
          created_at?: string | null
          credential_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_organization?: string | null
          personnel_id?: string | null
          status?: string | null
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_certifications_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "key_personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          display_name: string
          id: string
          is_closed: boolean | null
          is_won: boolean | null
          probability: number | null
          shipley_phase: string | null
          sort_order: number | null
          stage_key: string
        }
        Insert: {
          color?: string | null
          display_name: string
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          probability?: number | null
          shipley_phase?: string | null
          sort_order?: number | null
          stage_key: string
        }
        Update: {
          color?: string | null
          display_name?: string
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          probability?: number | null
          shipley_phase?: string | null
          sort_order?: number | null
          stage_key?: string
        }
        Relationships: []
      }
      playbook_entries: {
        Row: {
          assistant_response: string
          category: string
          created_at: string
          created_by: string | null
          effectiveness_score: number
          id: string
          keywords: Json | null
          metadata: Json | null
          quality_rating: string
          search_vector: unknown
          title: string
          updated_at: string
          use_count: number
          user_prompt: string
        }
        Insert: {
          assistant_response: string
          category?: string
          created_at?: string
          created_by?: string | null
          effectiveness_score?: number
          id: string
          keywords?: Json | null
          metadata?: Json | null
          quality_rating?: string
          search_vector?: unknown
          title: string
          updated_at?: string
          use_count?: number
          user_prompt: string
        }
        Update: {
          assistant_response?: string
          category?: string
          created_at?: string
          created_by?: string | null
          effectiveness_score?: number
          id?: string
          keywords?: Json | null
          metadata?: Json | null
          quality_rating?: string
          search_vector?: unknown
          title?: string
          updated_at?: string
          use_count?: number
          user_prompt?: string
        }
        Relationships: []
      }
      playbook_items: {
        Row: {
          company_id: string | null
          created_at: string | null
          deliverables: string[] | null
          dependencies: string[] | null
          description: string | null
          id: string
          is_optional: boolean | null
          owner_role: string | null
          phase: string
          sort_order: number | null
          task: string
          tips: string | null
          typical_duration: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          deliverables?: string[] | null
          dependencies?: string[] | null
          description?: string | null
          id?: string
          is_optional?: boolean | null
          owner_role?: string | null
          phase: string
          sort_order?: number | null
          task: string
          tips?: string | null
          typical_duration?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          deliverables?: string[] | null
          dependencies?: string[] | null
          description?: string | null
          id?: string
          is_optional?: boolean | null
          owner_role?: string | null
          phase?: string
          sort_order?: number | null
          task?: string
          tips?: string | null
          typical_duration?: string | null
        }
        Relationships: []
      }
      playbook_lessons: {
        Row: {
          category: string
          content: string | null
          created_at: string | null
          id: string
          quality_score: number | null
          title: string
          use_count: number | null
        }
        Insert: {
          category: string
          content?: string | null
          created_at?: string | null
          id?: string
          quality_score?: number | null
          title: string
          use_count?: number | null
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string | null
          id?: string
          quality_score?: number | null
          title?: string
          use_count?: number | null
        }
        Relationships: []
      }
      playbook_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          phase: string
          shipley_reference: string | null
          sort_order: number | null
          status: string | null
          task_name: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          phase: string
          shipley_reference?: string | null
          sort_order?: number | null
          status?: string | null
          task_name: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          phase?: string
          shipley_reference?: string | null
          sort_order?: number | null
          status?: string | null
          task_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_usage: {
        Row: {
          agent_id: string | null
          created_at: string
          entry_id: string
          feedback_rating: number | null
          id: number
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          entry_id: string
          feedback_rating?: number | null
          id?: never
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          entry_id?: string
          feedback_rating?: number | null
          id?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_usage_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "playbook_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      post_award_actions: {
        Row: {
          action_type: string
          assignee_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          action_type: string
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_award_actions_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_award_actions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      post_award_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          description: string
          due_date: string | null
          id: string
          is_complete: boolean | null
          notes: string | null
          opportunity_id: string
          phase: string | null
          priority: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          notes?: string | null
          opportunity_id: string
          phase?: string | null
          priority?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          is_complete?: boolean | null
          notes?: string | null
          opportunity_id?: string
          phase?: string | null
          priority?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      price_to_win: {
        Row: {
          competitor_estimate: number | null
          confidence_level: string | null
          created_at: string | null
          government_estimate: number | null
          id: string
          opportunity_id: string | null
          our_price: number | null
          ptw_target: number | null
          strategy_notes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          competitor_estimate?: number | null
          confidence_level?: string | null
          created_at?: string | null
          government_estimate?: number | null
          id?: string
          opportunity_id?: string | null
          our_price?: number | null
          ptw_target?: number | null
          strategy_notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          competitor_estimate?: number | null
          confidence_level?: string | null
          created_at?: string | null
          government_estimate?: number | null
          id?: string
          opportunity_id?: string | null
          our_price?: number | null
          ptw_target?: number | null
          strategy_notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      pricing_items: {
        Row: {
          basis_of_estimate: string | null
          clin: string | null
          company_id: string | null
          created_at: string | null
          description: string
          extended_price: number | null
          gsa_rate: number | null
          id: string
          labor_category: string | null
          notes: string | null
          opportunity_id: string | null
          proposed_rate: number | null
          quantity: number | null
          unit: string | null
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          basis_of_estimate?: string | null
          clin?: string | null
          company_id?: string | null
          created_at?: string | null
          description: string
          extended_price?: number | null
          gsa_rate?: number | null
          id?: string
          labor_category?: string | null
          notes?: string | null
          opportunity_id?: string | null
          proposed_rate?: number | null
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          basis_of_estimate?: string | null
          clin?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string
          extended_price?: number | null
          gsa_rate?: number | null
          id?: string
          labor_category?: string | null
          notes?: string | null
          opportunity_id?: string | null
          proposed_rate?: number | null
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_models: {
        Row: {
          base_period_months: number | null
          company_id: string | null
          contract_type: string | null
          created_at: string | null
          id: string
          labor_categories: Json | null
          name: string
          notes: string | null
          opportunity_id: string | null
          status: string | null
          total_direct_labor: number | null
          total_price: number | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          base_period_months?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          id?: string
          labor_categories?: Json | null
          name: string
          notes?: string | null
          opportunity_id?: string | null
          status?: string | null
          total_direct_labor?: number | null
          total_price?: number | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          base_period_months?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          id?: string
          labor_categories?: Json | null
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          status?: string | null
          total_direct_labor?: number | null
          total_price?: number | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          company_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          last_login: string | null
          phone: string | null
          preferences: Json | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          last_login?: string | null
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_login?: string | null
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          agency: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_value: number | null
          id: string
          name: string
          shipley_phase: string | null
          solicitation_number: string | null
          status: string | null
          updated_at: string
          win_probability: number | null
        }
        Insert: {
          agency?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          id?: string
          name: string
          shipley_phase?: string | null
          solicitation_number?: string | null
          status?: string | null
          updated_at?: string
          win_probability?: number | null
        }
        Update: {
          agency?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          id?: string
          name?: string
          shipley_phase?: string | null
          solicitation_number?: string | null
          status?: string | null
          updated_at?: string
          win_probability?: number | null
        }
        Relationships: []
      }
      proposal_calendar: {
        Row: {
          award_date: string | null
          calendar_name: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          opportunity_id: string | null
          orals_date: string | null
          proposal_due_date: string | null
          questions_due_date: string | null
          rfp_release_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          award_date?: string | null
          calendar_name: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          orals_date?: string | null
          proposal_due_date?: string | null
          questions_due_date?: string | null
          rfp_release_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          award_date?: string | null
          calendar_name?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          orals_date?: string | null
          proposal_due_date?: string | null
          questions_due_date?: string | null
          rfp_release_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      proposal_documents: {
        Row: {
          access_level: string | null
          created_at: string | null
          description: string | null
          doc_type: string | null
          file_path: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          mime_type: string | null
          opportunity_id: string | null
          reviewed_by: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          access_level?: string | null
          created_at?: string | null
          description?: string | null
          doc_type?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          opportunity_id?: string | null
          reviewed_by?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          access_level?: string | null
          created_at?: string | null
          description?: string | null
          doc_type?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          opportunity_id?: string | null
          reviewed_by?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      proposal_drafts: {
        Row: {
          author: string | null
          compliance_score: number | null
          content: string
          created_at: string | null
          id: number
          opportunity_id: number | null
          reviewer: string | null
          section: string
          status: string | null
          title: string | null
          updated_at: string | null
          version: number | null
          word_count: number | null
        }
        Insert: {
          author?: string | null
          compliance_score?: number | null
          content: string
          created_at?: string | null
          id?: number
          opportunity_id?: number | null
          reviewer?: string | null
          section: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
          word_count?: number | null
        }
        Update: {
          author?: string | null
          compliance_score?: number | null
          content?: string
          created_at?: string | null
          id?: number
          opportunity_id?: number | null
          reviewer?: string | null
          section?: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
          word_count?: number | null
        }
        Relationships: []
      }
      proposal_graphics: {
        Row: {
          accessibility_checked: boolean | null
          company_id: string | null
          compliance_checked: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          designer_id: string | null
          designer_name: string | null
          dimensions: string | null
          figure_number: string | null
          file_format: string | null
          file_url: string | null
          graphic_type: string | null
          id: string
          key_message: string | null
          opportunity_id: string | null
          page_location: string | null
          review_notes: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          section: string | null
          status: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          version: number | null
          volume: string | null
        }
        Insert: {
          accessibility_checked?: boolean | null
          company_id?: string | null
          compliance_checked?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          designer_id?: string | null
          designer_name?: string | null
          dimensions?: string | null
          figure_number?: string | null
          file_format?: string | null
          file_url?: string | null
          graphic_type?: string | null
          id?: string
          key_message?: string | null
          opportunity_id?: string | null
          page_location?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          section?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          version?: number | null
          volume?: string | null
        }
        Update: {
          accessibility_checked?: boolean | null
          company_id?: string | null
          compliance_checked?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          designer_id?: string | null
          designer_name?: string | null
          dimensions?: string | null
          figure_number?: string | null
          file_format?: string | null
          file_url?: string | null
          graphic_type?: string | null
          id?: string
          key_message?: string | null
          opportunity_id?: string | null
          page_location?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          section?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          version?: number | null
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_graphics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_graphics_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_metrics: {
        Row: {
          company_id: string | null
          compliance_score: number | null
          cost_variance_percent: number | null
          created_at: string | null
          days_to_submission: number | null
          findings_resolved: number | null
          findings_total: number | null
          graphics_count: number | null
          id: string
          metric_date: string | null
          opportunity_id: string | null
          pages_target: number | null
          pages_written: number | null
          proposal_hours_actual: number | null
          proposal_hours_planned: number | null
          quality_score: number | null
          review_cycles: number | null
          schedule_variance_percent: number | null
          team_size: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          compliance_score?: number | null
          cost_variance_percent?: number | null
          created_at?: string | null
          days_to_submission?: number | null
          findings_resolved?: number | null
          findings_total?: number | null
          graphics_count?: number | null
          id?: string
          metric_date?: string | null
          opportunity_id?: string | null
          pages_target?: number | null
          pages_written?: number | null
          proposal_hours_actual?: number | null
          proposal_hours_planned?: number | null
          quality_score?: number | null
          review_cycles?: number | null
          schedule_variance_percent?: number | null
          team_size?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          compliance_score?: number | null
          cost_variance_percent?: number | null
          created_at?: string | null
          days_to_submission?: number | null
          findings_resolved?: number | null
          findings_total?: number | null
          graphics_count?: number | null
          id?: string
          metric_date?: string | null
          opportunity_id?: string | null
          pages_target?: number | null
          pages_written?: number | null
          proposal_hours_actual?: number | null
          proposal_hours_planned?: number | null
          quality_score?: number | null
          review_cycles?: number | null
          schedule_variance_percent?: number | null
          team_size?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_metrics_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_milestones: {
        Row: {
          calendar_id: string | null
          color: string | null
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          due_time: string | null
          id: string
          milestone_name: string
          milestone_type: string | null
          notes: string | null
          owner: string | null
          reminder_days: number | null
          sort_order: number | null
          status: string | null
        }
        Insert: {
          calendar_id?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          milestone_name: string
          milestone_type?: string | null
          notes?: string | null
          owner?: string | null
          reminder_days?: number | null
          sort_order?: number | null
          status?: string | null
        }
        Update: {
          calendar_id?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          milestone_name?: string
          milestone_type?: string | null
          notes?: string | null
          owner?: string | null
          reminder_days?: number | null
          sort_order?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_milestones_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "proposal_calendar"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_outline_sections: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          id: string
          notes: string | null
          page_limit: number | null
          section_number: string | null
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
          volume_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          page_limit?: number | null
          section_number?: string | null
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          volume_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          page_limit?: number | null
          section_number?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          volume_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_outline_sections_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_outline_sections_volume_id_fkey"
            columns: ["volume_id"]
            isOneToOne: false
            referencedRelation: "proposal_outline_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_outline_subsections: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          id: string
          notes: string | null
          page_limit: number | null
          section_id: string | null
          sort_order: number | null
          status: string | null
          subsection_number: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          page_limit?: number | null
          section_id?: string | null
          sort_order?: number | null
          status?: string | null
          subsection_number?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          page_limit?: number | null
          section_id?: string | null
          sort_order?: number | null
          status?: string | null
          subsection_number?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_outline_subsections_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_outline_subsections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_outline_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_outline_volumes: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          page_limit: number | null
          sort_order: number | null
          title: string
          updated_at: string | null
          volume_number: number | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
          volume_number?: number | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
          volume_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_outline_volumes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_outline_volumes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_outlines: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          opportunity_id: string | null
          outline_name: string
          rfp_reference: string | null
          status: string | null
          updated_at: string | null
          volume_type: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          outline_name: string
          rfp_reference?: string | null
          status?: string | null
          updated_at?: string | null
          volume_type?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          outline_name?: string
          rfp_reference?: string | null
          status?: string | null
          updated_at?: string | null
          volume_type?: string | null
        }
        Relationships: []
      }
      proposal_sections: {
        Row: {
          color_rating: string | null
          company_id: string | null
          content: string | null
          created_at: string | null
          current_pages: number | null
          due_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          page_limit: number | null
          reviewer_id: string | null
          section_number: string | null
          section_title: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
          volume: string | null
          writer_id: string | null
        }
        Insert: {
          color_rating?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          current_pages?: number | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          reviewer_id?: string | null
          section_number?: string | null
          section_title: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
          volume?: string | null
          writer_id?: string | null
        }
        Update: {
          color_rating?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          current_pages?: number | null
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          page_limit?: number | null
          reviewer_id?: string | null
          section_number?: string | null
          section_title?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
          volume?: string | null
          writer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sections_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sections_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sections_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          agency_type: string | null
          company_id: string | null
          content: Json | null
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_public: boolean | null
          name: string
          sections: string[] | null
          tags: string[] | null
          template_type: string
          updated_at: string | null
          use_count: number | null
        }
        Insert: {
          agency_type?: string | null
          company_id?: string | null
          content?: Json | null
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_public?: boolean | null
          name: string
          sections?: string[] | null
          tags?: string[] | null
          template_type: string
          updated_at?: string | null
          use_count?: number | null
        }
        Update: {
          agency_type?: string | null
          company_id?: string | null
          content?: Json | null
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_public?: boolean | null
          name?: string
          sections?: string[] | null
          tags?: string[] | null
          template_type?: string
          updated_at?: string | null
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_volumes: {
        Row: {
          compliance_score: number | null
          created_at: string | null
          current_pages: number | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          owner_id: string | null
          page_limit: number | null
          sections: Json | null
          status: string | null
          updated_at: string | null
          volume_name: string
          volume_number: number
        }
        Insert: {
          compliance_score?: number | null
          created_at?: string | null
          current_pages?: number | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          page_limit?: number | null
          sections?: Json | null
          status?: string | null
          updated_at?: string | null
          volume_name: string
          volume_number: number
        }
        Update: {
          compliance_score?: number | null
          created_at?: string | null
          current_pages?: number | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          page_limit?: number | null
          sections?: Json | null
          status?: string | null
          updated_at?: string | null
          volume_name?: string
          volume_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_volumes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_questions: {
        Row: {
          assigned_to: string | null
          attachments: Json | null
          category: string | null
          created_at: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          question_number: string
          question_text: string
          response_approved_by: string | null
          response_text: string | null
          source: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          question_number: string
          question_text: string
          response_approved_by?: string | null
          response_text?: string | null
          source?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          question_number?: string
          question_text?: string
          response_approved_by?: string | null
          response_text?: string | null
          source?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_questions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_test_results: {
        Row: {
          company_id: string | null
          created_at: string | null
          details: Json | null
          duration_ms: number | null
          error_message: string | null
          id: string
          run_by: string | null
          status: string | null
          test_name: string
          test_suite: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          run_by?: string | null
          status?: string | null
          test_name: string
          test_suite: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          run_by?: string | null
          status?: string | null
          test_name?: string
          test_suite?: string
        }
        Relationships: []
      }
      quota_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          created_at: string
          current_usage: number
          id: number
          threshold_percent: number
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          alert_type: string
          created_at?: string
          current_usage: number
          id?: never
          threshold_percent: number
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          created_at?: string
          current_usage?: number
          id?: never
          threshold_percent?: number
          user_id?: string
        }
        Relationships: []
      }
      reference_checks: {
        Row: {
          client_agency: string | null
          company_id: string | null
          contract_name: string
          contract_number: string | null
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          period_of_performance: string | null
          relevance_score: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_agency?: string | null
          company_id?: string | null
          contract_name: string
          contract_number?: string | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          period_of_performance?: string | null
          relevance_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_agency?: string | null
          company_id?: string | null
          contract_name?: string
          contract_number?: string | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          period_of_performance?: string | null
          relevance_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      reference_contacts: {
        Row: {
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          contact_status: string | null
          contact_title: string | null
          created_at: string | null
          id: string
          last_contacted: string | null
          permission_granted: boolean | null
          reference_id: string | null
          response_date: string | null
          response_notes: string | null
          response_rating: number | null
          response_received: boolean | null
        }
        Insert: {
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          contact_status?: string | null
          contact_title?: string | null
          created_at?: string | null
          id?: string
          last_contacted?: string | null
          permission_granted?: boolean | null
          reference_id?: string | null
          response_date?: string | null
          response_notes?: string | null
          response_rating?: number | null
          response_received?: boolean | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          contact_status?: string | null
          contact_title?: string | null
          created_at?: string | null
          id?: string
          last_contacted?: string | null
          permission_granted?: boolean | null
          reference_id?: string | null
          response_date?: string | null
          response_notes?: string | null
          response_rating?: number | null
          response_received?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_contacts_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "reference_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          export_format: string | null
          file_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          report_data: Json | null
          report_name: string
          report_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          export_format?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_data?: Json | null
          report_name: string
          report_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          export_format?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_data?: Json | null
          report_name?: string
          report_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      resource_allocations: {
        Row: {
          allocation_percentage: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          hours_per_week: number | null
          id: string
          is_confirmed: boolean | null
          notes: string | null
          opportunity_id: string | null
          role_on_opportunity: string
          start_date: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          allocation_percentage?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          hours_per_week?: number | null
          id?: string
          is_confirmed?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          role_on_opportunity: string
          start_date: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          allocation_percentage?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          hours_per_week?: number | null
          id?: string
          is_confirmed?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          role_on_opportunity?: string
          start_date?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      review_assignments: {
        Row: {
          assigned_sections: string[] | null
          created_at: string | null
          id: string
          review_id: string | null
          role: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          assigned_sections?: string[] | null
          created_at?: string | null
          id?: string
          review_id?: string | null
          role: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_sections?: string[] | null
          created_at?: string | null
          id?: string
          review_id?: string | null
          role?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      review_comments: {
        Row: {
          comment_text: string
          comment_type: string | null
          created_at: string | null
          id: string
          page_number: number | null
          priority: number | null
          recommendation: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          review_id: string | null
          reviewer_id: string | null
          section_ref: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          comment_text: string
          comment_type?: string | null
          created_at?: string | null
          id?: string
          page_number?: number | null
          priority?: number | null
          recommendation?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          review_id?: string | null
          reviewer_id?: string | null
          section_ref?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          comment_text?: string
          comment_type?: string | null
          created_at?: string | null
          id?: string
          page_number?: number | null
          priority?: number | null
          recommendation?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          review_id?: string | null
          reviewer_id?: string | null
          section_ref?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rfi_questions: {
        Row: {
          amendment_reference: string | null
          answer: string | null
          answer_date: string | null
          assigned_to: string | null
          category: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string
          impact: string | null
          internal_notes: string | null
          opportunity_id: string | null
          question: string
          question_number: string | null
          rfp_reference: string | null
          status: string | null
          submitted_date: string | null
          updated_at: string | null
        }
        Insert: {
          amendment_reference?: string | null
          answer?: string | null
          answer_date?: string | null
          assigned_to?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          impact?: string | null
          internal_notes?: string | null
          opportunity_id?: string | null
          question: string
          question_number?: string | null
          rfp_reference?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
        }
        Update: {
          amendment_reference?: string | null
          answer?: string | null
          answer_date?: string | null
          assigned_to?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          impact?: string | null
          internal_notes?: string | null
          opportunity_id?: string | null
          question?: string
          question_number?: string | null
          rfp_reference?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfi_questions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfi_questions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfi_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfi_questions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_amendments: {
        Row: {
          amendment_number: string
          amendment_title: string | null
          amendment_type: string | null
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          full_text: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          priority: string | null
          release_date: string | null
          requires_compliance_update: boolean | null
          requires_pricing_change: boolean | null
          requires_proposal_change: boolean | null
          response_due_date: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string | null
          status: string | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          amendment_number: string
          amendment_title?: string | null
          amendment_type?: string | null
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          full_text?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          release_date?: string | null
          requires_compliance_update?: boolean | null
          requires_pricing_change?: boolean | null
          requires_proposal_change?: boolean | null
          response_due_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          amendment_number?: string
          amendment_title?: string | null
          amendment_type?: string | null
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          full_text?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          priority?: string | null
          release_date?: string | null
          requires_compliance_update?: boolean | null
          requires_pricing_change?: boolean | null
          requires_proposal_change?: boolean | null
          response_due_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rfp_documents: {
        Row: {
          created_at: string | null
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          opportunity_id: string | null
          storage_path: string | null
          upload_status: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          opportunity_id?: string | null
          storage_path?: string | null
          upload_status?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          opportunity_id?: string | null
          storage_path?: string | null
          upload_status?: string | null
        }
        Relationships: []
      }
      rfp_files: {
        Row: {
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          opportunity_id: string | null
          processing_status: string | null
          requirements_count: number | null
          storage_path: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          opportunity_id?: string | null
          processing_status?: string | null
          requirements_count?: number | null
          storage_path?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          opportunity_id?: string | null
          processing_status?: string | null
          requirements_count?: number | null
          storage_path?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      rfp_requirements: {
        Row: {
          assignee_id: string | null
          company_id: string | null
          compliance_approach: string | null
          created_at: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          proposal_section: string | null
          requirement_number: string | null
          requirement_text: string
          requirement_type: string | null
          section: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          company_id?: string | null
          compliance_approach?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          proposal_section?: string | null
          requirement_number?: string | null
          requirement_text: string
          requirement_type?: string | null
          section?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          company_id?: string | null
          compliance_approach?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          proposal_section?: string | null
          requirement_number?: string | null
          requirement_text?: string
          requirement_type?: string | null
          section?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfp_requirements_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_requirements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_mitigations: {
        Row: {
          action: string
          assigned_to: string | null
          created_at: string | null
          due_date: string | null
          id: string
          mitigation_type: string | null
          risk_id: string | null
          status: string | null
        }
        Insert: {
          action: string
          assigned_to?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          mitigation_type?: string | null
          risk_id?: string | null
          status?: string | null
        }
        Update: {
          action?: string
          assigned_to?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          mitigation_type?: string | null
          risk_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_mitigations_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_register: {
        Row: {
          actual_resolution_date: string | null
          contingency_plan: string | null
          created_at: string | null
          id: string
          identified_date: string | null
          impact: string | null
          mitigation_strategy: string | null
          notes: string | null
          opportunity_id: string | null
          owner_id: string | null
          probability: string | null
          risk_category: string | null
          risk_description: string | null
          risk_number: string
          risk_score: number | null
          risk_title: string
          status: string | null
          target_resolution_date: string | null
          updated_at: string | null
        }
        Insert: {
          actual_resolution_date?: string | null
          contingency_plan?: string | null
          created_at?: string | null
          id?: string
          identified_date?: string | null
          impact?: string | null
          mitigation_strategy?: string | null
          notes?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          probability?: string | null
          risk_category?: string | null
          risk_description?: string | null
          risk_number: string
          risk_score?: number | null
          risk_title: string
          status?: string | null
          target_resolution_date?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_resolution_date?: string | null
          contingency_plan?: string | null
          created_at?: string | null
          id?: string
          identified_date?: string | null
          impact?: string | null
          mitigation_strategy?: string | null
          notes?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          probability?: string | null
          risk_category?: string | null
          risk_description?: string | null
          risk_number?: string
          risk_score?: number | null
          risk_title?: string
          status?: string | null
          target_resolution_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_register_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          impact: string | null
          opportunity_id: string | null
          owner: string | null
          probability: string | null
          risk_score: number | null
          risk_title: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: string | null
          opportunity_id?: string | null
          owner?: string | null
          probability?: string | null
          risk_score?: number | null
          risk_title: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: string | null
          opportunity_id?: string | null
          owner?: string | null
          probability?: string | null
          risk_score?: number | null
          risk_title?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          description: string | null
          id: number
          is_private: boolean | null
          is_system: boolean | null
          name: string
          permissions: Json | null
        }
        Insert: {
          description?: string | null
          id?: number
          is_private?: boolean | null
          is_system?: boolean | null
          name: string
          permissions?: Json | null
        }
        Update: {
          description?: string | null
          id?: number
          is_private?: boolean | null
          is_system?: boolean | null
          name?: string
          permissions?: Json | null
        }
        Relationships: []
      }
      sam_opportunities: {
        Row: {
          archive_date: string | null
          attachments: Json | null
          classification_code: string | null
          company_id: string | null
          contract_type: string | null
          department: string | null
          description: string | null
          estimated_value: number | null
          id: string
          imported_at: string | null
          is_hidden: boolean | null
          is_tracked: boolean | null
          last_updated: string | null
          links: Json | null
          match_reasons: Json | null
          match_score: number | null
          naics_code: string | null
          notice_id: string | null
          office: string | null
          place_of_performance: Json | null
          point_of_contact: Json | null
          posted_date: string | null
          response_deadline: string | null
          set_aside_code: string | null
          set_aside_description: string | null
          solicitation_number: string | null
          sub_tier: string | null
          title: string
        }
        Insert: {
          archive_date?: string | null
          attachments?: Json | null
          classification_code?: string | null
          company_id?: string | null
          contract_type?: string | null
          department?: string | null
          description?: string | null
          estimated_value?: number | null
          id?: string
          imported_at?: string | null
          is_hidden?: boolean | null
          is_tracked?: boolean | null
          last_updated?: string | null
          links?: Json | null
          match_reasons?: Json | null
          match_score?: number | null
          naics_code?: string | null
          notice_id?: string | null
          office?: string | null
          place_of_performance?: Json | null
          point_of_contact?: Json | null
          posted_date?: string | null
          response_deadline?: string | null
          set_aside_code?: string | null
          set_aside_description?: string | null
          solicitation_number?: string | null
          sub_tier?: string | null
          title: string
        }
        Update: {
          archive_date?: string | null
          attachments?: Json | null
          classification_code?: string | null
          company_id?: string | null
          contract_type?: string | null
          department?: string | null
          description?: string | null
          estimated_value?: number | null
          id?: string
          imported_at?: string | null
          is_hidden?: boolean | null
          is_tracked?: boolean | null
          last_updated?: string | null
          links?: Json | null
          match_reasons?: Json | null
          match_score?: number | null
          naics_code?: string | null
          notice_id?: string | null
          office?: string | null
          place_of_performance?: Json | null
          point_of_contact?: Json | null
          posted_date?: string | null
          response_deadline?: string | null
          set_aside_code?: string | null
          set_aside_description?: string | null
          solicitation_number?: string | null
          sub_tier?: string | null
          title?: string
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string | null
          filters: Json
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          filters?: Json
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          company_id: string | null
          created_at: string | null
          entity_type: string | null
          filters: Json | null
          id: string
          is_default: boolean | null
          name: string
          search_query: string | null
          use_count: number | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          entity_type?: string | null
          filters?: Json | null
          id?: string
          is_default?: boolean | null
          name: string
          search_query?: string | null
          use_count?: number | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          entity_type?: string | null
          filters?: Json | null
          id?: string
          is_default?: boolean | null
          name?: string
          search_query?: string | null
          use_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      section_versions: {
        Row: {
          author_id: string | null
          change_summary: string | null
          content: string
          created_at: string | null
          id: string
          section_id: string | null
          version_number: number
        }
        Insert: {
          author_id?: string | null
          change_summary?: string | null
          content: string
          created_at?: string | null
          id?: string
          section_id?: string | null
          version_number: number
        }
        Update: {
          author_id?: string | null
          change_summary?: string | null
          content?: string
          created_at?: string | null
          id?: string
          section_id?: string | null
          version_number?: number
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string | null
          details: Json | null
          id: string
          severity: string
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          severity: string
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      solo_gate_approvals: {
        Row: {
          approved: boolean | null
          decision_at: string | null
          gate_id: string
          gate_name: string | null
          id: string
          notes: string | null
          phase: number | null
          solo_proposal_id: string | null
        }
        Insert: {
          approved?: boolean | null
          decision_at?: string | null
          gate_id: string
          gate_name?: string | null
          id?: string
          notes?: string | null
          phase?: number | null
          solo_proposal_id?: string | null
        }
        Update: {
          approved?: boolean | null
          decision_at?: string | null
          gate_id?: string
          gate_name?: string | null
          id?: string
          notes?: string | null
          phase?: number | null
          solo_proposal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solo_gate_approvals_solo_proposal_id_fkey"
            columns: ["solo_proposal_id"]
            isOneToOne: false
            referencedRelation: "solo_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      solo_mode_gates: {
        Row: {
          ai_agent_used: string | null
          ai_confidence: number | null
          ai_recommendation: Json | null
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string | null
          decision_notes: string | null
          gate_id: string
          gate_name: string
          id: string
          opportunity_id: string
          phase_number: number
          status: string
          updated_at: string | null
        }
        Insert: {
          ai_agent_used?: string | null
          ai_confidence?: number | null
          ai_recommendation?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string | null
          decision_notes?: string | null
          gate_id: string
          gate_name: string
          id?: string
          opportunity_id: string
          phase_number: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          ai_agent_used?: string | null
          ai_confidence?: number | null
          ai_recommendation?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string | null
          decision_notes?: string | null
          gate_id?: string
          gate_name?: string
          id?: string
          opportunity_id?: string
          phase_number?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solo_mode_gates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solo_mode_gates_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      solo_mode_phase_config: {
        Row: {
          ai_agent_for_gate: string | null
          color: string | null
          created_at: string | null
          description: string | null
          estimated_duration: string | null
          gate_id: string | null
          gate_name: string | null
          gate_required: boolean | null
          icon: string | null
          id: string
          phase_name: string
          phase_number: number
          shipley_phase: string
          sort_order: number
          tasks: Json | null
        }
        Insert: {
          ai_agent_for_gate?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          estimated_duration?: string | null
          gate_id?: string | null
          gate_name?: string | null
          gate_required?: boolean | null
          icon?: string | null
          id?: string
          phase_name: string
          phase_number: number
          shipley_phase: string
          sort_order: number
          tasks?: Json | null
        }
        Update: {
          ai_agent_for_gate?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          estimated_duration?: string | null
          gate_id?: string | null
          gate_name?: string | null
          gate_required?: boolean | null
          icon?: string | null
          id?: string
          phase_name?: string
          phase_number?: number
          shipley_phase?: string
          sort_order?: number
          tasks?: Json | null
        }
        Relationships: []
      }
      solo_proposals: {
        Row: {
          company_id: string | null
          created_at: string | null
          current_phase: number | null
          id: string
          opportunity_id: string | null
          progress_percent: number | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          current_phase?: number | null
          id?: string
          opportunity_id?: string | null
          progress_percent?: number | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          current_phase?: number | null
          id?: string
          opportunity_id?: string | null
          progress_percent?: number | null
          status?: string | null
        }
        Relationships: []
      }
      solo_sme_feedback: {
        Row: {
          feedback: string | null
          id: string
          phase: number | null
          solo_proposal_id: string | null
          submitted_at: string | null
          task_id: string
        }
        Insert: {
          feedback?: string | null
          id?: string
          phase?: number | null
          solo_proposal_id?: string | null
          submitted_at?: string | null
          task_id: string
        }
        Update: {
          feedback?: string | null
          id?: string
          phase?: number | null
          solo_proposal_id?: string | null
          submitted_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solo_sme_feedback_solo_proposal_id_fkey"
            columns: ["solo_proposal_id"]
            isOneToOne: false
            referencedRelation: "solo_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      solo_task_outputs: {
        Row: {
          ai_output: string | null
          confidence: number | null
          created_at: string | null
          id: string
          phase: number | null
          solo_proposal_id: string | null
          status: string | null
          task_id: string
        }
        Insert: {
          ai_output?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          phase?: number | null
          solo_proposal_id?: string | null
          status?: string | null
          task_id: string
        }
        Update: {
          ai_output?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          phase?: number | null
          solo_proposal_id?: string | null
          status?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solo_task_outputs_solo_proposal_id_fkey"
            columns: ["solo_proposal_id"]
            isOneToOne: false
            referencedRelation: "solo_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_mappings: {
        Row: {
          created_at: string | null
          display_order: number | null
          hubspot_stage: string
          hubspot_stage_id: string | null
          id: string
          pipeline: string | null
          shipley_phase: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          hubspot_stage: string
          hubspot_stage_id?: string | null
          id?: string
          pipeline?: string | null
          shipley_phase: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          hubspot_stage?: string
          hubspot_stage_id?: string | null
          id?: string
          pipeline?: string | null
          shipley_phase?: string
        }
        Relationships: []
      }
      subcontractor_assignments: {
        Row: {
          commitment_date: string | null
          created_at: string | null
          estimated_value: number | null
          id: string
          labor_categories: string[] | null
          notes: string | null
          opportunity_id: string | null
          role: string
          status: string | null
          subcontractor_id: string | null
          work_share_percent: number | null
        }
        Insert: {
          commitment_date?: string | null
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          labor_categories?: string[] | null
          notes?: string | null
          opportunity_id?: string | null
          role: string
          status?: string | null
          subcontractor_id?: string | null
          work_share_percent?: number | null
        }
        Update: {
          commitment_date?: string | null
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          labor_categories?: string[] | null
          notes?: string | null
          opportunity_id?: string | null
          role?: string
          status?: string | null
          subcontractor_id?: string | null
          work_share_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_assignments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          address: string | null
          cage_code: string | null
          capabilities: string | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          duns_number: string | null
          id: string
          naics_codes: string[] | null
          name: string
          nda_expiration: string | null
          nda_signed: boolean | null
          notes: string | null
          past_performance_rating: string | null
          primary_contact: string | null
          relationship_status: string | null
          set_aside_status: string[] | null
          state: string | null
          ta_expiration: string | null
          teaming_agreement: boolean | null
          uei_number: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          cage_code?: string | null
          capabilities?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          duns_number?: string | null
          id?: string
          naics_codes?: string[] | null
          name: string
          nda_expiration?: string | null
          nda_signed?: boolean | null
          notes?: string | null
          past_performance_rating?: string | null
          primary_contact?: string | null
          relationship_status?: string | null
          set_aside_status?: string[] | null
          state?: string | null
          ta_expiration?: string | null
          teaming_agreement?: boolean | null
          uei_number?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          cage_code?: string | null
          capabilities?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          duns_number?: string | null
          id?: string
          naics_codes?: string[] | null
          name?: string
          nda_expiration?: string | null
          nda_signed?: boolean | null
          notes?: string | null
          past_performance_rating?: string | null
          primary_contact?: string | null
          relationship_status?: string | null
          set_aside_status?: string[] | null
          state?: string | null
          ta_expiration?: string | null
          teaming_agreement?: boolean | null
          uei_number?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_log: {
        Row: {
          confirmation_number: string | null
          id: string
          opportunity_id: string
          submission_method: string | null
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          confirmation_number?: string | null
          id?: string
          opportunity_id: string
          submission_method?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          confirmation_number?: string | null
          id?: string
          opportunity_id?: string
          submission_method?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          created_at: string | null
          id: string
          name: string
          opportunity_id: string | null
          result_date: string | null
          roi_percent: number | null
          status: string | null
          submitted_date: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          opportunity_id?: string | null
          result_date?: string | null
          roi_percent?: number | null
          status?: string | null
          submitted_date?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          opportunity_id?: string | null
          result_date?: string | null
          roi_percent?: number | null
          status?: string | null
          submitted_date?: string | null
          value?: number | null
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          comment_text: string
          created_at: string | null
          id: string
          task_id: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          comment_text: string
          created_at?: string | null
          id?: string
          task_id?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          comment_text?: string
          created_at?: string | null
          id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          assigned_to_name: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          due_time: string | null
          estimated_hours: number | null
          id: string
          opportunity_id: string | null
          parent_task_id: string | null
          priority: string | null
          section_reference: string | null
          status: string | null
          tags: string[] | null
          task_description: string | null
          task_title: string
          task_type: string | null
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          due_time?: string | null
          estimated_hours?: number | null
          id?: string
          opportunity_id?: string | null
          parent_task_id?: string | null
          priority?: string | null
          section_reference?: string | null
          status?: string | null
          tags?: string[] | null
          task_description?: string | null
          task_title: string
          task_type?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          due_time?: string | null
          estimated_hours?: number | null
          id?: string
          opportunity_id?: string | null
          parent_task_id?: string | null
          priority?: string | null
          section_reference?: string | null
          status?: string | null
          tags?: string[] | null
          task_description?: string | null
          task_title?: string
          task_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          opportunity_id: string | null
          responsibilities: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          opportunity_id?: string | null
          responsibilities?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          opportunity_id?: string | null
          responsibilities?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          company_id: string
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          avatar_url: string | null
          bio: string | null
          certifications: Json | null
          clearance_expiry: string | null
          clearance_level: string | null
          company_id: string | null
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          joined_date: string | null
          location: string | null
          phone: string | null
          role_id: string | null
          skills: Json | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: Json | null
          clearance_expiry?: string | null
          clearance_level?: string | null
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          joined_date?: string | null
          location?: string | null
          phone?: string | null
          role_id?: string | null
          skills?: Json | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          certifications?: Json | null
          clearance_expiry?: string | null
          clearance_level?: string | null
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          joined_date?: string | null
          location?: string | null
          phone?: string | null
          role_id?: string | null
          skills?: Json | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      team_workload: {
        Row: {
          actual_hours: number | null
          allocated_hours: number | null
          company_id: string | null
          created_at: string | null
          id: string
          is_overloaded: boolean | null
          max_hours: number | null
          notes: string | null
          proposal_assignments: Json | null
          task_count: number | null
          updated_at: string | null
          user_id: string | null
          week_start: string
        }
        Insert: {
          actual_hours?: number | null
          allocated_hours?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_overloaded?: boolean | null
          max_hours?: number | null
          notes?: string | null
          proposal_assignments?: Json | null
          task_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          week_start: string
        }
        Update: {
          actual_hours?: number | null
          allocated_hours?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_overloaded?: boolean | null
          max_hours?: number | null
          notes?: string | null
          proposal_assignments?: Json | null
          task_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_workload_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_workload_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teaming_agreements: {
        Row: {
          agreement_type: string | null
          created_at: string | null
          document_url: string | null
          executed_date: string | null
          expiration_date: string | null
          id: string
          key_terms: Json | null
          notes: string | null
          opportunity_id: string | null
          partner_name: string
          partner_type: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          sent_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agreement_type?: string | null
          created_at?: string | null
          document_url?: string | null
          executed_date?: string | null
          expiration_date?: string | null
          id?: string
          key_terms?: Json | null
          notes?: string | null
          opportunity_id?: string | null
          partner_name: string
          partner_type?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          sent_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agreement_type?: string | null
          created_at?: string | null
          document_url?: string | null
          executed_date?: string | null
          expiration_date?: string | null
          id?: string
          key_terms?: Json | null
          notes?: string | null
          opportunity_id?: string | null
          partner_name?: string
          partner_type?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          sent_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaming_agreements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      teaming_partner_capabilities: {
        Row: {
          capability_area: string
          capability_description: string | null
          certifications: string[] | null
          created_at: string | null
          experience_years: number | null
          id: string
          is_differentiator: boolean | null
          partner_id: string | null
        }
        Insert: {
          capability_area: string
          capability_description?: string | null
          certifications?: string[] | null
          created_at?: string | null
          experience_years?: number | null
          id?: string
          is_differentiator?: boolean | null
          partner_id?: string | null
        }
        Update: {
          capability_area?: string
          capability_description?: string | null
          certifications?: string[] | null
          created_at?: string | null
          experience_years?: number | null
          id?: string
          is_differentiator?: boolean | null
          partner_id?: string | null
        }
        Relationships: []
      }
      teaming_partner_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_bd_contact: boolean | null
          is_primary: boolean | null
          is_technical_contact: boolean | null
          last_contact_date: string | null
          linkedin: string | null
          name: string
          notes: string | null
          partner_id: string | null
          phone: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_bd_contact?: boolean | null
          is_primary?: boolean | null
          is_technical_contact?: boolean | null
          last_contact_date?: string | null
          linkedin?: string | null
          name: string
          notes?: string | null
          partner_id?: string | null
          phone?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_bd_contact?: boolean | null
          is_primary?: boolean | null
          is_technical_contact?: boolean | null
          last_contact_date?: string | null
          linkedin?: string | null
          name?: string
          notes?: string | null
          partner_id?: string | null
          phone?: string | null
          title?: string | null
        }
        Relationships: []
      }
      teaming_partners: {
        Row: {
          capabilities: string[] | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          nda_date: string | null
          nda_status: string | null
          notes: string | null
          opportunity_id: string | null
          role: string | null
          set_aside_status: string | null
          status: string | null
          ta_date: string | null
          ta_status: string | null
          updated_at: string | null
          workshare_percentage: number | null
        }
        Insert: {
          capabilities?: string[] | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          nda_date?: string | null
          nda_status?: string | null
          notes?: string | null
          opportunity_id?: string | null
          role?: string | null
          set_aside_status?: string | null
          status?: string | null
          ta_date?: string | null
          ta_status?: string | null
          updated_at?: string | null
          workshare_percentage?: number | null
        }
        Update: {
          capabilities?: string[] | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          nda_date?: string | null
          nda_status?: string | null
          notes?: string | null
          opportunity_id?: string | null
          role?: string | null
          set_aside_status?: string | null
          status?: string | null
          ta_date?: string | null
          ta_status?: string | null
          updated_at?: string | null
          workshare_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teaming_partners_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string | null
          id: string
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      token_usage: {
        Row: {
          agent_id: string
          created_at: string
          estimated_cost_usd: number
          id: string
          input_tokens: number
          metadata: Json | null
          opportunity_id: string | null
          output_tokens: number
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          opportunity_id?: string | null
          output_tokens?: number
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          opportunity_id?: string | null
          output_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      user_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          performed_by: string | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          full_name: string
          id: string
          invitation_token: string | null
          invited_by: string | null
          role: string
          status: string
          token: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          full_name: string
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          token?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          full_name?: string
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          company_id: string | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_read: boolean | null
          message: string | null
          notification_type: string
          priority: string | null
          read_at: string | null
          source_id: string | null
          source_type: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notification_type: string
          priority?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notification_type?: string
          priority?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_quotas: {
        Row: {
          daily_limit: number
          monthly_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_limit?: number
          monthly_limit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_limit?: number
          monthly_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          date_format: string | null
          default_view: string | null
          digest_frequency: string | null
          display_name: string | null
          email_notifications: boolean | null
          id: string
          preferences: Json | null
          push_notifications: boolean | null
          sidebar_collapsed: boolean | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          date_format?: string | null
          default_view?: string | null
          digest_frequency?: string | null
          display_name?: string | null
          email_notifications?: boolean | null
          id?: string
          preferences?: Json | null
          push_notifications?: boolean | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          date_format?: string | null
          default_view?: string | null
          digest_frequency?: string | null
          display_name?: string | null
          email_notifications?: boolean | null
          id?: string
          preferences?: Json | null
          push_notifications?: boolean | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          last_login: string | null
          permissions: Json | null
          phone: string | null
          preferences: Json | null
          role: string
          settings: Json | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          last_login?: string | null
          permissions?: Json | null
          phone?: string | null
          preferences?: Json | null
          role?: string
          settings?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          permissions?: Json | null
          phone?: string | null
          preferences?: Json | null
          role?: string
          settings?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      volume_sections: {
        Row: {
          assigned_to: string | null
          compliance_requirements: Json | null
          content_notes: string | null
          created_at: string | null
          current_pages: number | null
          id: string
          page_allocation: number | null
          rfp_reference: string | null
          section_number: string
          section_title: string
          status: string | null
          updated_at: string | null
          volume_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          compliance_requirements?: Json | null
          content_notes?: string | null
          created_at?: string | null
          current_pages?: number | null
          id?: string
          page_allocation?: number | null
          rfp_reference?: string | null
          section_number: string
          section_title: string
          status?: string | null
          updated_at?: string | null
          volume_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          compliance_requirements?: Json | null
          content_notes?: string | null
          created_at?: string | null
          current_pages?: number | null
          id?: string
          page_allocation?: number | null
          rfp_reference?: string | null
          section_number?: string
          section_title?: string
          status?: string | null
          updated_at?: string | null
          volume_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volume_sections_volume_id_fkey"
            columns: ["volume_id"]
            isOneToOne: false
            referencedRelation: "proposal_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      win_loss_records: {
        Row: {
          company_id: string | null
          competed_value: number | null
          competitor_winner: string | null
          contract_value: number | null
          created_at: string | null
          debrief_date: string | null
          debrief_notes: string | null
          fiscal_year: number | null
          id: string
          lessons_learned: string | null
          loss_reasons: string[] | null
          opportunity_id: string | null
          quarter: number | null
          result: string | null
          win_themes: string[] | null
        }
        Insert: {
          company_id?: string | null
          competed_value?: number | null
          competitor_winner?: string | null
          contract_value?: number | null
          created_at?: string | null
          debrief_date?: string | null
          debrief_notes?: string | null
          fiscal_year?: number | null
          id?: string
          lessons_learned?: string | null
          loss_reasons?: string[] | null
          opportunity_id?: string | null
          quarter?: number | null
          result?: string | null
          win_themes?: string[] | null
        }
        Update: {
          company_id?: string | null
          competed_value?: number | null
          competitor_winner?: string | null
          contract_value?: number | null
          created_at?: string | null
          debrief_date?: string | null
          debrief_notes?: string | null
          fiscal_year?: number | null
          id?: string
          lessons_learned?: string | null
          loss_reasons?: string[] | null
          opportunity_id?: string | null
          quarter?: number | null
          result?: string | null
          win_themes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "win_loss_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "win_loss_records_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      win_themes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          evaluation_factor: string | null
          ghost_competitor: string | null
          ghost_statement: string | null
          id: string
          opportunity_id: string | null
          priority: number | null
          proof_points: Json | null
          status: string | null
          theme_text: string
          theme_type: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          evaluation_factor?: string | null
          ghost_competitor?: string | null
          ghost_statement?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: number | null
          proof_points?: Json | null
          status?: string | null
          theme_text: string
          theme_type?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          evaluation_factor?: string | null
          ghost_competitor?: string | null
          ghost_statement?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: number | null
          proof_points?: Json | null
          status?: string | null
          theme_text?: string
          theme_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workload_capacity: {
        Row: {
          certifications: string[] | null
          current_week_allocated: number | null
          id: string
          skills: string[] | null
          updated_at: string | null
          user_id: string | null
          weekly_hours_available: number | null
        }
        Insert: {
          certifications?: string[] | null
          current_week_allocated?: number | null
          id?: string
          skills?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          weekly_hours_available?: number | null
        }
        Update: {
          certifications?: string[] | null
          current_week_allocated?: number | null
          id?: string
          skills?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          weekly_hours_available?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_chat_analytics: {
        Row: {
          agent_type: string | null
          avg_messages_per_session: number | null
          last_activity: string | null
          session_count: number | null
          total_messages: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      v_lead_pipeline: {
        Row: {
          count: number | null
          last_30_days: number | null
          last_7_days: number | null
          status: string | null
        }
        Relationships: []
      }
      v_nist_compliance_status: {
        Row: {
          control_id: string | null
          control_name: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_chat_message: {
        Args: {
          p_content: string
          p_role: string
          p_session_id: string
          p_tokens?: number
        }
        Returns: string
      }
      can_access_sensitive: { Args: never; Returns: boolean }
      check_mfa_compliance: { Args: never; Returns: boolean }
      decrement_votes: { Args: { suggestion_id: string }; Returns: undefined }
      get_my_company_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_or_create_chat_session: {
        Args: { p_agent_type: string; p_opportunity_id?: string }
        Returns: string
      }
      get_user_company_id:
        | { Args: never; Returns: string }
        | { Args: { p_user_id: string }; Returns: string }
      get_user_role:
        | { Args: never; Returns: string }
        | { Args: { p_user_id: string }; Returns: string }
      increment_votes: { Args: { suggestion_id: string }; Returns: undefined }
      is_account_locked: { Args: { check_user_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_authenticated: { Args: never; Returns: boolean }
      is_internal_user: { Args: never; Returns: boolean }
      is_mfa_enabled: { Args: never; Returns: boolean }
      is_user_solo_mode: { Args: never; Returns: boolean }
      log_cui_classification: {
        Args: {
          p_agent_type: string
          p_category: string
          p_company_id: string
          p_confidence: number
          p_model_routed: string
          p_opportunity_id?: string
          p_query_hash: string
          p_query_length: number
          p_reasoning: string
          p_requires_fedramp: boolean
          p_user_id: string
        }
        Returns: string
      }
      refresh_audit_consolidated: { Args: never; Returns: undefined }
      requires_mfa: { Args: never; Returns: boolean }
      reset_lockout: { Args: { target_user_id: string }; Returns: boolean }
      search_company_knowledge: {
        Args: {
          filter_category?: string
          match_company_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          document_id: string
          file_name: string
          id: string
          similarity: number
        }[]
      }
      seed_company_demo_data: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      user_company_matches_text: {
        Args: { record_company: string }
        Returns: boolean
      }
      user_has_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      validate_password_strength: {
        Args: { password: string }
        Returns: {
          errors: string[]
          is_valid: boolean
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
