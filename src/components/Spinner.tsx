import { cn } from "@/lib/utils";

interface SpinnerProps {
  /** Pixel size of the spinner ring. Defaults to 24. */
  size?: number;
  /** Tailwind classes for additional positioning / margin. */
  className?: string;
  /** Accessible label, read by screen readers. Defaults to "Loading". */
  label?: string;
}

/**
 * Brand-styled loading indicator. Pure CSS, no JS — safe to render
 * inside server components and works during the very first paint
 * before any client hydration. Uses Tailwind's `animate-spin` plus a
 * green/gold border palette to match the luxury theme.
 *
 * Pair with `loading.tsx` files (Next.js App Router) for route-level
 * loading states, or render inline next to slow data fetches.
 */
export function Spinner({ size = 24, className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="block h-full w-full animate-spin rounded-full border-2 border-green-100 border-t-gold-500"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface PageLoadingProps {
  /** Optional caption shown below the spinner. */
  message?: string;
}

/**
 * Centered, full-viewport loading state — the standard fallback for
 * `loading.tsx` files. Shows a brand-styled spinner with optional
 * caption text.
 */
export function PageLoading({ message }: PageLoadingProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 py-12">
      <Spinner size={40} />
      {message && (
        <p className="text-sm text-green-500">{message}</p>
      )}
    </div>
  );
}
