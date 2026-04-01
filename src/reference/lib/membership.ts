import type { Locale } from "@/lib/i18n";

export type MembershipPlanSlug = "free" | "full";

export interface MembershipPlan {
  slug: MembershipPlanSlug;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  price: number | null; // null = free, number = annual price in EUR
  features: string[];
  featureLabels: Record<Locale, string[]>;
  badge: Record<Locale, string>;
  comingSoon: boolean;
}

export const MEMBERSHIP_PLANS: Record<MembershipPlanSlug, MembershipPlan> = {
  free: {
    slug: "free",
    name: { nl: "Gratis", fr: "Gratuit", en: "Free" },
    description: {
      nl: "Toegang tot golflessen, onze shop en de nieuwsbrief.",
      fr: "Accès aux leçons de golf, notre boutique et la newsletter.",
      en: "Access to golf lessons, our shop, and the newsletter.",
    },
    price: null,
    features: ["newsletter", "shop", "lessons"],
    featureLabels: {
      nl: ["Nieuwsbrief", "Toegang tot de shop", "Golflessen boeken"],
      fr: ["Newsletter", "Accès à la boutique", "Réserver des leçons"],
      en: ["Newsletter", "Shop access", "Book golf lessons"],
    },
    badge: { nl: "Gratis Lid", fr: "Membre Gratuit", en: "Free Member" },
    comingSoon: false,
  },
  full: {
    slug: "full",
    name: { nl: "Volledig", fr: "Complet", en: "Full" },
    description: {
      nl: "Alles in Gratis, plus golfreizen boeken, prioriteit en exclusieve evenementen.",
      fr: "Tout dans Gratuit, plus réservation de voyages, priorité et événements exclusifs.",
      en: "Everything in Free, plus book golf trips, priority access, and exclusive events.",
    },
    price: null, // TBD — will be annual Stripe subscription
    features: ["newsletter", "shop", "lessons", "trips", "priority", "events"],
    featureLabels: {
      nl: [
        "Nieuwsbrief",
        "Toegang tot de shop",
        "Golflessen boeken",
        "Golfreizen boeken",
        "Prioriteit bij inschrijving",
        "Exclusieve ledenactiviteiten",
      ],
      fr: [
        "Newsletter",
        "Accès à la boutique",
        "Réserver des leçons",
        "Réserver des voyages de golf",
        "Priorité d'inscription",
        "Activités membres exclusives",
      ],
      en: [
        "Newsletter",
        "Shop access",
        "Book golf lessons",
        "Book golf trips",
        "Priority registration",
        "Exclusive member events",
      ],
    },
    badge: { nl: "Volledig Lid", fr: "Membre Complet", en: "Full Member" },
    comingSoon: true,
  },
};

export function getPlan(slug: string | null | undefined): MembershipPlan {
  if (slug && slug in MEMBERSHIP_PLANS) {
    return MEMBERSHIP_PLANS[slug as MembershipPlanSlug];
  }
  return MEMBERSHIP_PLANS.free;
}

export function hasFeature(
  plan: MembershipPlanSlug | string | null | undefined,
  feature: string
): boolean {
  return getPlan(plan).features.includes(feature);
}
