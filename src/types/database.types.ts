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
      bookings: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          passenger_id: string
          passenger_message: string | null
          seats_requested: number
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          passenger_id: string
          passenger_message?: string | null
          seats_requested?: number
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          passenger_id?: string
          passenger_message?: string | null
          seats_requested?: number
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          phone: string
          preferred_locale: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id: string
          phone: string
          preferred_locale?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          phone?: string
          preferred_locale?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          trip_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          trip_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          available_seats: number
          created_at: string
          deleted_at: string | null
          departure_at: string
          destination: Json
          driver_id: string
          id: string
          notes: string | null
          origin: Json
          price_per_seat: number | null
          status: string
          total_seats: number
          updated_at: string
          vehicle_description: string | null
        }
        Insert: {
          available_seats: number
          created_at?: string
          deleted_at?: string | null
          departure_at: string
          destination: Json
          driver_id: string
          id?: string
          notes?: string | null
          origin: Json
          price_per_seat?: number | null
          status?: string
          total_seats: number
          updated_at?: string
          vehicle_description?: string | null
        }
        Update: {
          available_seats?: number
          created_at?: string
          deleted_at?: string | null
          departure_at?: string
          destination?: Json
          driver_id?: string
          id?: string
          notes?: string | null
          origin?: Json
          price_per_seat?: number | null
          status?: string
          total_seats?: number
          updated_at?: string
          vehicle_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          driver_rating_avg: number | null
          driver_rating_count: number | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          driver_rating_avg?: never
          driver_rating_count?: never
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          driver_rating_avg?: never
          driver_rating_count?: never
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_review: {
        Args: { p_reviewee_id: string; p_trip_id: string }
        Returns: boolean
      }
      can_review_reason: {
        Args: { p_reviewee_id: string; p_trip_id: string }
        Returns: string
      }
      get_driver_review_details: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      get_passenger_review_summary: {
        Args: { p_passenger_id: string }
        Returns: Json
      }
      has_accepted_booking_with: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      has_booking_on_my_trip: {
        Args: { p_passenger_id: string }
        Returns: boolean
      }
      is_trip_driver: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_passenger: { Args: { p_trip_id: string }; Returns: boolean }
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

// ─────────────────────────────────────────────────────────────────────────────
// Project-specific narrowings (hand-maintained, not emitted by `gen types`).
// Postgres stores these as `text`/`jsonb`; the app treats them as literal
// unions / structured shapes. Re-append this block after every regeneration.
// ─────────────────────────────────────────────────────────────────────────────

export type TripStatus = "open" | "full" | "cancelled" | "completed"

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "trip_cancelled"

export type LocationJsonb = {
  label: string
  lat: number
  lng: number
  place_id?: string | null
}

export type TripRow = Omit<
  Database["public"]["Tables"]["trips"]["Row"],
  "status" | "origin" | "destination"
> & {
  status: TripStatus
  origin: LocationJsonb
  destination: LocationJsonb
}

export type BookingRow = Omit<
  Database["public"]["Tables"]["bookings"]["Row"],
  "status"
> & {
  status: BookingStatus
}

export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"]

// Shape returned by the RPCs get_passenger_review_summary /
// get_driver_review_details. `null` means "caller not authorised".
export type ReviewSummaryRaw = {
  avg: number
  count: number
  recent: Array<{
    id: string
    rating: number
    comment: string | null
    reviewer_full_name: string
    created_at: string
  }>
} | null

// Shape returned by the Server Actions (after pseudonymisation).
export type ReviewSummary = {
  avg: number
  count: number
  recent: Array<{
    id: string
    rating: number
    comment: string | null
    reviewerDisplayName: string
    createdAt: string
  }>
}
