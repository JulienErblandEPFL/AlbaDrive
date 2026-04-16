/**
 * Database types for AlbaDrive — Supabase / PostgreSQL
 *
 * IMPORTANT: This file was written manually for initial development.
 * Regenerate after every migration with:
 *   supabase gen types typescript --linked > types/database.types.ts
 *
 * Never write DB column types by hand after the project is linked.
 * Always use: Database["public"]["Tables"]["<table>"]["Row"]
 */

// ============================================================
// DOMAIN ENUMS
// ============================================================

export type TripStatus = "open" | "full" | "cancelled" | "completed";

export type BookingStatus =
  | "pending"       // Awaiting driver response
  | "accepted"      // Driver accepted — WhatsApp link unlocked for both parties
  | "declined"      // Driver declined (or auto-declined when trip became full)
  | "cancelled"     // Passenger cancelled their own booking
  | "trip_cancelled"; // Driver cancelled the trip (set by DB trigger)

// ============================================================
// JSONB TYPES
// ============================================================

/**
 * Geocoded location from Nominatim OSM.
 * Stored as JSONB in trips.origin and trips.destination.
 * Validated at application level before insertion.
 */
export interface LocationJsonb {
  /** Human-readable label, e.g. "Genève, Suisse" */
  label: string;
  /** Latitude (WGS84) */
  lat: number;
  /** Longitude (WGS84) */
  lng: number;
  /** Nominatim place_id for deduplication, e.g. "node/123456" */
  place_id?: string;
}

// ============================================================
// DATABASE SCHEMA
// ============================================================

export interface Database {
  public: {
    Tables: {
      // ----------------------------------------------------------
      // profiles — extends auth.users
      // ----------------------------------------------------------
      profiles: {
        Row: {
          id: string;          // UUID — matches auth.users.id
          full_name: string;
          phone: string;       // E.164 format, e.g. "+41791234567"
          avatar_url: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone: string;
          avatar_url?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string;
          avatar_url?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
      };

      // ----------------------------------------------------------
      // trips — driver-published trips
      // ----------------------------------------------------------
      trips: {
        Row: {
          id: string;
          driver_id: string;
          origin: LocationJsonb;
          destination: LocationJsonb;
          departure_at: string;      // ISO 8601 timestamptz
          total_seats: number;
          available_seats: number;
          price_per_seat: number | null;
          vehicle_description: string | null;
          notes: string | null;
          status: TripStatus;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          origin: LocationJsonb;
          destination: LocationJsonb;
          departure_at: string;
          total_seats: number;
          available_seats: number;
          price_per_seat?: number | null;
          vehicle_description?: string | null;
          notes?: string | null;
          status?: TripStatus;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          origin?: LocationJsonb;
          destination?: LocationJsonb;
          departure_at?: string;
          total_seats?: number;
          available_seats?: number;
          price_per_seat?: number | null;
          vehicle_description?: string | null;
          notes?: string | null;
          status?: TripStatus;
          deleted_at?: string | null;
          updated_at?: string;
        };
      };

      // ----------------------------------------------------------
      // bookings — passenger seat requests
      // ----------------------------------------------------------
      bookings: {
        Row: {
          id: string;
          trip_id: string;
          passenger_id: string;
          seats_requested: number;
          status: BookingStatus;
          passenger_message: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          passenger_id: string;
          seats_requested?: number;
          status?: BookingStatus;
          passenger_message?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          seats_requested?: number;
          status?: BookingStatus;
          passenger_message?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
      };
    };

    Views: {
      // ----------------------------------------------------------
      // profiles_public — safe for trip listings, no phone column
      // ----------------------------------------------------------
      profiles_public: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
        };
      };
    };

    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ============================================================
// CONVENIENCE ROW TYPES
// Use these instead of inline Database["public"]["Tables"]... access
// ============================================================

export type ProfileRow       = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert    = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate    = Database["public"]["Tables"]["profiles"]["Update"];

export type TripRow          = Database["public"]["Tables"]["trips"]["Row"];
export type TripInsert       = Database["public"]["Tables"]["trips"]["Insert"];
export type TripUpdate       = Database["public"]["Tables"]["trips"]["Update"];

export type BookingRow       = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingInsert    = Database["public"]["Tables"]["bookings"]["Insert"];
export type BookingUpdate    = Database["public"]["Tables"]["bookings"]["Update"];

export type ProfilePublicRow = Database["public"]["Views"]["profiles_public"]["Row"];

// ============================================================
// COMPOSITE TYPES — common joins used in Server Components
// ============================================================

/** Trip with the driver's public profile (no phone). Used in trip listings. */
export type TripWithDriver = TripRow & {
  driver: ProfilePublicRow;
};

/**
 * Booking with public trip info + passenger's public info.
 * Used in the driver's booking management view.
 */
export type BookingWithPassenger = BookingRow & {
  passenger: ProfilePublicRow;
  trip: Pick<TripRow, "id" | "origin" | "destination" | "departure_at" | "status">;
};

/**
 * Booking with trip + driver's public info.
 * Used in the passenger's booking history view.
 */
export type BookingWithTrip = BookingRow & {
  trip: TripWithDriver;
};

/**
 * Full profile of the other party in an ACCEPTED booking.
 * Includes phone — only accessible via the RLS-gated Server Action
 * `getWhatsAppLink()`. Never store in client state.
 */
export type AcceptedBookingPartyProfile = ProfileRow;
