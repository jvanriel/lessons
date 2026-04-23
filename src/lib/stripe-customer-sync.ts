import type Stripe from "stripe";

/**
 * Push invoicing details onto a Stripe customer so the subscription
 * invoices we issue carry the right name, address, and VAT id. Safe to
 * call repeatedly — address/name/phone go through `customers.update`;
 * tax ids go through `customers.tax_ids` (we reconcile by deleting
 * anything that doesn't match our desired VAT and creating a single
 * `eu_vat` entry when needed).
 *
 * Swallows tax-id errors (e.g. Stripe rejecting a specific VAT format
 * against its own stricter validation) — the customer's address still
 * lands, and the pro can edit the VAT later from /pro/billing.
 */
export async function syncStripeCustomerInvoicing(
  stripe: Stripe,
  customerId: string,
  profile: {
    invoicingType: string | null;
    companyName: string | null;
    vatNumber: string | null;
    invoiceAddressLine1: string | null;
    invoiceAddressLine2: string | null;
    invoicePostcode: string | null;
    invoiceCity: string | null;
    invoiceCountry: string | null;
  },
  user: {
    firstName: string;
    lastName: string;
    phone: string | null;
  },
): Promise<void> {
  const isCompany = profile.invoicingType === "company";
  const billingName = isCompany && profile.companyName
    ? profile.companyName
    : `${user.firstName} ${user.lastName}`.trim();

  const update: Stripe.CustomerUpdateParams = { name: billingName };
  if (user.phone) update.phone = user.phone;

  // Only set address when all mandatory parts are present, otherwise Stripe
  // returns a validation error for a partial address.
  if (
    profile.invoiceAddressLine1 &&
    profile.invoicePostcode &&
    profile.invoiceCity &&
    profile.invoiceCountry
  ) {
    update.address = {
      line1: profile.invoiceAddressLine1,
      line2: profile.invoiceAddressLine2 ?? undefined,
      postal_code: profile.invoicePostcode,
      city: profile.invoiceCity,
      country: profile.invoiceCountry,
    };
  }

  await stripe.customers.update(customerId, update);

  // Reconcile tax ids. EU VAT only for now — GB/CH would need `gb_vat` /
  // `ch_vat` type and we've not had a use case yet.
  const desiredVat =
    isCompany && profile.vatNumber ? profile.vatNumber.toUpperCase() : null;
  const desiredIsEu =
    desiredVat !== null && /^[A-Z]{2}/.test(desiredVat) &&
    !["GB", "CH"].includes(desiredVat.slice(0, 2));

  try {
    const existing = await stripe.customers.listTaxIds(customerId, { limit: 10 });
    for (const tax of existing.data) {
      // Keep if it matches exactly what we want; otherwise drop.
      if (desiredIsEu && tax.type === "eu_vat" && tax.value === desiredVat) {
        continue;
      }
      await stripe.customers.deleteTaxId(customerId, tax.id).catch(() => {});
    }
    if (desiredIsEu && !existing.data.some(
      (t) => t.type === "eu_vat" && t.value === desiredVat,
    )) {
      await stripe.customers.createTaxId(customerId, {
        type: "eu_vat",
        value: desiredVat!,
      });
    }
  } catch (err) {
    console.error("[stripe-customer-sync] tax_id reconcile failed:", err);
  }
}
