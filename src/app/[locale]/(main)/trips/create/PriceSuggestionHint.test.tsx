import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/app/[locale]/(main)/trips/actions", () => ({
  getSuggestedPriceRange: vi.fn(),
}));

import { PriceSuggestionHint } from "./PriceSuggestionHint";
import { getSuggestedPriceRange } from "@/app/[locale]/(main)/trips/actions";
import frTrips from "@/messages/fr/trips.json";
import frCommon from "@/messages/fr/common.json";

type SuggestProps = {
  originLabel: string;
  destinationLabel: string;
  enteredPrice: string | undefined;
};

function renderWith(props: SuggestProps) {
  return render(
    <NextIntlClientProvider locale="fr" messages={{ trips: frTrips, common: frCommon }}>
      <PriceSuggestionHint {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PriceSuggestionHint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows idle copy when origin or destination missing", () => {
    renderWith({ originLabel: "", destinationLabel: "", enteredPrice: "" });
    expect(screen.getByText(/Choisissez votre itinéraire/)).toBeInTheDocument();
  });

  it("calls getSuggestedPriceRange and renders the range on success", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 },
        source: "ors",
        distanceKm: 280,
        fuelCountry: "CH",
        chfPerKm: 0.0629,
      },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/17.50/)).toBeInTheDocument());
    expect(getSuggestedPriceRange).toHaveBeenCalledWith({
      originLabel: "Bern",
      destinationLabel: "Lyon",
    });
  });

  it("appends 'estimation' tag when source = haversine_fallback", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        range: { currency: "CHF", low: 11, typical: 12.5, high: 14.5 },
        source: "haversine_fallback",
        distanceKm: 280,
        fuelCountry: "CH",
        chfPerKm: 0.0453,
      },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/estimation/)).toBeInTheDocument());
  });

  it("renders 'Suggestion indisponible' when data is null", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: null,
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/indisponible/)).toBeInTheDocument());
  });

  it("renders 'Suggestion indisponible' when the Server Action returns an error", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { code: "errors.pricing.suggestion_failed" },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/indisponible/)).toBeInTheDocument());
  });

  it("shows the high-price warning when entered > 1.5× typical", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 },
        source: "ors",
        distanceKm: 280,
        fuelCountry: "CH",
        chfPerKm: 0.0629,
      },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "30" });
    await waitFor(() =>
      expect(screen.getByText(/transport commercial/)).toBeInTheDocument(),
    );
  });

  it("hides the high-price warning when entered <= 1.5× typical", async () => {
    (getSuggestedPriceRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 },
        source: "ors",
        distanceKm: 280,
        fuelCountry: "CH",
        chfPerKm: 0.0629,
      },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "20" });
    await waitFor(() => expect(screen.getByText(/17.50/)).toBeInTheDocument());
    expect(screen.queryByText(/transport commercial/)).not.toBeInTheDocument();
  });
});
