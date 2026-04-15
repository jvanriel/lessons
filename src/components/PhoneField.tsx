"use client";

import dynamic from "next/dynamic";
import { isValidPhoneNumber } from "libphonenumber-js/min";
import "react-phone-number-input/style.css";
import "./phone-field.css";

// The underlying PhoneInput component uses class inheritance internals
// that blow up under Next 16 Turbopack SSR ("Super expression must
// either be null or a function"). Loading it client-only sidesteps
// the module-init issue entirely. Validation comes from
// libphonenumber-js/min directly, which has no React deps.
const PhoneInput = dynamic(() => import("react-phone-number-input/min"), {
  ssr: false,
  loading: () => (
    <div className="phone-field-placeholder h-10 rounded-md border border-green-200 bg-white" />
  ),
});

// Re-export the library's Value type shape without pulling it from
// react-phone-number-input (which re-exports a class-component file).
type Value = string;

/**
 * Thin wrapper around react-phone-number-input/min with our theme
 * applied. Always returns the value as an E.164 string (or empty
 * string when cleared), which is what the server actions expect.
 *
 * Defaults to Belgium since that's the core market; the student can
 * pick a different country from the dropdown to the left of the input.
 */
export default function PhoneField({
  value,
  onChange,
  placeholder,
  required,
  showError,
  errorLabel,
  id,
  name,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Show an inline validation error when the number is non-empty + invalid. */
  showError?: boolean;
  errorLabel?: string;
  id?: string;
  name?: string;
}) {
  const invalid =
    !!showError && value.length > 0 && !isValidPhoneNumber(value);

  return (
    <div>
      <PhoneInput
        international
        defaultCountry="BE"
        value={(value || undefined) as Value | undefined}
        onChange={(v) => onChange((v ?? "") as string)}
        placeholder={placeholder}
        required={required}
        id={id}
        name={name}
        className="phone-field"
      />
      {invalid && errorLabel && (
        <p className="mt-1 text-xs text-red-600">{errorLabel}</p>
      )}
    </div>
  );
}

export { isValidPhoneNumber };
