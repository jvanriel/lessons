# Peppol e-invoicing — decision & rollout

> **Status:** researched, not implemented. Recommended path: install the **Billit** app from the Stripe App Marketplace before **2026-01-01**.

## Why this matters

Belgium makes B2B e-invoicing via Peppol **mandatory for all VAT-registered businesses on 2026-01-01**. A paper or PDF invoice sent to another Belgian VAT-registered company stops being legally valid on that date — it has to be a Peppol BIS 3.0 UBL document delivered through the Peppol network.

We issue invoices to pros for:

- The pro subscription (monthly €12.50 or yearly €125)
- Cash-lesson commission roll-ups (invoice items added to the next subscription invoice — see `docs/money-flows.md` Flow 4)

A pro who onboards with `invoicingType: "company"` and a BE VAT number is a B2B customer and falls under the mandate. A pro who onboards as an individual is B2C and stays out of scope. Student lesson charges are always B2C — out of scope.

## What Stripe does NOT do

- Stripe Invoicing is not a Peppol Access Point. It can't emit or receive Peppol documents.
- Stripe's native output is **PDF + hosted URL + JSON via API** only. No UBL XML, no BIS 3.0 compliance.
- Stripe recommends bridging via its [App Marketplace partners](https://stripe.com/guides/send-e-invoicing-on-stripe-billing-through-app-marketplace-partners).

## Options compared

| Bridge | Coverage | Code work | Notes |
|---|---|---|---|
| **Billit** (Stripe App) | Certified Peppol AP; ~half of all BE Peppol traffic | Zero — dashboard install | Belgian, ISO 27001. Auto-converts every finalized Stripe invoice to BIS 3.0 UBL. Free tier = **Billtobox** (same company). |
| **peppol.sh** | Stripe-specific SaaS | Zero — dashboard install | Validates against EN 16931 + BIS 3.0 before delivery. Has sandbox mode. |
| **Via accounting suite** (Yuki / Silverfin / Exact / Odoo) | Depends on suite | Medium — needs a sync | Works if the accountant already uses one. Weaker here because invoices get duplicated between Stripe and the suite. |

## Recommended rollout

1. **Install Billit from the Stripe App Marketplace** — the one-click install on `dashboard.stripe.com/apps/marketplace`.
2. In Billit, configure: send only when the customer has a VAT ID set. Individual pros (no VAT) keep getting PDF emails; company pros (VAT set) get Peppol delivery.
3. Test with the Dummy Pro account on preview — set `invoicingType: "company"`, fake company name + a real test VAT number, trigger one charge, confirm Billit shows a delivery receipt.
4. Enable for live mode before 2026-01-01.
5. Update `docs/money-flows.md` with a note that subscription + cash-commission invoices go through Peppol for BE VAT pros.

## Data we already capture

The `/pro/onboarding` wizard's Invoicing step and the `/pro/billing` Invoicing card store everything Peppol needs:

- `pro_profiles.invoicing_type` — `individual` vs `company`
- `pro_profiles.company_name`
- `pro_profiles.vat_number` — validated by `src/lib/vat.ts` per EU country
- `pro_profiles.invoice_address_line1/2`, `invoice_postcode`, `invoice_city`, `invoice_country`

These are synced to the Stripe customer via `src/lib/stripe-customer-sync.ts` (address + name + `eu_vat` tax id), so Billit picks them up directly from the Stripe customer record. No extra wiring needed on our side.

## Open questions before go-live

- **Non-BE EU VAT pros (NL, FR, DE)**: Peppol delivery still works, but some of those countries don't require Peppol — they may prefer email-PDF. Decide per-country or let Billit's defaults handle it.
- **Non-EU pros (CH, GB)**: no Peppol, keep PDF emails. Billit's "BE VAT only" filter handles this automatically.
- **Cash-commission invoice items**: these attach to the next subscription invoice line. Verify Billit's UBL output includes line items with proper descriptions so the pro's accountant can reconcile each booking.

## References

- [Stripe — Send e-invoices via App Marketplace partners](https://stripe.com/guides/send-e-invoicing-on-stripe-billing-through-app-marketplace-partners)
- [Billit Stripe App](https://www.billit.eu/en-int/product/integrations/stripe-app/)
- [peppol.sh for Stripe](https://peppol.sh/for/stripe)
- [Fiskaly — Belgium B2B e-invoicing mandate 2026](https://www.fiskaly.com/blog/belgium-b2b-e-invoicing-mandate-2026-peppol)
