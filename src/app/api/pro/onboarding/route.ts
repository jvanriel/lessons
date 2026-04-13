import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles, locations, proLocations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
      }>;
      if (!locs || locs.length === 0) {
        return NextResponse.json({ error: "At least one location is required" }, { status: 400 });
      }
      for (const loc of locs) {
        if (!loc.name?.trim()) {
          return NextResponse.json({ error: "Location name is required" }, { status: 400 });
        }
        // Create location and link to pro
        const [inserted] = await db
          .insert(locations)
          .values({
            name: loc.name.trim(),
            address: loc.address?.trim() || null,
            city: loc.city?.trim() || null,
            country: "Belgium",
          })
          .returning({ id: locations.id });

        await db.insert(proLocations).values({
          proProfileId: profile.id,
          locationId: inserted.id,
          active: true,
        });
      }
      break;
    }

    case "lessons": {
      const {
        pricePerHour,
        lessonDurations,
        lessonPricing,
        maxGroupSize,
        cancellationHours,
      } = data as {
        pricePerHour: string;
        lessonDurations: number[];
        lessonPricing?: Record<string, number>;
        maxGroupSize: number;
        cancellationHours: number;
      };
      const priceIndication = pricePerHour?.trim();
      if (!priceIndication) {
        return NextResponse.json({ error: "Price indication is required" }, { status: 400 });
      }

      // Sanitise lessonPricing: only keep entries for enabled durations
      // with a positive cent value.
      const cleanedPricing: Record<string, number> = {};
      const validDurations = new Set((lessonDurations ?? []).map(String));
      for (const [k, v] of Object.entries(lessonPricing ?? {})) {
        if (!validDurations.has(k)) continue;
        const cents = Math.round(Number(v));
        if (!Number.isFinite(cents) || cents <= 0) continue;
        cleanedPricing[k] = cents;
      }
      if (Object.keys(cleanedPricing).length === 0) {
        return NextResponse.json(
          { error: "At least one lesson duration needs a price" },
          { status: 400 }
        );
      }

      await db
        .update(proProfiles)
        .set({
          pricePerHour: priceIndication,
          lessonDurations: lessonDurations?.length ? lessonDurations : [60],
          lessonPricing: cleanedPricing,
          maxGroupSize: maxGroupSize || 4,
          cancellationHours: cancellationHours || 24,
          updatedAt: new Date(),
        })
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
