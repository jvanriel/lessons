"use client";

import { useEffect, useMemo, useState } from "react";
import { COMMON_TIMEZONES, allIanaTimezones } from "@/lib/timezones";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface Props {
  /** HTML `name` so this picker submits via plain `<form>`. */
  name?: string;
  /** Current value (edit mode). Wins over `inferred` and `fallback`. */
  value?: string;
  onChange?: (tz: string) => void;
  locale: Locale;
  /**
   * Best-guess timezone derived from the form's other fields — typically
   * `defaultTimezoneForCountry(country)`. The picker shows this as the
   * resolved value when there's no `value`, with a small "from
   * <countryHint>" cue so the pro understands where it came from.
   */
  inferred?: string | null;
  /**
   * Short label describing where `inferred` came from (e.g. "Belgium",
   * "country: Spain"). Rendered next to the picker as a subtle hint
   * when `inferred` is in effect. Optional — omit and the picker just
   * shows the resolved value.
   */
  inferredFromLabel?: string | null;
  /**
   * Used when neither `value` nor `inferred` resolves. Defaults to
   * `Europe/Brussels` to match the Belgian-launched product. The pro
   * still has to confirm via the picker (the parent form should make
   * the field required), but at least the dropdown isn't empty.
   */
  fallback?: string;
  /** Form input `id` for label association. */
  id?: string;
  /** Marks the form input as required (default: true). */
  required?: boolean;
  /** Disable the picker UI entirely. */
  disabled?: boolean;
}

/**
 * IANA-timezone picker for the location form. Shows the resolved value
 * as plain text plus a small "change" link that expands a `<select>`.
 *
 * **Pre-selection priority:** `value` (edit mode) → `inferred` (derived
 * from country/etc.) → `fallback` (defaults to Europe/Brussels).
 *
 * The browser timezone is intentionally NOT consulted: a location's TZ
 * is a property of the place, not whichever device the pro happened to
 * register from. A Belgian pro on holiday in Tokyo configuring a
 * Brussels golf club must not see the picker pre-set to Tokyo. The
 * country field on the parent form is the right signal — pass it via
 * `inferred={defaultTimezoneForCountry(country)}` and the picker
 * re-renders as the pro types.
 *
 * Always submits a value via the hidden input; the parent server
 * action validates server-side via `isValidIanaTimezone(...)`.
 */
export function TimezonePicker({
  name = "timezone",
  value,
  onChange,
  locale,
  inferred,
  inferredFromLabel,
  fallback = "Europe/Brussels",
  id,
  required = true,
  disabled,
}: Props) {
  const initial = value ?? inferred ?? fallback;
  const [picked, setPicked] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  // Track whether the user has overridden the inferred value. Once
  // they do, we stop following `inferred` updates so changing the
  // country field doesn't silently overwrite their explicit pick.
  const [userOverride, setUserOverride] = useState(false);

  // Edit mode: when the parent's `value` resolves later (async load),
  // adopt it as the picked value.
  useEffect(() => {
    if (value && value !== picked) setPicked(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inference mode: when the parent's `inferred` changes (e.g. the pro
  // edits the country field), follow it — unless the pro has already
  // explicitly picked something. Skip when `value` is set (edit mode).
  useEffect(() => {
    if (value || userOverride || !inferred) return;
    if (inferred !== picked) {
      setPicked(inferred);
      onChange?.(inferred);
    }
  }, [inferred]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify the parent of the initial value on mount so React-state
  // forms (the onboarding wizard) see the resolved value without the
  // user having to touch the picker.
  useEffect(() => {
    if (!value) onChange?.(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string) {
    setPicked(next);
    setUserOverride(true);
    onChange?.(next);
  }

  // Build the option list: common zones first, then the rest.
  const allOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tz of COMMON_TIMEZONES) {
      if (!seen.has(tz)) {
        seen.add(tz);
        out.push(tz);
      }
    }
    for (const tz of allIanaTimezones()) {
      if (!seen.has(tz)) {
        seen.add(tz);
        out.push(tz);
      }
    }
    // If `picked` is somehow not in the list (legacy data, custom
    // value), prepend it so the select renders without surprise.
    if (!seen.has(picked)) out.unshift(picked);
    return out;
  }, [picked]);

  // Show the "from country" hint only while the picker is still on the
  // inferred value (i.e. the pro hasn't overridden). After override,
  // the pro chose deliberately — no need to second-guess them.
  const showInferredHint =
    !value && !userOverride && inferred === picked && !!inferredFromLabel;

  return (
    <div className="space-y-1">
      <input type="hidden" name={name} value={picked} required={required} />
      {!expanded ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-green-900">{picked}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-green-600 underline-offset-2 hover:underline"
            >
              {t("tzPicker.change", locale)}
            </button>
          )}
          {showInferredHint && (
            <span className="text-xs text-green-500">
              · {t("tzPicker.inferredFrom", locale)} {inferredFromLabel}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={id}
            value={picked}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className="block min-w-[14rem] rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <optgroup label={t("tzPicker.common", locale)}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={`c-${tz}`} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("tzPicker.all", locale)}>
              {allOptions
                .filter((tz) => !COMMON_TIMEZONES.includes(tz))
                .map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
            </optgroup>
          </select>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-green-600 underline-offset-2 hover:underline"
          >
            {t("tzPicker.done", locale)}
          </button>
        </div>
      )}
    </div>
  );
}
