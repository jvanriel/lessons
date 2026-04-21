import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `.toISOString().split("T")[0]` converts to UTC first, which shifts
      // local midnight back a day in positive-offset zones (Europe/Brussels).
      // Use formatLocalDate() / todayLocal() from @/lib/local-date instead.
      // This caused task 46: Thursday bookings rendered under Friday column.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']",
          message:
            "Don't use `.toISOString().split(\"T\")[0]` — it produces a UTC date, not a local one. Import `formatLocalDate` or `todayLocal` from '@/lib/local-date'.",
        },
      ],
    },
  },
  {
    // The helper file documents the banned pattern in a comment.
    files: ["src/lib/local-date.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default eslintConfig;
