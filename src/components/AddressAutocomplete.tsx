"use client";

/**
 * Address-autocomplete input backed by Google Places. When
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the pro starts typing
 * and gets real Belgian addresses suggested — picking one fills
 * the parent's `city` + `country` fields and submits already-
 * validated coordinates downstream. This eliminates the fake-
 * address class of bug at the input stage instead of catching it
 * after save (task 142 round 2).
 *
 * Without the key it degrades to a plain `<input>` — keeps every
 * environment (local dev, preview, prod) working even before the
 * key is provisioned.
 */

import { useEffect, useRef, useState } from "react";

interface AddressAutocompleteProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  /**
   * Notified with the parsed components of the selected place so
   * the parent form can sync the sibling city / country fields.
   */
  onPlaceSelected?: (place: {
    address: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
  }) => void;
}

// Promise that loads the Places library once per page. Subsequent
// callers just await the same promise.
let googleMapsPromise: Promise<typeof google> | null = null;

function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("not in browser"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `__gmpReady_${Date.now()}`;
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      resolve(window.google);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error("Google Maps JS failed to load"));
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

export default function AddressAutocomplete({
  name,
  defaultValue,
  placeholder,
  className,
  onPlaceSelected,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Internal state so the input stays controlled-ish even when
  // the Autocomplete dropdown writes into it directly.
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;
    let autocomplete: google.maps.places.Autocomplete | null = null;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !inputRef.current) return;
        autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: ["be"] },
          fields: ["address_components", "geometry", "formatted_address"],
          types: ["address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          if (!place?.geometry?.location) return;
          const components = place.address_components ?? [];
          const get = (type: string) =>
            components.find((c) => c.types.includes(type))?.long_name ?? "";
          const streetNumber = get("street_number");
          const route = get("route");
          const city =
            get("locality") ||
            get("postal_town") ||
            get("administrative_area_level_2") ||
            "";
          const country = get("country");
          const address = [route, streetNumber].filter(Boolean).join(" ");
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setValue(address);
          if (inputRef.current) inputRef.current.value = address;
          onPlaceSelected?.({ address, city, country, lat, lng });
        });
      })
      .catch(() => {
        // Quietly degrade — input still works as a plain text field.
      });

    return () => {
      cancelled = true;
      // No public API to fully tear down Autocomplete; the DOM
      // listener is removed when the input unmounts.
    };
  }, [apiKey, onPlaceSelected]);

  return (
    <input
      ref={inputRef}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
