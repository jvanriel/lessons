import { describe, it, expect } from "vitest";
import {
  formatLocationFull,
  wazeUrl,
  googleMapsUrl,
} from "@/lib/location-display";

describe("formatLocationFull", () => {
  it("joins name + address + city", () => {
    expect(
      formatLocationFull({
        name: "Kempense Golf",
        address: "Balen-Neetweg 100, 2400 Mol",
        city: "Mol",
      }),
    ).toBe("Kempense Golf, Balen-Neetweg 100, 2400 Mol, Mol");
  });

  it("skips a missing address", () => {
    expect(
      formatLocationFull({ name: "Kempense Golf", address: null, city: "Mol" }),
    ).toBe("Kempense Golf, Mol");
  });

  it("skips a missing city", () => {
    expect(
      formatLocationFull({
        name: "Kempense Golf",
        address: "Balen-Neetweg 100",
        city: null,
      }),
    ).toBe("Kempense Golf, Balen-Neetweg 100");
  });

  it("trims whitespace inside fields", () => {
    expect(
      formatLocationFull({
        name: "  Kempense Golf  ",
        address: "  Balen-Neetweg 100  ",
        city: null,
      }),
    ).toBe("Kempense Golf, Balen-Neetweg 100");
  });

  it("returns just the name when both extras are missing", () => {
    expect(
      formatLocationFull({ name: "Test", address: null, city: null }),
    ).toBe("Test");
  });
});

describe("wazeUrl", () => {
  it("uses lat,lng when both are present", () => {
    expect(wazeUrl({ lat: "51.180", lng: "5.115", address: "irrelevant" })).toBe(
      "https://waze.com/ul?ll=51.180,5.115&navigate=yes",
    );
  });

  it("falls back to URL-encoded address when coords are missing", () => {
    expect(
      wazeUrl({ lat: null, lng: null, address: "Balen-Neetweg 100, Mol" }),
    ).toBe(
      "https://waze.com/ul?q=Balen-Neetweg%20100%2C%20Mol&navigate=yes",
    );
  });

  it("returns null when there's nothing to point at", () => {
    expect(wazeUrl({ lat: null, lng: null, address: null })).toBeNull();
    expect(wazeUrl({ lat: null, lng: null, address: "" })).toBeNull();
  });

  it("requires BOTH lat and lng — half-coordinate falls back to address", () => {
    expect(
      wazeUrl({ lat: "51.180", lng: null, address: "Balen-Neetweg 100" }),
    ).toBe("https://waze.com/ul?q=Balen-Neetweg%20100&navigate=yes");
  });
});

describe("googleMapsUrl", () => {
  it("uses lat,lng when both are present", () => {
    expect(
      googleMapsUrl({ lat: "51.180", lng: "5.115", address: "irrelevant" }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=51.180,5.115",
    );
  });

  it("falls back to URL-encoded address when coords are missing", () => {
    expect(
      googleMapsUrl({ lat: null, lng: null, address: "Balen-Neetweg 100, Mol" }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Balen-Neetweg%20100%2C%20Mol",
    );
  });

  it("returns null when there's nothing to point at", () => {
    expect(googleMapsUrl({ lat: null, lng: null, address: null })).toBeNull();
  });
});
