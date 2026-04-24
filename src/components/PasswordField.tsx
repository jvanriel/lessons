"use client";

import { useState } from "react";
import { generatePassword } from "@/lib/password";

/**
 * Password input with:
 *  - Show/hide eye icon (toggles input type between text and password)
 *  - Optional "Generate" button (calls `generatePassword()` and writes
 *    the value back via `onChange`; parent typically also mirrors the
 *    new value into a confirm field via `onGenerate`)
 *  - Optional "Copy" button (shown when `allowCopy` and the field has
 *    a value — handy right after generate)
 *
 * Appearance matches the existing bare password inputs in the pro
 * onboarding wizard: a slightly-tall `inputClass`-shaped wrapper. The
 * parent owns labels, error messages, and the minLength check.
 */
export default function PasswordField({
  value,
  onChange,
  label,
  required,
  name,
  autoComplete,
  minLength,
  placeholder,
  generateLabel,
  allowCopy = true,
  onGenerate,
  onBlur,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Optional field label. When set, rendered as a flex row with the
   * Generate button on the right — so label + action sit on one line
   * and the input sits below at the same baseline as a sibling field
   * without Generate.
   */
  label?: string;
  /** Render a red asterisk after the label. */
  required?: boolean;
  name?: string;
  autoComplete?: string;
  minLength?: number;
  placeholder?: string;
  /**
   * Show the Generate button with this label. Omit to hide it (used
   * on confirm-password fields and login forms).
   */
  generateLabel?: string;
  /** Show the copy-to-clipboard icon when the field has a value. */
  allowCopy?: boolean;
  /**
   * Called when Generate is clicked with the freshly generated
   * password. Parent typically mirrors this into a confirm field.
   */
  onGenerate?: (next: string) => void;
  onBlur?: () => void;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    const next = generatePassword();
    onChange(next);
    setVisible(true);
    setCopied(false);
    onGenerate?.(next);
  }

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const baseInput =
    "w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

  return (
    <div className={className}>
      {(label || generateLabel) && (
        <div className="mb-1 flex min-h-[20px] items-center justify-between gap-3">
          {label ? (
            <label className="text-sm font-medium text-green-800">
              {label}
              {required && <span className="text-red-500"> *</span>}
            </label>
          ) : (
            <span />
          )}
          {generateLabel && (
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs font-medium text-gold-600 hover:text-gold-500"
            >
              {generateLabel}
            </button>
          )}
        </div>
      )}
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          name={name}
          autoComplete={autoComplete ?? "new-password"}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className={baseInput + " pr-20"}
        />
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {allowCopy && value && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-green-800/40 hover:text-green-800/70"
              tabIndex={-1}
              title={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-green-800/40 hover:text-green-800/70"
            tabIndex={-1}
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
