import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isValidVatShape, normalizeVat } from "@/lib/vat";
import { getStripe } from "@/lib/stripe";
import { syncStripeCustomerInvoicing } from "@/lib/stripe-customer-sync";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    invoicingType,
    companyName,
    vatNumber,
    addressLine1,
    addressLine2,
    postcode,
    city,
    country,
  } = body as {
    invoicingType: "individual" | "company";
    companyName?: string;
    vatNumber?: string;
    addressLine1?: string;
    addressLine2?: string;
    postcode?: string;
    city?: string;
    country?: string;
  };

  if (invoicingType !== "individual" && invoicingType !== "company") {
    return NextResponse.json({ error: "Invalid invoicing type" }, { status: 400 });
  }

  const line1 = addressLine1?.trim() || null;
  const pc = postcode?.trim() || null;
  const c = city?.trim() || null;
  const cc = country?.trim().toUpperCase() || null;
  if (!line1 || !pc || !c || !cc || cc.length !== 2) {
    return NextResponse.json(
      { error: "Address line 1, postcode, city and country are required" },
      { status: 400 },
    );
  }

  let cleanVat: string | null = null;
  let cleanCompany: string | null = null;
  if (invoicingType === "company") {
    cleanCompany = companyName?.trim() || null;
    if (!cleanCompany) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 },
      );
    }
    if (vatNumber && vatNumber.trim()) {
      const normalised = normalizeVat(vatNumber);
      if (!isValidVatShape(normalised)) {
        return NextResponse.json(
          { error: "VAT number format doesn't look valid" },
          { status: 400 },
        );
      }
      cleanVat = normalised;
    }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await db
    .update(proProfiles)
    .set({
      invoicingType,
      companyName: cleanCompany,
      vatNumber: cleanVat,
      invoiceAddressLine1: line1,
      invoiceAddressLine2: addressLine2?.trim() || null,
      invoicePostcode: pc,
      invoiceCity: c,
      invoiceCountry: cc,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  // Mirror to the Stripe customer when one already exists so upcoming
  // invoices pick up the new details immediately. If there's no customer
  // yet, setup-subscription will call the same helper after creating one.
  if (user.stripeCustomerId) {
    try {
      const stripe = getStripe();
      await syncStripeCustomerInvoicing(
        stripe,
        user.stripeCustomerId,
        {
          invoicingType,
          companyName: cleanCompany,
          vatNumber: cleanVat,
          invoiceAddressLine1: line1,
          invoiceAddressLine2: addressLine2?.trim() || null,
          invoicePostcode: pc,
          invoiceCity: c,
          invoiceCountry: cc,
        },
        user,
      );
    } catch (err) {
      console.error("[api/pro/invoicing] Stripe sync failed:", err);
      // Save still succeeded — surface a non-fatal warning to the caller.
      return NextResponse.json({
        success: true,
        stripeSyncFailed: true,
      });
    }
  }

  return NextResponse.json({ success: true });
}
