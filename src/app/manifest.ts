import type { MetadataRoute } from "next";

const isProduction = process.env.VERCEL_ENV === "production";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: isProduction ? "Golf Lessons" : "Golf Lessons (Preview)",
    short_name: isProduction ? "Golf Lessons" : "GL Preview",
    description:
      "Book golf lessons with certified professionals. Manage your coaching, schedule, and progress.",
    start_url: "/",
    id: isProduction ? "golflessons-prod" : "golflessons-preview",
    display: "standalone",
    background_color: "#faf7f0",
    theme_color: isProduction ? "#091a12" : "#1a1209",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
