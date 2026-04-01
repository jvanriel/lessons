interface LogoProps {
  size?: number;
  variant?: "cream" | "green" | "gold";
  className?: string;
}

export default function Logo({
  size = 24,
  variant = "cream",
  className,
}: LogoProps) {
  const colors = {
    cream: { primary: "#ece0b8", accent: "#c4a035", ball: "#faf8f0" },
    green: { primary: "#1a3d2a", accent: "#c4a035", ball: "#091a12" },
    gold: { primary: "#c4a035", accent: "#a68523", ball: "#d4b865" },
  };
  const c = colors[variant];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Flag pole */}
      <line
        x1="32"
        y1="6"
        x2="32"
        y2="36"
        stroke={c.primary}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Flag */}
      <path
        d="M32 6 L19 11.5 L32 17 Z"
        fill={c.accent}
        opacity="0.9"
      />
      {/* Green/hole - subtle arc */}
      <ellipse
        cx="28"
        cy="37"
        rx="14"
        ry="3.5"
        fill={c.primary}
        opacity="0.15"
      />
      {/* Golf ball */}
      <circle cx="16" cy="34" r="5.5" fill={c.ball} opacity="0.95" />
      {/* Ball dimples */}
      <circle cx="14.5" cy="32.5" r="0.7" fill={c.primary} opacity="0.12" />
      <circle cx="17" cy="32" r="0.7" fill={c.primary} opacity="0.12" />
      <circle cx="15.8" cy="34.5" r="0.7" fill={c.primary} opacity="0.12" />
      <circle cx="13.5" cy="35" r="0.7" fill={c.primary} opacity="0.10" />
      <circle cx="17.8" cy="34" r="0.7" fill={c.primary} opacity="0.10" />
      <circle cx="16.5" cy="36.2" r="0.7" fill={c.primary} opacity="0.08" />
      {/* Ball subtle outline */}
      <circle
        cx="16"
        cy="34"
        r="5.5"
        stroke={c.primary}
        strokeWidth="0.6"
        opacity="0.2"
        fill="none"
      />
    </svg>
  );
}
