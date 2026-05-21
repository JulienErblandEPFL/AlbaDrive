import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockReplace = vi.fn();
const mockSetLocale = vi.fn();
const mockUseLocale = vi.fn(() => "fr");

vi.mock("next-intl", async (orig) => {
  const actual = await orig<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => mockUseLocale(),
    // Stub: re-emit the key (with params, when present) so we can target buttons by name.
    useTranslations: () => (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}:${Object.values(params).join(",")}`;
      }
      return key;
    },
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("from=Geneve&to=Pristina"),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/trips/abc-123",
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/i18n/actions", () => ({
  setLocale: (...args: unknown[]) => mockSetLocale(...args),
}));

import { LocaleSwitcher } from "./LocaleSwitcher";

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocale.mockReturnValue("fr");
    mockSetLocale.mockResolvedValue({ success: true });
  });

  it("renders the trigger labelled with the current native language and shows the ISO code", () => {
    render(<LocaleSwitcher />);
    expect(
      screen.getByRole("button", { name: /trigger:Français/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("FR")).toBeInTheDocument();
  });

  it("opens the menu and lists all four locales by native name in diaspora-priority order", () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole("button"));

    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Français");
    expect(items[1]).toHaveTextContent("Deutsch");
    expect(items[2]).toHaveTextContent("Shqip");
    expect(items[3]).toHaveTextContent("English");
  });

  it("marks the current locale with aria-checked='true' (DE active)", () => {
    mockUseLocale.mockReturnValue("de");
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole("button"));

    const items = screen.getAllByRole("menuitemradio");
    const checked = items.find((el) => el.getAttribute("aria-checked") === "true");
    expect(checked?.textContent).toContain("Deutsch");
  });

  it("calls setLocale and router.replace preserving pathname + query when switching to a different locale", async () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /English/ }));

    await waitFor(() => {
      expect(mockSetLocale).toHaveBeenCalledWith({ locale: "en" });
      expect(mockReplace).toHaveBeenCalledWith(
        {
          pathname: "/trips/abc-123",
          query: { from: "Geneve", to: "Pristina" },
        },
        { locale: "en" },
      );
    });
  });

  it("does not navigate when clicking the active locale", async () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Français/ }));

    await new Promise((r) => setTimeout(r, 0));
    expect(mockSetLocale).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not navigate when setLocale rejects (defensive)", async () => {
    mockSetLocale.mockResolvedValueOnce({
      success: false,
      error: { code: "validation.locale.invalid" },
    });

    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /English/ }));

    await waitFor(() => {
      expect(mockSetLocale).toHaveBeenCalledWith({ locale: "en" });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
