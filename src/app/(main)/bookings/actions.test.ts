// src/app/(main)/bookings/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER, MOCK_PASSENGER } from "@/lib/test-utils/supabase-mock";
import { requestBooking, acceptBooking, cancelBooking, getWhatsAppLink } from "./actions";

vi.mock("@/lib/supabase/server");

const VALID_REQUEST_INPUT = {
  trip_id: "00000000-0000-0000-0000-000000000000",
  seats_requested: 1,
  passenger_message: "Bonjour, je voyage seul.",
};

const MOCK_BOOKING = {
  id: "booking-xyz-789",
  trip_id: VALID_REQUEST_INPUT.trip_id,
  passenger_id: MOCK_PASSENGER.id,
  seats_requested: 1,
  status: "pending",
  passenger_message: "Bonjour, je voyage seul.",
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("requestBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when passenger has no phone in profile", async () => {
    mockSingle.mockResolvedValueOnce({ data: { phone: null }, error: null });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("phone number");
  });

  it("returns error when trip does not exist", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Not found" } });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Trip not found.");
  });

  it("returns error when passenger tries to book their own trip", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_PASSENGER.id, available_seats: 3, status: "open" },
        error: null,
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("You cannot book your own trip.");
  });

  it("returns error when trip is full", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 0, status: "full" },
        error: null,
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("no longer accepting");
  });

  it("returns error when not enough seats for seats_requested", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 1, status: "open" },
        error: null,
      });

    const result = await requestBooking({ ...VALID_REQUEST_INPUT, seats_requested: 2 });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("seat(s) available");
  });

  it("creates booking and returns it on valid input", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 3, status: "open" },
        error: null,
      })
      .mockResolvedValueOnce({ data: MOCK_BOOKING, error: null });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(true);
    expect((result as { data: typeof MOCK_BOOKING }).data!.status).toBe("pending");
  });

  it("returns specific error when passenger already has an active booking", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 3, status: "open" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "unique constraint violation" },
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("already have an active booking");
  });
});

describe("acceptBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // acceptBooking is called by the DRIVER
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_USER });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when booking is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Booking not found.");
  });

  it("returns Unauthorized when caller is not the trip driver", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 1,
        trip: { driver_id: "another-driver-id", status: "open", available_seats: 3 },
      },
      error: null,
    });

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("returns error when booking is not in pending status", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 1,
        trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 2 },
      },
      error: null,
    });

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Only pending bookings can be accepted.");
  });

  it("returns error when not enough seats", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 3,
        trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 2 },
      },
      error: null,
    });

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Not enough seats available.");
  });

  it("accepts a valid pending booking", async () => {
    const updatedBooking = {
      id: "00000000-0000-0000-0000-000000000000",
      status: "accepted",
      passenger_id: MOCK_PASSENGER.id,
      seats_requested: 1,
    };

    mockSingle
      .mockResolvedValueOnce({
        data: {
          status: "pending",
          passenger_id: MOCK_PASSENGER.id,
          seats_requested: 1,
          trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 3 },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: updatedBooking, error: null });

    const result = await acceptBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
    expect((result as { data: typeof updatedBooking }).data!.status).toBe("accepted");
  });
});

describe("cancelBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // cancelBooking is called by the PASSENGER
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when booking is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Booking not found.");
  });

  it("returns Unauthorized when caller is not the passenger", async () => {
    mockSingle.mockResolvedValue({
      data: { passenger_id: "another-passenger-id", status: "pending" },
      error: null,
    });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("returns error when booking is in a non-cancellable status", async () => {
    mockSingle.mockResolvedValue({
      data: { passenger_id: MOCK_PASSENGER.id, status: "trip_cancelled" },
      error: null,
    });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("This booking cannot be cancelled.");
  });

  it("cancels a pending booking", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { passenger_id: MOCK_PASSENGER.id, status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
  });

  it("cancels an accepted booking (DB trigger returns seats)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { passenger_id: MOCK_PASSENGER.id, status: "accepted" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
  });
});

const BOOKING_ID = "00000000-0000-0000-0000-000000000000";

describe("getWhatsAppLink — security", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("🔒 returns error when booking status is 'pending' — not yet accepted", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe(
      "WhatsApp link is only available for accepted bookings."
    );
  });

  it("🔒 returns error when caller is neither the driver nor the passenger", async () => {
    const { mockClient, mockSingle: single } = buildSupabaseMock({
      user: { id: "random-user-000", email: "hacker@evil.com" },
    });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    mockSingle.mockResolvedValue({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("🔒 returns error when booking is 'declined' (not accepted)", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "declined",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe(
      "WhatsApp link is only available for accepted bookings."
    );
  });

  it("returns passenger link (to contact driver) when called as passenger", async () => {
    // 1st call: booking check
    mockSingle.mockResolvedValueOnce({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });
    // 2nd call: other party (driver) profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_USER.id, full_name: "Artan Doci", phone: "+41791234567" },
      error: null,
    });
    // 3rd call: own (passenger) profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_PASSENGER.id, full_name: "Blerina Kelmendi", phone: "+49151234567" },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(true);
    const data = (result as { data: { role: string; link_to_contact: string; other_party_name: string } }).data!;
    expect(data.role).toBe("passenger");
    expect(data.link_to_contact).toMatch(/wa\.me\/41791234567/);
    expect(data.other_party_name).toBe("Artan Doci");
    // Must NOT contain the passenger's own number
    expect(data.link_to_contact).not.toMatch(/49151234567/);
  });

  it("returns driver link (to contact passenger) when called as driver", async () => {
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_USER });
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    mockSingle.mockResolvedValueOnce({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });
    // Other party = passenger profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_PASSENGER.id, full_name: "Blerina Kelmendi", phone: "+49151234567" },
      error: null,
    });
    // Own = driver profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_USER.id, full_name: "Artan Doci", phone: "+41791234567" },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(true);
    const data = (result as { data: { role: string; link_to_contact: string; other_party_name: string } }).data!;
    expect(data.role).toBe("driver");
    expect(data.link_to_contact).toMatch(/wa\.me\/49151234567/);
    expect(data.other_party_name).toBe("Blerina Kelmendi");
  });

  it("returns error when booking is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Booking not found.");
  });
});
