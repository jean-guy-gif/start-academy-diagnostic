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
      activity_logs: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          client_id: string | null
          created_at: string
          diagnostic_id: string | null
          entity_id: string | null
          entity_type: string | null
          event_description: string | null
          event_label: string
          event_type: string
          id: string
          metadata: Json
          session_id: string | null
          severity: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          client_id?: string | null
          created_at?: string
          diagnostic_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_description?: string | null
          event_label: string
          event_type: string
          id?: string
          metadata?: Json
          session_id?: string | null
          severity?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          client_id?: string | null
          created_at?: string
          diagnostic_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_description?: string | null
          event_label?: string
          event_type?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generation_logs: {
        Row: {
          cost_estimate: number | null
          created_at: string
          created_by: string | null
          diagnostic_id: string | null
          duration_ms: number | null
          error: string | null
          id: string
          model: string | null
          prompt: Json | null
          provider: string
          purpose: string | null
          recommendation_id: string | null
          response: Json | null
          route: string | null
          session_id: string | null
          source: string | null
          status: string
          tokens_input: number | null
          tokens_output: number | null
          total_tokens: number | null
        }
        Insert: {
          cost_estimate?: number | null
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          prompt?: Json | null
          provider: string
          purpose?: string | null
          recommendation_id?: string | null
          response?: Json | null
          route?: string | null
          session_id?: string | null
          source?: string | null
          status?: string
          tokens_input?: number | null
          tokens_output?: number | null
          total_tokens?: number | null
        }
        Update: {
          cost_estimate?: number | null
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          prompt?: Json | null
          provider?: string
          purpose?: string | null
          recommendation_id?: string | null
          response?: Json | null
          route?: string | null
          session_id?: string | null
          source?: string | null
          status?: string
          tokens_input?: number | null
          tokens_output?: number | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_logs_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_logs_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse_principale: string | null
          ai_tools: string[]
          collaborators_count: number | null
          company_name: string
          created_at: string
          created_by: string | null
          crm_used: string | null
          date_creation: string | null
          director: string | null
          email: string | null
          enseigne: string | null
          id: string
          maturity_global: string | null
          nombre_agences: number | null
          phone: string | null
          secteurs_geographiques: string[] | null
          sector: string | null
          siret: string | null
          site_internet: string | null
          team_typology: string[]
          typologie_biens: string[] | null
          updated_at: string
        }
        Insert: {
          adresse_principale?: string | null
          ai_tools?: string[]
          collaborators_count?: number | null
          company_name: string
          created_at?: string
          created_by?: string | null
          crm_used?: string | null
          date_creation?: string | null
          director?: string | null
          email?: string | null
          enseigne?: string | null
          id?: string
          maturity_global?: string | null
          nombre_agences?: number | null
          phone?: string | null
          secteurs_geographiques?: string[] | null
          sector?: string | null
          siret?: string | null
          site_internet?: string | null
          team_typology?: string[]
          typologie_biens?: string[] | null
          updated_at?: string
        }
        Update: {
          adresse_principale?: string | null
          ai_tools?: string[]
          collaborators_count?: number | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          crm_used?: string | null
          date_creation?: string | null
          director?: string | null
          email?: string | null
          enseigne?: string | null
          id?: string
          maturity_global?: string | null
          nombre_agences?: number | null
          phone?: string | null
          secteurs_geographiques?: string[] | null
          sector?: string | null
          siret?: string | null
          site_internet?: string | null
          team_typology?: string[]
          typologie_biens?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      designed_training_supports: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          designed_json: Json
          id: string
          model: string | null
          session_id: string
          source: string
          status: string
          subtitle: string | null
          title: string
          training_support_id: string | null
          updated_at: string
          visual_intent: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          designed_json: Json
          id?: string
          model?: string | null
          session_id: string
          source: string
          status?: string
          subtitle?: string | null
          title: string
          training_support_id?: string | null
          updated_at?: string
          visual_intent?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          designed_json?: Json
          id?: string
          model?: string | null
          session_id?: string
          source?: string
          status?: string
          subtitle?: string | null
          title?: string
          training_support_id?: string | null
          updated_at?: string
          visual_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designed_training_supports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designed_training_supports_training_support_id_fkey"
            columns: ["training_support_id"]
            isOneToOne: false
            referencedRelation: "training_supports"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_answers: {
        Row: {
          answer: string | null
          category: string | null
          created_at: string
          diagnostic_id: string
          id: string
          is_skipped: boolean
          is_weak_signal: boolean
          note: string | null
          question_id: string
          question_text: string | null
        }
        Insert: {
          answer?: string | null
          category?: string | null
          created_at?: string
          diagnostic_id: string
          id?: string
          is_skipped?: boolean
          is_weak_signal?: boolean
          note?: string | null
          question_id: string
          question_text?: string | null
        }
        Update: {
          answer?: string | null
          category?: string | null
          created_at?: string
          diagnostic_id?: string
          id?: string
          is_skipped?: boolean
          is_weak_signal?: boolean
          note?: string | null
          question_id?: string
          question_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_answers_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_participants: {
        Row: {
          agefice_amount_consumed_current_year: number | null
          ca_annee_en_cours: number | null
          contract_type: string | null
          convention_collective: string | null
          created_at: string
          diagnostic_id: string
          eligible_opco: boolean | null
          entry_date: string | null
          estimated_funding_amount: number | null
          estimated_remaining_cost: number | null
          expert_level: string | null
          first_name: string | null
          formations_24m_amount: number | null
          formations_24m_count: number | null
          formations_24m_hours: number | null
          formations_current_year_hours: number | null
          funding_eligibility: string
          id: string
          job_title: string | null
          last_name: string | null
          notes: string | null
          opco_ep_amount_consumed_current_year: number | null
          previous_year_production: number | null
          priority_need: string | null
          professional_status: string | null
          updated_at: string
          wants_evolution: boolean | null
          wants_training: boolean | null
        }
        Insert: {
          agefice_amount_consumed_current_year?: number | null
          ca_annee_en_cours?: number | null
          contract_type?: string | null
          convention_collective?: string | null
          created_at?: string
          diagnostic_id: string
          eligible_opco?: boolean | null
          entry_date?: string | null
          estimated_funding_amount?: number | null
          estimated_remaining_cost?: number | null
          expert_level?: string | null
          first_name?: string | null
          formations_24m_amount?: number | null
          formations_24m_count?: number | null
          formations_24m_hours?: number | null
          formations_current_year_hours?: number | null
          funding_eligibility?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          opco_ep_amount_consumed_current_year?: number | null
          previous_year_production?: number | null
          priority_need?: string | null
          professional_status?: string | null
          updated_at?: string
          wants_evolution?: boolean | null
          wants_training?: boolean | null
        }
        Update: {
          agefice_amount_consumed_current_year?: number | null
          ca_annee_en_cours?: number | null
          contract_type?: string | null
          convention_collective?: string | null
          created_at?: string
          diagnostic_id?: string
          eligible_opco?: boolean | null
          entry_date?: string | null
          estimated_funding_amount?: number | null
          estimated_remaining_cost?: number | null
          expert_level?: string | null
          first_name?: string | null
          formations_24m_amount?: number | null
          formations_24m_count?: number | null
          formations_24m_hours?: number | null
          formations_current_year_hours?: number | null
          funding_eligibility?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          opco_ep_amount_consumed_current_year?: number | null
          previous_year_production?: number | null
          priority_need?: string | null
          professional_status?: string | null
          updated_at?: string
          wants_evolution?: boolean | null
          wants_training?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_participants_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostics: {
        Row: {
          activite_repartition: Json | null
          agefice_used_before: string | null
          ai_confidence: number | null
          ai_synthesis: string | null
          alerts_snapshot: Json | null
          ambition_3_ans: string | null
          ca_global_n_moins_1: number | null
          client_id: string
          commercial_id: string | null
          created_at: string
          created_by: string | null
          declared_goal: string | null
          expected_participants: number | null
          formations_24m_count: number | null
          formations_24m_hours: number | null
          formations_24m_organizations: string[] | null
          formations_24m_satisfaction: number | null
          formations_24m_topics: string[] | null
          id: string
          internal_training_budget: boolean | null
          internal_training_budget_amount: number | null
          knows_current_rights: boolean | null
          meeting_date: string | null
          mode: string
          nb_agents_indep: number | null
          nb_assistants: number | null
          nb_dirigeants: number | null
          nb_managers: number | null
          nb_salaries: number | null
          notes: string | null
          objectif_ca_annee_en_cours: number | null
          opco_ep_amount_consumed_current_year: number | null
          opco_used_before: string | null
          past_refusals: boolean | null
          past_refusals_reason: string | null
          profiles_in_scope: string[]
          ratios_snapshot: Json | null
          status: string
          updated_at: string
          ventes_n_moins_1: number | null
        }
        Insert: {
          activite_repartition?: Json | null
          agefice_used_before?: string | null
          ai_confidence?: number | null
          ai_synthesis?: string | null
          alerts_snapshot?: Json | null
          ambition_3_ans?: string | null
          ca_global_n_moins_1?: number | null
          client_id: string
          commercial_id?: string | null
          created_at?: string
          created_by?: string | null
          declared_goal?: string | null
          expected_participants?: number | null
          formations_24m_count?: number | null
          formations_24m_hours?: number | null
          formations_24m_organizations?: string[] | null
          formations_24m_satisfaction?: number | null
          formations_24m_topics?: string[] | null
          id?: string
          internal_training_budget?: boolean | null
          internal_training_budget_amount?: number | null
          knows_current_rights?: boolean | null
          meeting_date?: string | null
          mode?: string
          nb_agents_indep?: number | null
          nb_assistants?: number | null
          nb_dirigeants?: number | null
          nb_managers?: number | null
          nb_salaries?: number | null
          notes?: string | null
          objectif_ca_annee_en_cours?: number | null
          opco_ep_amount_consumed_current_year?: number | null
          opco_used_before?: string | null
          past_refusals?: boolean | null
          past_refusals_reason?: string | null
          profiles_in_scope?: string[]
          ratios_snapshot?: Json | null
          status?: string
          updated_at?: string
          ventes_n_moins_1?: number | null
        }
        Update: {
          activite_repartition?: Json | null
          agefice_used_before?: string | null
          ai_confidence?: number | null
          ai_synthesis?: string | null
          alerts_snapshot?: Json | null
          ambition_3_ans?: string | null
          ca_global_n_moins_1?: number | null
          client_id?: string
          commercial_id?: string | null
          created_at?: string
          created_by?: string | null
          declared_goal?: string | null
          expected_participants?: number | null
          formations_24m_count?: number | null
          formations_24m_hours?: number | null
          formations_24m_organizations?: string[] | null
          formations_24m_satisfaction?: number | null
          formations_24m_topics?: string[] | null
          id?: string
          internal_training_budget?: boolean | null
          internal_training_budget_amount?: number | null
          knows_current_rights?: boolean | null
          meeting_date?: string | null
          mode?: string
          nb_agents_indep?: number | null
          nb_assistants?: number | null
          nb_dirigeants?: number | null
          nb_managers?: number | null
          nb_salaries?: number | null
          notes?: string | null
          objectif_ca_annee_en_cours?: number | null
          opco_ep_amount_consumed_current_year?: number | null
          opco_used_before?: string | null
          past_refusals?: boolean | null
          past_refusals_reason?: string | null
          profiles_in_scope?: string[]
          ratios_snapshot?: Json | null
          status?: string
          updated_at?: string
          ventes_n_moins_1?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostics_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_config: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key: string
          notes: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          notes?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          notes?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          priority: number
          required_modules: string[]
          trigger_signal: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          required_modules?: string[]
          trigger_signal: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          required_modules?: string[]
          trigger_signal?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_training_reviews: {
        Row: {
          actionability_score: number | null
          content_relevance_score: number | null
          created_at: string
          director_feedback: string | null
          follow_up_actions: Json
          id: string
          key_blockers: Json
          key_successes: Json
          metadata: Json
          next_commercial_opportunity: string | null
          participant_feedback_summary: string | null
          perceived_value_score: number | null
          review_type: string
          reviewer_id: string | null
          reviewer_name: string | null
          satisfaction_score: number | null
          session_id: string
          status: string
          trainer_notes: string | null
          updated_at: string
        }
        Insert: {
          actionability_score?: number | null
          content_relevance_score?: number | null
          created_at?: string
          director_feedback?: string | null
          follow_up_actions?: Json
          id?: string
          key_blockers?: Json
          key_successes?: Json
          metadata?: Json
          next_commercial_opportunity?: string | null
          participant_feedback_summary?: string | null
          perceived_value_score?: number | null
          review_type: string
          reviewer_id?: string | null
          reviewer_name?: string | null
          satisfaction_score?: number | null
          session_id: string
          status?: string
          trainer_notes?: string | null
          updated_at?: string
        }
        Update: {
          actionability_score?: number | null
          content_relevance_score?: number | null
          created_at?: string
          director_feedback?: string | null
          follow_up_actions?: Json
          id?: string
          key_blockers?: Json
          key_successes?: Json
          metadata?: Json
          next_commercial_opportunity?: string | null
          participant_feedback_summary?: string | null
          perceived_value_score?: number | null
          review_type?: string
          reviewer_id?: string | null
          reviewer_name?: string | null
          satisfaction_score?: number | null
          session_id?: string
          status?: string
          trainer_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_training_reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
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
          organization: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organization?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          created_at: string
          created_by: string | null
          diagnostic_id: string
          generated_at: string
          id: string
          model: string | null
          notes: string[]
          proposal_json: Json
          provider: string | null
          recommendation_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          diagnostic_id: string
          generated_at?: string
          id?: string
          model?: string | null
          notes?: string[]
          proposal_json: Json
          provider?: string | null
          recommendation_id?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string
          generated_at?: string
          id?: string
          model?: string | null
          notes?: string[]
          proposal_json?: Json
          provider?: string | null
          recommendation_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_access_tokens: {
        Row: {
          access_type: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          metadata: Json
          recipient_email: string | null
          recipient_name: string | null
          session_id: string
          token_hash: string
          updated_at: string
          used_count: number
        }
        Insert: {
          access_type: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          metadata?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          session_id: string
          token_hash: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          access_type?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          metadata?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          session_id?: string
          token_hash?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_access_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_modules: {
        Row: {
          business_ratio_targeted: string | null
          created_at: string
          duration_hours: number | null
          id: string
          module_id: string
          position: number
          priority_tier: string | null
          reason: string | null
          recommendation_id: string
          use_cases: Json
        }
        Insert: {
          business_ratio_targeted?: string | null
          created_at?: string
          duration_hours?: number | null
          id?: string
          module_id: string
          position?: number
          priority_tier?: string | null
          reason?: string | null
          recommendation_id: string
          use_cases?: Json
        }
        Update: {
          business_ratio_targeted?: string | null
          created_at?: string
          duration_hours?: number | null
          id?: string
          module_id?: string
          position?: number
          priority_tier?: string | null
          reason?: string | null
          recommendation_id?: string
          use_cases?: Json
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_modules_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          client_summary: string | null
          commercial_explanation: string | null
          confidence_score: number | null
          cost_per_participant: number | null
          created_at: string
          created_by: string | null
          detected_needs: Json
          diagnostic_id: string
          id: string
          missing_information: Json
          performance_issues: Json
          required_foundations: Json
          skill_level: string | null
          status: string
          tool_maturity: string | null
          total_duration_hours: number | null
          updated_at: string
        }
        Insert: {
          client_summary?: string | null
          commercial_explanation?: string | null
          confidence_score?: number | null
          cost_per_participant?: number | null
          created_at?: string
          created_by?: string | null
          detected_needs?: Json
          diagnostic_id: string
          id?: string
          missing_information?: Json
          performance_issues?: Json
          required_foundations?: Json
          skill_level?: string | null
          status?: string
          tool_maturity?: string | null
          total_duration_hours?: number | null
          updated_at?: string
        }
        Update: {
          client_summary?: string | null
          commercial_explanation?: string | null
          confidence_score?: number | null
          cost_per_participant?: number | null
          created_at?: string
          created_by?: string | null
          detected_needs?: Json
          diagnostic_id?: string
          id?: string
          missing_information?: Json
          performance_issues?: Json
          required_foundations?: Json
          skill_level?: string | null
          status?: string
          tool_maturity?: string | null
          total_duration_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
      session_date_options: {
        Row: {
          created_at: string
          created_by: string | null
          end_at: string
          format: string | null
          id: string
          location: string | null
          metadata: Json
          selected_at: string | null
          selected_by_email: string | null
          session_id: string
          start_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_at: string
          format?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          selected_at?: string | null
          selected_by_email?: string | null
          session_id: string
          start_at: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_at?: string
          format?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          selected_at?: string | null
          selected_by_email?: string | null
          session_id?: string
          start_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_date_options_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_documents: {
        Row: {
          created_at: string
          document_category: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          metadata: Json
          participant_id: string | null
          session_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_category?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json
          participant_id?: string | null
          session_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_category?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json
          participant_id?: string | null
          session_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_documents_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          concrete_case: string | null
          created_at: string
          email: string
          estimated_level: string | null
          first_name: string
          id: string
          last_diploma: string | null
          last_name: string
          main_problem: string | null
          metadata: Json
          personal_goal: string | null
          professional_status: string | null
          real_estate_experience_years: string | null
          role: string | null
          session_id: string
          tools_used: Json
          updated_at: string
        }
        Insert: {
          concrete_case?: string | null
          created_at?: string
          email: string
          estimated_level?: string | null
          first_name: string
          id?: string
          last_diploma?: string | null
          last_name: string
          main_problem?: string | null
          metadata?: Json
          personal_goal?: string | null
          professional_status?: string | null
          real_estate_experience_years?: string | null
          role?: string | null
          session_id: string
          tools_used?: Json
          updated_at?: string
        }
        Update: {
          concrete_case?: string | null
          created_at?: string
          email?: string
          estimated_level?: string | null
          first_name?: string
          id?: string
          last_diploma?: string | null
          last_name?: string
          main_problem?: string | null
          metadata?: Json
          personal_goal?: string | null
          professional_status?: string | null
          real_estate_experience_years?: string | null
          role?: string | null
          session_id?: string
          tools_used?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_quality_reviews: {
        Row: {
          checklist: Json
          created_at: string
          designed_support_id: string | null
          id: string
          notes: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          score_max: number | null
          score_percent: number | null
          score_total: number | null
          session_id: string
          status: string
          training_support_id: string | null
          updated_at: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          designed_support_id?: string | null
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          score_max?: number | null
          score_percent?: number | null
          score_total?: number | null
          session_id: string
          status?: string
          training_support_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          designed_support_id?: string | null
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          score_max?: number | null
          score_percent?: number | null
          score_total?: number | null
          session_id?: string
          status?: string
          training_support_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_quality_reviews_designed_support_id_fkey"
            columns: ["designed_support_id"]
            isOneToOne: false
            referencedRelation: "designed_training_supports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_quality_reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_quality_reviews_training_support_id_fkey"
            columns: ["training_support_id"]
            isOneToOne: false
            referencedRelation: "training_supports"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          created_at: string
          diagnostic_signals: string[]
          duration_hours: number | null
          family: string
          id: string
          is_foundation_module: boolean
          level: number | null
          name: string
          need_identification: string | null
          paying: boolean | null
          platform: string | null
          source_sheet: string
          target_profile: string
          tools: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          diagnostic_signals?: string[]
          duration_hours?: number | null
          family: string
          id: string
          is_foundation_module?: boolean
          level?: number | null
          name: string
          need_identification?: string | null
          paying?: boolean | null
          platform?: string | null
          source_sheet: string
          target_profile: string
          tools?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          diagnostic_signals?: string[]
          duration_hours?: number | null
          family?: string
          id?: string
          is_foundation_module?: boolean
          level?: number | null
          name?: string
          need_identification?: string | null
          paying?: boolean | null
          platform?: string | null
          source_sheet?: string
          target_profile?: string
          tools?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          diagnostic_id: string | null
          expected_participants: number | null
          id: string
          notes: string | null
          proposed_dates: string[]
          recommendation_id: string | null
          status: string
          updated_at: string
          validated_date: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          expected_participants?: number | null
          id?: string
          notes?: string | null
          proposed_dates?: string[]
          recommendation_id?: string | null
          status?: string
          updated_at?: string
          validated_date?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          expected_participants?: number | null
          id?: string
          notes?: string | null
          proposed_dates?: string[]
          recommendation_id?: string | null
          status?: string
          updated_at?: string
          validated_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_supports: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          diagnostic_id: string | null
          id: string
          model: string | null
          recommendation_id: string | null
          session_id: string
          source: string
          status: string
          support_json: Json
          title: string
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          id?: string
          model?: string | null
          recommendation_id?: string | null
          session_id: string
          source: string
          status?: string
          support_json: Json
          title: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string | null
          id?: string
          model?: string | null
          recommendation_id?: string | null
          session_id?: string
          source?: string
          status?: string
          support_json?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_supports_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_supports_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_supports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          diagnostic_id: string
          extracted_payload: Json | null
          id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          diagnostic_id: string
          extracted_payload?: Json | null
          id?: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          diagnostic_id?: string
          extracted_payload?: Json | null
          id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_client: { Args: { p_client_id: string }; Returns: boolean }
      can_access_diagnostic: {
        Args: { p_diagnostic_id: string }
        Returns: boolean
      }
      can_access_recommendation: {
        Args: { p_recommendation_id: string }
        Returns: boolean
      }
      can_access_session: { Args: { p_session_id: string }; Returns: boolean }
      can_user_access_diagnostic: {
        Args: { p_diagnostic_id: string; p_user_id: string }
        Returns: boolean
      }
      can_user_access_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      get_my_role: { Args: never; Returns: string }
      get_role_for_user: { Args: { p_user_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_admin_for_user: { Args: { p_user_id: string }; Returns: boolean }
      is_internal_user: { Args: never; Returns: boolean }
      is_internal_user_for_user: {
        Args: { p_user_id: string }
        Returns: boolean
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
