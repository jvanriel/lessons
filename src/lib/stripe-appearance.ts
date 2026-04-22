import type { StripeElementsOptions } from "@stripe/stripe-js";

/**
 * Shared Stripe Elements appearance so every <Elements> wrapper on
 * the site renders the card form with the same brand: green ink on
 * cream, gold accents, Outfit at 14px, rounded corners to match our
 * own inputs.
 *
 * `fonts` loads Outfit into the Stripe iframe — without this the
 * inputs fall back to system-ui regardless of `fontFamily`, because
 * the iframe has no access to the host page's fonts.
 */
export const stripeElementsOptions: Pick<
  StripeElementsOptions,
  "fonts" | "appearance"
> = {
  fonts: [
    {
      cssSrc:
        "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap",
    },
  ],
  appearance: {
    // "flat" drops Stripe's default gradient/shadow on inputs — sits
    // better on the cream background next to our own card UI.
    theme: "flat",
    variables: {
      colorPrimary: "#091a12", // deep green
      colorBackground: "#faf7f0", // cream
      colorText: "#091a12",
      colorTextSecondary: "#5b7a64",
      colorTextPlaceholder: "#a8b7ac",
      colorDanger: "#dc2626",
      colorSuccess: "#c4a035", // gold
      colorIconTab: "#5b7a64",
      colorIconTabSelected: "#c4a035",
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontSizeBase: "14px",
      fontWeightNormal: "400",
      fontWeightMedium: "500",
      borderRadius: "8px",
      spacingUnit: "4px",
      spacingGridRow: "14px",
    },
    rules: {
      ".Input": {
        border: "1px solid #bbd0c0",
        boxShadow: "none",
      },
      ".Input:focus": {
        border: "1px solid #c4a035",
        boxShadow: "0 0 0 1px #c4a035",
      },
      ".Tab": {
        border: "1px solid #bbd0c0",
      },
      ".Tab--selected": {
        borderColor: "#c4a035",
        color: "#091a12",
      },
      ".Label": {
        color: "#3c5744",
        fontWeight: "500",
      },
    },
  },
};
