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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          next_seq: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          next_seq?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          next_seq?: number
          user_id?: string
        }
        Relationships: []
      }
      expense_history: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          expense_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          expense_id: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          expense_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_history_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_ht: number | null
          category_id: string | null
          chf_amount: number | null
          comment: string | null
          company_id: string
          created_at: string
          currency: string
          description: string | null
          expense_date: string | null
          exported_at: string | null
          id: string
          missing_fields: string[]
          modified_after_export: boolean
          payment_method: string
          personal_advance: boolean
          ref: string | null
          seq: number | null
          status: string
          supplier: string | null
          total_ttc: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ht?: number | null
          category_id?: string | null
          chf_amount?: number | null
          comment?: string | null
          company_id: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string | null
          exported_at?: string | null
          id?: string
          missing_fields?: string[]
          modified_after_export?: boolean
          payment_method?: string
          personal_advance?: boolean
          ref?: string | null
          seq?: number | null
          status?: string
          supplier?: string | null
          total_ttc?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_ht?: number | null
          category_id?: string | null
          chf_amount?: number | null
          comment?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string | null
          exported_at?: string | null
          id?: string
          missing_fields?: string[]
          modified_after_export?: boolean
          payment_method?: string
          personal_advance?: boolean
          ref?: string | null
          seq?: number | null
          status?: string
          supplier?: string | null
          total_ttc?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          company_id: string
          created_at: string
          expense_count: number
          filename: string
          id: string
          label: string
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expense_count: number
          filename: string
          id?: string
          label: string
          period_end: string
          period_start: string
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expense_count?: number
          filename?: string
          id?: string
          label?: string
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      period_status: {
        Row: {
          company_id: string
          month: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          month: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          company_id?: string
          month?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          company_id: string
          created_at: string
          expense_id: string
          filename: string
          id: string
          mime: string
          path: string
          sha256: string
          size_bytes: number
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expense_id: string
          filename: string
          id?: string
          mime: string
          path: string
          sha256: string
          size_bytes: number
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expense_id?: string
          filename?: string
          id?: string
          mime?: string
          path?: string
          sha256?: string
          size_bytes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_lines: {
        Row: {
          amount: number | null
          created_at: string
          expense_id: string
          id: string
          rate: number | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          expense_id: string
          id?: string
          rate?: number | null
          user_id?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          expense_id?: string
          id?: string
          rate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_lines_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
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
    Enums: {},
  },
} as const
