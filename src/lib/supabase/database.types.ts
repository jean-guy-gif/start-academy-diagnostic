// Types Supabase alignés sur supabase/migrations/20260521120000_init_mvp1.sql.
//
// Format identique à la sortie de `supabase gen types typescript`, ce qui
// permettra de remplacer ce fichier sans changer les imports une fois que
// le projet Supabase sera connecté :
//
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
//
// En attendant la connexion, ces types sont écrits à la main et reflètent
// fidèlement la migration initiale.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "admin" | "commercial" | "trainer" | "client_viewer" | "participant";
          full_name: string | null;
          email: string | null;
          organization: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: "admin" | "commercial" | "trainer" | "client_viewer" | "participant";
          full_name?: string | null;
          email?: string | null;
          organization?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: "admin" | "commercial" | "trainer" | "client_viewer" | "participant";
          full_name?: string | null;
          email?: string | null;
          organization?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          company_name: string;
          sector: string | null;
          director: string | null;
          email: string | null;
          phone: string | null;
          collaborators_count: number | null;
          team_typology: string[];
          crm_used: string | null;
          ai_tools: string[];
          maturity_global: string | null;
          // Référentiel v1.0 — identité stable
          enseigne: string | null;
          siret: string | null;
          date_creation: string | null;
          adresse_principale: string | null;
          site_internet: string | null;
          nombre_agences: number | null;
          secteurs_geographiques: string[] | null;
          typologie_biens: string[] | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name: string;
          sector?: string | null;
          director?: string | null;
          email?: string | null;
          phone?: string | null;
          collaborators_count?: number | null;
          team_typology?: string[];
          crm_used?: string | null;
          ai_tools?: string[];
          maturity_global?: string | null;
          enseigne?: string | null;
          siret?: string | null;
          date_creation?: string | null;
          adresse_principale?: string | null;
          site_internet?: string | null;
          nombre_agences?: number | null;
          secteurs_geographiques?: string[] | null;
          typologie_biens?: string[] | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          sector?: string | null;
          director?: string | null;
          email?: string | null;
          phone?: string | null;
          collaborators_count?: number | null;
          team_typology?: string[];
          crm_used?: string | null;
          ai_tools?: string[];
          maturity_global?: string | null;
          enseigne?: string | null;
          siret?: string | null;
          date_creation?: string | null;
          adresse_principale?: string | null;
          site_internet?: string | null;
          nombre_agences?: number | null;
          secteurs_geographiques?: string[] | null;
          typologie_biens?: string[] | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "clients_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      training_modules: {
        Row: {
          id: string;
          name: string;
          family: string;
          source_sheet: "Conseiller" | "Manager" | "Assistantes";
          target_profile: "conseiller" | "manager" | "assistant" | "direction";
          duration_hours: number | null;
          level: number | null;
          tools: string | null;
          paying: boolean | null;
          platform: string | null;
          need_identification: string | null;
          is_foundation_module: boolean;
          diagnostic_signals: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          family: string;
          source_sheet: "Conseiller" | "Manager" | "Assistantes";
          target_profile: "conseiller" | "manager" | "assistant" | "direction";
          duration_hours?: number | null;
          level?: number | null;
          tools?: string | null;
          paying?: boolean | null;
          platform?: string | null;
          need_identification?: string | null;
          is_foundation_module?: boolean;
          diagnostic_signals?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          family?: string;
          source_sheet?: "Conseiller" | "Manager" | "Assistantes";
          target_profile?: "conseiller" | "manager" | "assistant" | "direction";
          duration_hours?: number | null;
          level?: number | null;
          tools?: string | null;
          paying?: boolean | null;
          platform?: string | null;
          need_identification?: string | null;
          is_foundation_module?: boolean;
          diagnostic_signals?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      module_rules: {
        Row: {
          id: string;
          name: string;
          trigger_signal: string;
          required_modules: string[];
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          trigger_signal: string;
          required_modules?: string[];
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          trigger_signal?: string;
          required_modules?: string[];
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      diagnostics: {
        Row: {
          id: string;
          client_id: string;
          commercial_id: string | null;
          meeting_date: string | null;
          mode: "guided" | "transcript" | "hybrid";
          status:
            | "draft"
            | "in_progress"
            | "transcript_uploaded"
            | "ai_analyzed"
            | "to_review"
            | "validated";
          declared_goal: string | null;
          profiles_in_scope: string[];
          expected_participants: number | null;
          notes: string | null;
          ai_synthesis: string | null;
          ai_confidence: number | null;
          // Référentiel v1.0 — Ch. 2.1 effectifs granulaires
          nb_salaries: number | null;
          nb_agents_indep: number | null;
          nb_assistants: number | null;
          nb_managers: number | null;
          nb_dirigeants: number | null;
          // Référentiel v1.0 — Ch. 1 photo temporelle
          ventes_n_moins_1: number | null;
          ca_global_n_moins_1: number | null;
          objectif_ca_annee_en_cours: number | null;
          ambition_3_ans: string | null;
          activite_repartition: Json | null;
          // Référentiel v1.0 — Ch. 2.4 historique formation entreprise
          formations_24m_count: number | null;
          formations_24m_hours: number | null;
          formations_24m_organizations: string[] | null;
          formations_24m_topics: string[] | null;
          formations_24m_satisfaction: number | null;
          agefice_used_before: "oui" | "non" | "ne_sait_pas" | null;
          opco_used_before: "oui" | "non" | "ne_sait_pas" | null;
          knows_current_rights: boolean | null;
          past_refusals: boolean | null;
          past_refusals_reason: string | null;
          internal_training_budget: boolean | null;
          internal_training_budget_amount: number | null;
          // Référentiel v1.0 — Étape 5 · snapshots ratios & alertes
          ratios_snapshot: Json | null;
          alerts_snapshot: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          commercial_id?: string | null;
          meeting_date?: string | null;
          mode?: "guided" | "transcript" | "hybrid";
          status?:
            | "draft"
            | "in_progress"
            | "transcript_uploaded"
            | "ai_analyzed"
            | "to_review"
            | "validated";
          declared_goal?: string | null;
          profiles_in_scope?: string[];
          expected_participants?: number | null;
          notes?: string | null;
          ai_synthesis?: string | null;
          ai_confidence?: number | null;
          nb_salaries?: number | null;
          nb_agents_indep?: number | null;
          nb_assistants?: number | null;
          nb_managers?: number | null;
          nb_dirigeants?: number | null;
          ventes_n_moins_1?: number | null;
          ca_global_n_moins_1?: number | null;
          objectif_ca_annee_en_cours?: number | null;
          ambition_3_ans?: string | null;
          activite_repartition?: Json | null;
          formations_24m_count?: number | null;
          formations_24m_hours?: number | null;
          formations_24m_organizations?: string[] | null;
          formations_24m_topics?: string[] | null;
          formations_24m_satisfaction?: number | null;
          agefice_used_before?: "oui" | "non" | "ne_sait_pas" | null;
          opco_used_before?: "oui" | "non" | "ne_sait_pas" | null;
          knows_current_rights?: boolean | null;
          past_refusals?: boolean | null;
          past_refusals_reason?: string | null;
          internal_training_budget?: boolean | null;
          internal_training_budget_amount?: number | null;
          ratios_snapshot?: Json | null;
          alerts_snapshot?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          commercial_id?: string | null;
          meeting_date?: string | null;
          mode?: "guided" | "transcript" | "hybrid";
          status?:
            | "draft"
            | "in_progress"
            | "transcript_uploaded"
            | "ai_analyzed"
            | "to_review"
            | "validated";
          declared_goal?: string | null;
          profiles_in_scope?: string[];
          expected_participants?: number | null;
          notes?: string | null;
          ai_synthesis?: string | null;
          ai_confidence?: number | null;
          nb_salaries?: number | null;
          nb_agents_indep?: number | null;
          nb_assistants?: number | null;
          nb_managers?: number | null;
          nb_dirigeants?: number | null;
          ventes_n_moins_1?: number | null;
          ca_global_n_moins_1?: number | null;
          objectif_ca_annee_en_cours?: number | null;
          ambition_3_ans?: string | null;
          activite_repartition?: Json | null;
          formations_24m_count?: number | null;
          formations_24m_hours?: number | null;
          formations_24m_organizations?: string[] | null;
          formations_24m_topics?: string[] | null;
          formations_24m_satisfaction?: number | null;
          agefice_used_before?: "oui" | "non" | "ne_sait_pas" | null;
          opco_used_before?: "oui" | "non" | "ne_sait_pas" | null;
          knows_current_rights?: boolean | null;
          past_refusals?: boolean | null;
          past_refusals_reason?: string | null;
          internal_training_budget?: boolean | null;
          internal_training_budget_amount?: number | null;
          ratios_snapshot?: Json | null;
          alerts_snapshot?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "diagnostics_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "diagnostics_commercial_id_fkey"; columns: ["commercial_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "diagnostics_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      diagnostic_answers: {
        Row: {
          id: string;
          diagnostic_id: string;
          question_id: string;
          question_text: string | null;
          category:
            | "tool_maturity"
            | "commercial_performance"
            | "business_skill"
            | "execution"
            | "identity"
            | "team"
            | "funding"
            | "prospecting"
            | "seller_meeting"
            | "mandates"
            | "commercial_followup"
            | "buyers"
            | "visits_offers"
            | "db_reputation"
            | "tools_ai"
            | "management"
            | null;
          answer: string | null;
          note: string | null;
          is_weak_signal: boolean;
          is_skipped: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          diagnostic_id: string;
          question_id: string;
          question_text?: string | null;
          category?:
            | "tool_maturity"
            | "commercial_performance"
            | "business_skill"
            | "execution"
            | "identity"
            | "team"
            | "funding"
            | "prospecting"
            | "seller_meeting"
            | "mandates"
            | "commercial_followup"
            | "buyers"
            | "visits_offers"
            | "db_reputation"
            | "tools_ai"
            | "management"
            | null;
          answer?: string | null;
          note?: string | null;
          is_weak_signal?: boolean;
          is_skipped?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          diagnostic_id?: string;
          question_id?: string;
          question_text?: string | null;
          category?:
            | "tool_maturity"
            | "commercial_performance"
            | "business_skill"
            | "execution"
            | "identity"
            | "team"
            | "funding"
            | "prospecting"
            | "seller_meeting"
            | "mandates"
            | "commercial_followup"
            | "buyers"
            | "visits_offers"
            | "db_reputation"
            | "tools_ai"
            | "management"
            | null;
          answer?: string | null;
          note?: string | null;
          is_weak_signal?: boolean;
          is_skipped?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "diagnostic_answers_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
        ];
      };
      transcripts: {
        Row: {
          id: string;
          diagnostic_id: string;
          content: string;
          source: string | null;
          extracted_payload: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          diagnostic_id: string;
          content: string;
          source?: string | null;
          extracted_payload?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          diagnostic_id?: string;
          content?: string;
          source?: string | null;
          extracted_payload?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "transcripts_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "transcripts_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      recommendations: {
        Row: {
          id: string;
          diagnostic_id: string;
          status:
            | "not_generated"
            | "generated"
            | "to_review"
            | "sent"
            | "opened"
            | "accepted"
            | "refused"
            | "to_rework";
          client_summary: string | null;
          detected_needs: Json;
          performance_issues: Json;
          tool_maturity: "low" | "medium" | "high" | null;
          skill_level: "beginner" | "intermediate" | "advanced" | "mixed" | null;
          required_foundations: Json;
          total_duration_hours: number | null;
          cost_per_participant: number | null;
          confidence_score: number | null;
          missing_information: Json;
          commercial_explanation: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          diagnostic_id: string;
          status?:
            | "not_generated"
            | "generated"
            | "to_review"
            | "sent"
            | "opened"
            | "accepted"
            | "refused"
            | "to_rework";
          client_summary?: string | null;
          detected_needs?: Json;
          performance_issues?: Json;
          tool_maturity?: "low" | "medium" | "high" | null;
          skill_level?: "beginner" | "intermediate" | "advanced" | "mixed" | null;
          required_foundations?: Json;
          total_duration_hours?: number | null;
          cost_per_participant?: number | null;
          confidence_score?: number | null;
          missing_information?: Json;
          commercial_explanation?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          diagnostic_id?: string;
          status?:
            | "not_generated"
            | "generated"
            | "to_review"
            | "sent"
            | "opened"
            | "accepted"
            | "refused"
            | "to_rework";
          client_summary?: string | null;
          detected_needs?: Json;
          performance_issues?: Json;
          tool_maturity?: "low" | "medium" | "high" | null;
          skill_level?: "beginner" | "intermediate" | "advanced" | "mixed" | null;
          required_foundations?: Json;
          total_duration_hours?: number | null;
          cost_per_participant?: number | null;
          confidence_score?: number | null;
          missing_information?: Json;
          commercial_explanation?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "recommendations_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "recommendations_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      recommendation_modules: {
        Row: {
          id: string;
          recommendation_id: string;
          module_id: string;
          position: number;
          reason: string | null;
          duration_hours: number | null;
          business_ratio_targeted: string | null;
          use_cases: Json;
          priority_tier: "essential" | "recommended" | "optional" | "later" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recommendation_id: string;
          module_id: string;
          position?: number;
          reason?: string | null;
          duration_hours?: number | null;
          business_ratio_targeted?: string | null;
          use_cases?: Json;
          priority_tier?: "essential" | "recommended" | "optional" | "later" | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recommendation_id?: string;
          module_id?: string;
          position?: number;
          reason?: string | null;
          duration_hours?: number | null;
          business_ratio_targeted?: string | null;
          use_cases?: Json;
          priority_tier?: "essential" | "recommended" | "optional" | "later" | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "recommendation_modules_recommendation_id_fkey"; columns: ["recommendation_id"]; referencedRelation: "recommendations"; referencedColumns: ["id"] },
          { foreignKeyName: "recommendation_modules_module_id_fkey"; columns: ["module_id"]; referencedRelation: "training_modules"; referencedColumns: ["id"] },
        ];
      };
      funding_config: {
        Row: {
          id: string;
          key: string;
          value_numeric: number | null;
          value_text: string | null;
          valid_from: string;
          valid_to: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value_numeric?: number | null;
          value_text?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value_numeric?: number | null;
          value_text?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "funding_config_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      diagnostic_participants: {
        Row: {
          id: string;
          diagnostic_id: string;
          first_name: string | null;
          professional_status:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          previous_year_production: number | null;
          funding_eligibility:
            | "potentially_eligible"
            | "not_eligible"
            | "unknown";
          estimated_funding_amount: number | null;
          estimated_remaining_cost: number | null;
          notes: string | null;
          // Référentiel v1.0 — commun aux 2 statuts
          last_name: string | null;
          entry_date: string | null;
          // Champs agent indépendant
          expert_level: "debutant" | "confirme" | "expert" | null;
          ca_annee_en_cours: number | null;
          wants_evolution: boolean | null;
          wants_training: boolean | null;
          priority_need: string | null;
          // Champs salarié
          job_title: string | null;
          contract_type: "temps_plein" | "temps_partiel" | null;
          convention_collective: string | null;
          eligible_opco: boolean | null;
          // Historique formation 24 mois individuel
          formations_24m_count: number | null;
          formations_24m_hours: number | null;
          formations_24m_amount: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          diagnostic_id: string;
          first_name?: string | null;
          professional_status?:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          previous_year_production?: number | null;
          funding_eligibility?:
            | "potentially_eligible"
            | "not_eligible"
            | "unknown";
          estimated_funding_amount?: number | null;
          estimated_remaining_cost?: number | null;
          notes?: string | null;
          last_name?: string | null;
          entry_date?: string | null;
          expert_level?: "debutant" | "confirme" | "expert" | null;
          ca_annee_en_cours?: number | null;
          wants_evolution?: boolean | null;
          wants_training?: boolean | null;
          priority_need?: string | null;
          job_title?: string | null;
          contract_type?: "temps_plein" | "temps_partiel" | null;
          convention_collective?: string | null;
          eligible_opco?: boolean | null;
          formations_24m_count?: number | null;
          formations_24m_hours?: number | null;
          formations_24m_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          diagnostic_id?: string;
          first_name?: string | null;
          professional_status?:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          previous_year_production?: number | null;
          funding_eligibility?:
            | "potentially_eligible"
            | "not_eligible"
            | "unknown";
          estimated_funding_amount?: number | null;
          estimated_remaining_cost?: number | null;
          notes?: string | null;
          last_name?: string | null;
          entry_date?: string | null;
          expert_level?: "debutant" | "confirme" | "expert" | null;
          ca_annee_en_cours?: number | null;
          wants_evolution?: boolean | null;
          wants_training?: boolean | null;
          priority_need?: string | null;
          job_title?: string | null;
          contract_type?: "temps_plein" | "temps_partiel" | null;
          convention_collective?: string | null;
          eligible_opco?: boolean | null;
          formations_24m_count?: number | null;
          formations_24m_hours?: number | null;
          formations_24m_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "diagnostic_participants_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
        ];
      };
      training_sessions: {
        Row: {
          id: string;
          client_id: string;
          diagnostic_id: string | null;
          recommendation_id: string | null;
          status:
            | "created"
            | "awaiting_client_validation"
            | "dates_to_position"
            | "dates_validated"
            | "collection_open"
            | "data_collected"
            | "support_generating"
            | "support_ready"
            | "delivered"
            | "report_sent";
          proposed_dates: string[];
          validated_date: string | null;
          expected_participants: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          status?:
            | "created"
            | "awaiting_client_validation"
            | "dates_to_position"
            | "dates_validated"
            | "collection_open"
            | "data_collected"
            | "support_generating"
            | "support_ready"
            | "delivered"
            | "report_sent";
          proposed_dates?: string[];
          validated_date?: string | null;
          expected_participants?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          status?:
            | "created"
            | "awaiting_client_validation"
            | "dates_to_position"
            | "dates_validated"
            | "collection_open"
            | "data_collected"
            | "support_generating"
            | "support_ready"
            | "delivered"
            | "report_sent";
          proposed_dates?: string[];
          validated_date?: string | null;
          expected_participants?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "training_sessions_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
          { foreignKeyName: "training_sessions_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "training_sessions_recommendation_id_fkey"; columns: ["recommendation_id"]; referencedRelation: "recommendations"; referencedColumns: ["id"] },
          { foreignKeyName: "training_sessions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      session_participants: {
        Row: {
          id: string;
          session_id: string;
          first_name: string;
          last_name: string;
          role: string | null;
          email: string;
          estimated_level: string | null;
          personal_goal: string | null;
          main_problem: string | null;
          tools_used: Json;
          concrete_case: string | null;
          last_diploma: string | null;
          real_estate_experience_years: string | null;
          professional_status:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          first_name: string;
          last_name: string;
          role?: string | null;
          email: string;
          estimated_level?: string | null;
          personal_goal?: string | null;
          main_problem?: string | null;
          tools_used?: Json;
          concrete_case?: string | null;
          last_diploma?: string | null;
          real_estate_experience_years?: string | null;
          professional_status?:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          first_name?: string;
          last_name?: string;
          role?: string | null;
          email?: string;
          estimated_level?: string | null;
          personal_goal?: string | null;
          main_problem?: string | null;
          tools_used?: Json;
          concrete_case?: string | null;
          last_diploma?: string | null;
          real_estate_experience_years?: string | null;
          professional_status?:
            | "salarie"
            | "agent_commercial_independant"
            | "autre"
            | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "session_participants_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
        ];
      };
      session_documents: {
        Row: {
          id: string;
          session_id: string;
          participant_id: string | null;
          file_name: string;
          file_type: string | null;
          file_size: number | null;
          storage_path: string;
          document_category: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          participant_id?: string | null;
          file_name: string;
          file_type?: string | null;
          file_size?: number | null;
          storage_path: string;
          document_category?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          participant_id?: string | null;
          file_name?: string;
          file_type?: string | null;
          file_size?: number | null;
          storage_path?: string;
          document_category?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "session_documents_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "session_documents_participant_id_fkey"; columns: ["participant_id"]; referencedRelation: "session_participants"; referencedColumns: ["id"] },
        ];
      };
      training_supports: {
        Row: {
          id: string;
          session_id: string;
          diagnostic_id: string | null;
          recommendation_id: string | null;
          title: string;
          support_json: Json;
          source: "openrouter" | "heuristic" | "llm";
          model: string | null;
          confidence_score: number | null;
          status: "draft" | "validated" | "archived";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          title: string;
          support_json: Json;
          source: "openrouter" | "heuristic" | "llm";
          model?: string | null;
          confidence_score?: number | null;
          status?: "draft" | "validated" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          title?: string;
          support_json?: Json;
          source?: "openrouter" | "heuristic" | "llm";
          model?: string | null;
          confidence_score?: number | null;
          status?: "draft" | "validated" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "training_supports_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "training_supports_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "training_supports_recommendation_id_fkey"; columns: ["recommendation_id"]; referencedRelation: "recommendations"; referencedColumns: ["id"] },
          { foreignKeyName: "training_supports_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      designed_training_supports: {
        Row: {
          id: string;
          session_id: string;
          training_support_id: string | null;
          title: string;
          subtitle: string | null;
          visual_intent: string | null;
          designed_json: Json;
          source: "openrouter" | "heuristic" | "llm";
          model: string | null;
          confidence_score: number | null;
          status: "draft" | "validated" | "archived";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          training_support_id?: string | null;
          title: string;
          subtitle?: string | null;
          visual_intent?: string | null;
          designed_json: Json;
          source: "openrouter" | "heuristic" | "llm";
          model?: string | null;
          confidence_score?: number | null;
          status?: "draft" | "validated" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          training_support_id?: string | null;
          title?: string;
          subtitle?: string | null;
          visual_intent?: string | null;
          designed_json?: Json;
          source?: "openrouter" | "heuristic" | "llm";
          model?: string | null;
          confidence_score?: number | null;
          status?: "draft" | "validated" | "archived";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "designed_training_supports_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "designed_training_supports_training_support_id_fkey"; columns: ["training_support_id"]; referencedRelation: "training_supports"; referencedColumns: ["id"] },
          { foreignKeyName: "designed_training_supports_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      public_access_tokens: {
        Row: {
          id: string;
          token_hash: string;
          session_id: string;
          access_type:
            | "client_session_view"
            | "participant_collect"
            | "trainer_session_view";
          recipient_email: string | null;
          recipient_name: string | null;
          expires_at: string | null;
          max_uses: number | null;
          used_count: number;
          is_active: boolean;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          token_hash: string;
          session_id: string;
          access_type:
            | "client_session_view"
            | "participant_collect"
            | "trainer_session_view";
          recipient_email?: string | null;
          recipient_name?: string | null;
          expires_at?: string | null;
          max_uses?: number | null;
          used_count?: number;
          is_active?: boolean;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          token_hash?: string;
          session_id?: string;
          access_type?:
            | "client_session_view"
            | "participant_collect"
            | "trainer_session_view";
          recipient_email?: string | null;
          recipient_name?: string | null;
          expires_at?: string | null;
          max_uses?: number | null;
          used_count?: number;
          is_active?: boolean;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "public_access_tokens_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
        ];
      };
      session_date_options: {
        Row: {
          id: string;
          session_id: string;
          title: string | null;
          start_at: string;
          end_at: string;
          location: string | null;
          format: "presentiel" | "visio" | "hybride" | null;
          status: "proposed" | "selected" | "rejected" | "cancelled";
          selected_by_email: string | null;
          selected_at: string | null;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          title?: string | null;
          start_at: string;
          end_at: string;
          location?: string | null;
          format?: "presentiel" | "visio" | "hybride" | null;
          status?: "proposed" | "selected" | "rejected" | "cancelled";
          selected_by_email?: string | null;
          selected_at?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          title?: string | null;
          start_at?: string;
          end_at?: string;
          location?: string | null;
          format?: "presentiel" | "visio" | "hybride" | null;
          status?: "proposed" | "selected" | "rejected" | "cancelled";
          selected_by_email?: string | null;
          selected_at?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "session_date_options_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
        ];
      };
      support_quality_reviews: {
        Row: {
          id: string;
          session_id: string;
          training_support_id: string | null;
          designed_support_id: string | null;
          reviewer_id: string | null;
          reviewer_name: string | null;
          status: "draft" | "needs_revision" | "validated" | "rejected";
          score_total: number | null;
          score_max: number | null;
          score_percent: number | null;
          checklist: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          training_support_id?: string | null;
          designed_support_id?: string | null;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          status?: "draft" | "needs_revision" | "validated" | "rejected";
          score_total?: number | null;
          score_max?: number | null;
          score_percent?: number | null;
          checklist?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          training_support_id?: string | null;
          designed_support_id?: string | null;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          status?: "draft" | "needs_revision" | "validated" | "rejected";
          score_total?: number | null;
          score_max?: number | null;
          score_percent?: number | null;
          checklist?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "support_quality_reviews_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "support_quality_reviews_training_support_id_fkey"; columns: ["training_support_id"]; referencedRelation: "training_supports"; referencedColumns: ["id"] },
          { foreignKeyName: "support_quality_reviews_designed_support_id_fkey"; columns: ["designed_support_id"]; referencedRelation: "designed_training_supports"; referencedColumns: ["id"] },
        ];
      };
      post_training_reviews: {
        Row: {
          id: string;
          session_id: string;
          reviewer_id: string | null;
          reviewer_name: string | null;
          review_type:
            | "trainer"
            | "director"
            | "participant_summary"
            | "internal";
          status: "draft" | "completed" | "archived";
          satisfaction_score: number | null;
          perceived_value_score: number | null;
          content_relevance_score: number | null;
          actionability_score: number | null;
          key_successes: Json;
          key_blockers: Json;
          follow_up_actions: Json;
          trainer_notes: string | null;
          director_feedback: string | null;
          participant_feedback_summary: string | null;
          next_commercial_opportunity: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          review_type:
            | "trainer"
            | "director"
            | "participant_summary"
            | "internal";
          status?: "draft" | "completed" | "archived";
          satisfaction_score?: number | null;
          perceived_value_score?: number | null;
          content_relevance_score?: number | null;
          actionability_score?: number | null;
          key_successes?: Json;
          key_blockers?: Json;
          follow_up_actions?: Json;
          trainer_notes?: string | null;
          director_feedback?: string | null;
          participant_feedback_summary?: string | null;
          next_commercial_opportunity?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          review_type?:
            | "trainer"
            | "director"
            | "participant_summary"
            | "internal";
          status?: "draft" | "completed" | "archived";
          satisfaction_score?: number | null;
          perceived_value_score?: number | null;
          content_relevance_score?: number | null;
          actionability_score?: number | null;
          key_successes?: Json;
          key_blockers?: Json;
          follow_up_actions?: Json;
          trainer_notes?: string | null;
          director_feedback?: string | null;
          participant_feedback_summary?: string | null;
          next_commercial_opportunity?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "post_training_reviews_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          session_id: string | null;
          diagnostic_id: string | null;
          client_id: string | null;
          actor_id: string | null;
          actor_name: string | null;
          actor_role: string | null;
          event_type: string;
          event_label: string;
          event_description: string | null;
          entity_type: string | null;
          entity_id: string | null;
          severity: "info" | "success" | "warning" | "error";
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          diagnostic_id?: string | null;
          client_id?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: string | null;
          event_type: string;
          event_label: string;
          event_description?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          severity?: "info" | "success" | "warning" | "error";
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          diagnostic_id?: string | null;
          client_id?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: string | null;
          event_type?: string;
          event_label?: string;
          event_description?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          severity?: "info" | "success" | "warning" | "error";
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "activity_logs_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "activity_logs_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "activity_logs_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] },
        ];
      };
      ai_generation_logs: {
        Row: {
          id: string;
          diagnostic_id: string | null;
          recommendation_id: string | null;
          session_id: string | null;
          provider: string;
          model: string | null;
          purpose: string | null;
          route: string | null;
          source: "llm" | "heuristic" | null;
          prompt: Json | null;
          response: Json | null;
          duration_ms: number | null;
          tokens_input: number | null;
          tokens_output: number | null;
          total_tokens: number | null;
          cost_estimate: number | null;
          status: "success" | "error" | "partial" | "fallback" | "rate_limited";
          error: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          session_id?: string | null;
          provider: string;
          model?: string | null;
          purpose?: string | null;
          route?: string | null;
          source?: "llm" | "heuristic" | null;
          prompt?: Json | null;
          response?: Json | null;
          duration_ms?: number | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          total_tokens?: number | null;
          cost_estimate?: number | null;
          status?: "success" | "error" | "partial" | "fallback" | "rate_limited";
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          diagnostic_id?: string | null;
          recommendation_id?: string | null;
          session_id?: string | null;
          provider?: string;
          model?: string | null;
          purpose?: string | null;
          route?: string | null;
          source?: "llm" | "heuristic" | null;
          prompt?: Json | null;
          response?: Json | null;
          duration_ms?: number | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          total_tokens?: number | null;
          cost_estimate?: number | null;
          status?: "success" | "error" | "partial" | "fallback" | "rate_limited";
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "ai_generation_logs_diagnostic_id_fkey"; columns: ["diagnostic_id"]; referencedRelation: "diagnostics"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_generation_logs_recommendation_id_fkey"; columns: ["recommendation_id"]; referencedRelation: "recommendations"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_generation_logs_session_id_fkey"; columns: ["session_id"]; referencedRelation: "training_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_generation_logs_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      can_user_access_session: {
        Args: { p_user_id: string; p_session_id: string };
        Returns: boolean;
      };
      can_user_access_diagnostic: {
        Args: { p_user_id: string; p_diagnostic_id: string };
        Returns: boolean;
      };
      is_admin_for_user: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      is_internal_user_for_user: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      get_role_for_user: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Helpers ergonomiques pour la suite (clients, repositories, etc.).
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
