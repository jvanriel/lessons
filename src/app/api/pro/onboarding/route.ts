import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  proProfiles,
  locations,
  proLocations,
  lessonBookings,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { isValidIanaTimezone } from "@/lib/timezones";

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { step, data } = body as { step: string; data: Record<string, unknown> };

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  switch (step) {
    case "profile": {
      const { displayName, bio, specialties } = data as {
        displayName: string;
        bio: string;
        specialties: string;
      };
      if (!displayName?.trim()) {
        return NextResponse.json({ error: "Display name is required" }, { status: 400 });
      }
      await db
        .update(proProfiles)
        .set({
          displayName: displayName.trim(),
          bio: bio?.trim() || null,
          specialties: specialties?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(proProfiles.id, profile.id));
      break;
    }

    case "locations": {
      const locs = data.locations as Array<{
        name: string;
        address: string;
        city: string;
        timezone?: string;
        lessonDurations?: number[];
        lessonPricing?: Record<string, number>;
        extraStudentPricing?: Record<string, number>;
        maxGroupSize?: number;
      }>;
      if (!locs || locs.length === 0) {
        return NextResponse.json({ error: "At least one location is required" }, { status: 400 });
      }
      for (const loc of locs) {
        if (!loc.name?.trim()) {
          return NextResponse.json({ error: "Location name is required" }, { status: 400 });
        }
        const tz = (loc.timezone ?? "").trim();
        if (!isValidIanaTimezone(tz)) {
          return NextResponse.json(
            { error: "A valid timezone is required for each location" },
            { status: 400 },
          );
        }
      }

      // Replace existing pro_locations + their location rows. The pre-fix
      // path only INSERTED, so a pro who navigated back to step 2 and
      // hit Next again duplicated every location (task 129). Onboarding
      // runs pre-subscription, so no lesson_bookings can reference these
      // rows yet — the FK cascade on proLocations.locationId → locations
      // takes care of the link rows. Defence-in-depth: if any booking
      // *does* reference an existing pro_location (shouldn't be possible
      // pre-subscription), abort with a 409 rather than orphaning history.
      const existing = await db
        .select({
          proLocationId: proLocations.id,
          locationId: proLocations.locationId,
        })
        .from(proLocations)
        .where(eq(proLocations.proProfileId, profile.id));

      if (existing.length > 0) {
        const proLocationIds = existing.map((e) => e.proLocationId);
        const booked = await db
          .select({ id: lessonBookings.id })
          .from(lessonBookings)
          .where(inArray(lessonBookings.proLocationId, proLocationIds))
          .limit(1);
        if (booked.length > 0) {
          return NextResponse.json(
            { error: "Cannot replace locations with existing bookings" },
            { status: 409 },
          );
        }
        await db
          .delete(locations)
          .where(
            inArray(
              locations.id,
              existing.map((e) => e.locationId),
            ),
          );
      }

      for (const loc of locs) {
        const tz = (loc.timezone ?? "").trim();
        const [inserted] = await db
          .insert(locations)
          .values({
            name: loc.name.trim(),
            address: loc.address?.trim() || null,
            city: loc.city?.trim() || null,
            country: "Belgium",
            timezone: tz,
          })
          .returning({ id: locations.id });

        // Per-location pricing payload (task 130). Sanitise inline:
        // only keep priced durations, only allow non-negative extras.
        const durations =
          loc.lessonDurations?.filter((n) => typeof n === "number" && n > 0) ??
          [60];
        const validDur = new Set(durations.map(String));
        const lessonPricing: Record<string, number> = {};
        for (const [k, v] of Object.entries(loc.lessonPricing ?? {})) {
          if (!validDur.has(k)) continue;
          const cents = Math.round(Number(v));
          if (Number.isFinite(cents) && cents > 0) lessonPricing[k] = cents;
        }
        const extraStudentPricing: Record<string, number> = {};
        for (const [k, v] of Object.entries(loc.extraStudentPricing ?? {})) {
          if (!validDur.has(k)) continue;
          const cents = Math.round(Number(v));
          if (Number.isFinite(cents) && cents >= 0) {
            extraStudentPricing[k] = cents;
          }
        }
        const maxGroupSize =
          typeof loc.maxGroupSize === "number" &&
          loc.maxGroupSize >= 1 &&
          loc.maxGroupSize <= 20
            ? Math.floor(loc.maxGroupSize)
            : 4;

        await db.insert(proLocations).values({
          proProfileId: profile.id,
          locationId: inserted.id,
          active: true,
          lessonDurations: durations,
          lessonPricing,
          extraStudentPricing,
          maxGroupSize,
        });
      }
      break;
    }

    case "reservationSpecs": {
      // Replaces the old `lessons` step (task 130). Pricing moved
      // per-location; this step now carries only booking policy.
      const { bookingNotice, bookingHorizon, cancellationHours } = data as {
        bookingNotice?: number;
        bookingHorizon?: number;
        cancellationHours?: number;
      };
      const patch: Partial<typeof proProfiles.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (typeof bookingNotice === "number" && bookingNotice >= 0) {
        patch.bookingNotice = Math.floor(bookingNotice);
      }
      if (typeof bookingHorizon === "number" && bookingHorizon >= 1) {
        patch.bookingHorizon = Math.floor(bookingHorizon);
      }
      if (typeof cancellationHours === "number" && cancellationHours >= 0) {
        patch.cancellationHours = Math.floor(cancellationHours);
      }
      await db
        .update(proProfiles)
        .set(patch)
        .where(eq(proProfiles.id, profile.id));
      break;
    }

    case "bank": {
      const { accountHolder, iban, bic } = data as {
        accountHolder: string;
        iban: string;
        bic?: string;
      };
      if (!accountHolder?.trim()) {
        return NextResponse.json({ error: "Account holder is required" }, { status: 400 });
      }
      const cleanIban = iban?.replace(/\s/g, "").toUpperCase();
      if (!cleanIban || !IBAN_REGEX.test(cleanIban)) {
        return NextResponse.json({ error: "Invalid IBAN format" }, { status: 400 });
      }
      await db
        .update(proProfiles)
        .set({
          bankAccountHolder: accountHolder.trim(),
          bankIban: cleanIban,
          bankBic: bic?.trim().toUpperCase() || null,
          updatedAt: new Date(),
        })
        .where(eq(proProfiles.id, profile.id));
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
