"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for "booking-changed" events (dispatched by NotificationBell)
 * and triggers a Next.js router refresh to update server-rendered data.
 *
 * Mount this in any page that shows booking-related data.
 */
export function BookingRefreshListener() {
  const router = useRouter();

  useEffect(() => {
    function handleBookingChanged() {
      router.refresh();
    }
    window.addEventListener("booking-changed", handleBookingChanged);
    return () => window.removeEventListener("booking-changed", handleBookingChanged);
  }, [router]);

  return null;
}
