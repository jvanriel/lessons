import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  date,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  // Uniqueness enforced by functional index `users_email_lower_idx`
  // on LOWER(email) — see scripts/migrate-email-lower-unique.ts.
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  password: varchar("password", { length: 255 }),
  roles: varchar("roles", { length: 255 }).default(""),
  preferredLocale: varchar("preferred_locale", { length: 5 }).default("en"),
  emailOptOut: boolean("email_opt_out").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  // Golf profile (students)
  handicap: numeric("handicap"),
  golfGoals: jsonb("golf_goals").$type<string[]>(),
  golfGoalsOther: varchar("golf_goals_other", { length: 500 }),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  lastLoginAt: timestamp("last_login_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userEmails = pgTable("user_emails", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  // Uniqueness enforced by functional index `user_emails_email_lower_idx`
  // on LOWER(email) — see scripts/migrate-email-lower-unique.ts.
  email: varchar("email", { length: 255 }).notNull(),
  label: varchar("label", { length: 50 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cmsBlocks = pgTable("cms_blocks", {
  id: serial("id").primaryKey(),
  pageSlug: varchar("page_slug", { length: 100 }).notNull(),
  blockKey: varchar("block_key", { length: 200 }).notNull(),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
  content: text("content").notNull(),
  format: varchar("format", { length: 20 }).default("text"),
  sourceHash: varchar("source_hash", { length: 64 }),
  translatedAt: timestamp("translated_at"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cmsBlockHistory = pgTable("cms_block_history", {
  id: serial("id").primaryKey(),
  blockId: integer("block_id")
    .references(() => cmsBlocks.id, { onDelete: "cascade" })
    .notNull(),
  pageSlug: varchar("page_slug", { length: 100 }).notNull(),
  blockKey: varchar("block_key", { length: 200 }).notNull(),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
  content: text("content").notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export const cmsPageVersions = pgTable("cms_page_versions", {
  id: serial("id").primaryKey(),
  pageSlug: varchar("page_slug", { length: 100 }).notNull(),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
  version: integer("version").notNull(),
  blocks: jsonb("blocks").$type<Record<string, string>>().notNull(),
  publishedBy: integer("published_by").references(() => users.id),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  message: varchar("message", { length: 500 }),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  targetUserId: integer("target_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  actionUrl: varchar("action_url", { length: 500 }),
  actionLabel: varchar("action_label", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Pro Profiles & Locations ───────────────────────────────

export const proProfiles = pgTable("pro_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  // Vanity slug removed 2026-04-17 — pro URLs are now `/book/{id}`,
  // `/pros/{id}`, `/member/book/{id}` keyed off this row's serial id.
  displayName: varchar("display_name", { length: 255 }).notNull(),
  bio: text("bio"),
  specialties: varchar("specialties", { length: 500 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  lessonDurations: jsonb("lesson_durations")
    .$type<number[]>()
    .notNull()
    .default([60]),
  maxGroupSize: integer("max_group_size").notNull().default(4),
  /**
   * Free-text price indication shown on the pro profile page
   * (e.g. "€50-75/u"). NOT used for actual charging — that's
   * `lessonPricing` below.
   */
  pricePerHour: text("price_per_hour"),
  /**
   * Per-duration lesson price in EUR cents for actual charging — for
   * the *first* student. Keys are duration minutes as strings matching
   * `lessonDurations`, values are prices in cents. Example:
   * `{ "30": 3500, "60": 6500 }`. Used by the booking flow to compute
   * the PaymentIntent amount.
   */
  lessonPricing: jsonb("lesson_pricing")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  /**
   * Per-duration price for each *additional* student in the same lesson
   * (group-discount mechanism). Keyed the same way as `lessonPricing`.
   * Total billed = `lessonPricing[d] + extraStudentPricing[d] * (participantCount - 1)`.
   *
   * **Default is zero.** When a duration is missing here, extra students
   * are billed at 0 — the base rate covers the whole group. Pros who
   * want to charge per-head set a value; the default reflects the most
   * common coaching convention (one group lesson, one price).
   */
  extraStudentPricing: jsonb("extra_student_pricing")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  // Operational timezone: the TZ the pro teaches in. Drives "today",
  // "this week", and the week-grid boundaries in /pro/bookings. Also
  // used as the fallback TZ when a location doesn't declare one.
  // Lessons are still anchored to their location's TZ for slot math;
  // this is the pro's own display/query TZ.
  defaultTimezone: varchar("default_timezone", { length: 50 }).notNull().default("Europe/Brussels"),
  bookingEnabled: boolean("booking_enabled").notNull().default(true),
  bookingNotice: integer("booking_notice").notNull().default(24),
  bookingHorizon: integer("booking_horizon").notNull().default(60),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  lateCancelRefundPercent: integer("late_cancel_refund_percent").notNull().default(0),
  allowBookingWithoutPayment: boolean("allow_booking_without_payment").notNull().default(false),
  googleCalendarEmail: varchar("google_calendar_email", { length: 255 }),
  // Public contact phone shown to students (booking confirmation email +
  // /member/bookings). Kept separate from `users.phone` so a pro can have
  // a private number for the platform and a different work number students
  // can call.
  contactPhone: varchar("contact_phone", { length: 50 }),
  published: boolean("published").notNull().default(false),
  // Stripe subscription
  subscriptionStatus: varchar("subscription_status", { length: 20 }).notNull().default("none"),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionPlan: varchar("subscription_plan", { length: 20 }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  subscriptionTrialEnd: timestamp("subscription_trial_end"),
  // Bank account (for manual payouts by accountant)
  bankAccountHolder: varchar("bank_account_holder", { length: 255 }),
  bankIban: varchar("bank_iban", { length: 34 }),
  bankBic: varchar("bank_bic", { length: 11 }),
  // Invoicing: who we bill for subscription + cash-only commission.
  // `invoicing_type` = 'individual' uses the user's own name; 'company'
  // drives Stripe tax_id + B2B invoice format.
  invoicingType: varchar("invoicing_type", { length: 20 }).notNull().default("individual"),
  companyName: varchar("company_name", { length: 255 }),
  vatNumber: varchar("vat_number", { length: 50 }),
  invoiceAddressLine1: varchar("invoice_address_line1", { length: 255 }),
  invoiceAddressLine2: varchar("invoice_address_line2", { length: 255 }),
  invoicePostcode: varchar("invoice_postcode", { length: 20 }),
  invoiceCity: varchar("invoice_city", { length: 100 }),
  // ISO-3166-1 alpha-2 country code (BE, NL, FR, …).
  invoiceCountry: varchar("invoice_country", { length: 2 }),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 255 }),
  country: varchar("country", { length: 100 }),
  lat: numeric("lat"),
  lng: numeric("lng"),
  // No DB default. Every insert path (onboarding wizard, locations
  // form, seed scripts, integration tests) now writes an explicit
  // IANA zone validated by `isValidIanaTimezone()`. Removing the
  // default closes the loop so a future code path that forgets to
  // pass `timezone` fails loudly at INSERT instead of silently
  // landing on Brussels (gaps.md §0 pass 3).
  timezone: varchar("timezone", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const proLocations = pgTable("pro_locations", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  locationId: integer("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  priceIndication: varchar("price_indication", { length: 100 }),
  lessonDuration: integer("lesson_duration"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Availability & Bookings ────────────────────────────────

export const proAvailability = pgTable("pro_availability", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  proLocationId: integer("pro_location_id")
    .references(() => proLocations.id, { onDelete: "cascade" })
    .notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schedule periods (task 78). Authoritative period definitions, so
// empty periods (vacation / closed) can persist without slot rows.
// `pro_availability` rows join by date-tuple match (`valid_from`,
// `valid_until` IS NOT DISTINCT FROM …); the engine still reads slots
// from `pro_availability` directly. Invariants enforced in
// `saveSchedulePeriods`: only the chronologically first period may
// have `validFrom = null`, only the last may have `validUntil = null`,
// and bounded periods don't overlap. Gap dates have no availability.
export const proSchedulePeriods = pgTable("pro_schedule_periods", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const proAvailabilityOverrides = pgTable(
  "pro_availability_overrides",
  {
    id: serial("id").primaryKey(),
    proProfileId: integer("pro_profile_id")
      .references(() => proProfiles.id, { onDelete: "cascade" })
      .notNull(),
    proLocationId: integer("pro_location_id").references(
      () => proLocations.id,
      { onDelete: "cascade" }
    ),
    date: date("date").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    startTime: varchar("start_time", { length: 5 }),
    endTime: varchar("end_time", { length: 5 }),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

export const lessonBookings = pgTable("lesson_bookings", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id)
    .notNull(),
  bookedById: integer("booked_by_id")
    .references(() => users.id)
    .notNull(),
  proLocationId: integer("pro_location_id")
    .references(() => proLocations.id)
    .notNull(),
  date: date("date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  participantCount: integer("participant_count").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("confirmed"),
  notes: text("notes"),
  // Payment
  priceCents: integer("price_cents"),
  currency: varchar("currency", { length: 3 }).notNull().default("eur"),
  paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("pending"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  /**
   * For cash-only pros (`allowBookingWithoutPayment=true`): the Stripe
   * invoice item ID we created against the pro's subscription customer to
   * claim our commission. Used at cancel-within-window time to reverse the
   * claim via `stripe.invoiceItems.del()`. Null for online-pay bookings.
   */
  stripeInvoiceItemId: varchar("stripe_invoice_item_id", { length: 255 }),
  platformFeeCents: integer("platform_fee_cents"),
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  // Existing
  manageToken: varchar("manage_token", { length: 64 }).notNull().unique(),
  googleEventId: varchar("google_event_id", { length: 255 }),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  /**
   * Number of times this booking has been edited (reschedule,
   * participant change, etc.). Used as the ICS `SEQUENCE` value so
   * that updated calendar invites supersede earlier ones for the
   * same UID. Bumped inside `updateBooking` / `proUpdateBooking`.
   * Pure cancellations don't bump this — they emit METHOD:CANCEL.
   */
  editCount: integer("edit_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const lessonParticipants = pgTable("lesson_participants", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .references(() => lessonBookings.id, { onDelete: "cascade" })
    .notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
});

// ─── Pro Pages (Profiles & Flyers) ─────────────────────────

export type ProPageSection = {
  id: string;
  type: "text" | "gallery" | "video" | "pricing" | "testimonial";
  title?: string;
  content?: string;
  media?: string[];
  mediaPosition?: "left" | "right";
  visible: boolean;
};

/**
 * Per-locale overrides for a pro page. Source language is the content
 * on the row itself; `translations[locale]` can override any of the
 * translatable fields (title, meta, intro, CTA label, section
 * title/content). Locales not in the map render the source.
 */
export type ProPageTranslation = {
  title?: string;
  metaDescription?: string;
  intro?: string;
  ctaLabel?: string;
  sections?: Record<string, { title?: string; content?: string }>;
};

export const proPages = pgTable("pro_pages", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("flyer"),
  title: varchar("title", { length: 255 }).notNull(),
  metaDescription: varchar("meta_description", { length: 300 }),
  heroImage: varchar("hero_image", { length: 500 }),
  intro: text("intro"),
  sections: jsonb("sections").$type<ProPageSection[]>(),
  ctaLabel: varchar("cta_label", { length: 100 }),
  ctaUrl: varchar("cta_url", { length: 500 }),
  ctaEmail: varchar("cta_email", { length: 255 }),
  translations: jsonb("translations").$type<Record<string, ProPageTranslation>>(),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Pro-Student Relationships ──────────────────────────────

export const proStudents = pgTable("pro_students", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  source: varchar("source", { length: 20 }).notNull().default("self"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  lastMessageAt: timestamp("last_message_at"),
  // Booking preferences (auto-populated from booking history)
  preferredLocationId: integer("preferred_location_id").references(
    () => proLocations.id
  ),
  preferredDuration: integer("preferred_duration"),
  preferredDayOfWeek: integer("preferred_day_of_week"), // ISO: 0=Mon..6=Sun
  preferredTime: varchar("preferred_time", { length: 20 }), // HH:MM or morning/afternoon/evening
  preferredInterval: varchar("preferred_interval", { length: 20 }), // weekly, biweekly, monthly
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Pro Mailing ────────────────────────────────────────────

export const proMailingContacts = pgTable("pro_mailing_contacts", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  unsubscribed: boolean("unsubscribed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const proMailings = pgTable("pro_mailings", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  pageId: integer("page_id").references(() => proPages.id),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// ─── Tasks ──────────────────────────────────────────────

// ─── Feedback ──────────────────────────────────────────
//
// User-submitted feedback messages with an admin response thread.
// Submitting fans out a high-priority admin notification AND mails
// contact@golflessons.be (so we hear about it even when no admin is
// online). When an admin responds, the user gets an email back so the
// loop closes without forcing them to re-open the app.
//
// Status values:
//   - "new"         freshly submitted, no admin action yet
//   - "in_progress" admin has triaged but not responded yet
//   - "responded"   admin response sent (visible to user on /feedback)
//   - "closed"      no further action needed; user can still re-open
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  adminResponse: text("admin_response"),
  respondedById: integer("responded_by_id").references(() => users.id),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  column: varchar("column", { length: 20 }).notNull().default("todo"),
  position: integer("position").notNull().default(0),
  assigneeIds: jsonb("assignee_ids").$type<number[]>(),
  sharedWithIds: jsonb("shared_with_ids").$type<number[]>(),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  colorLabel: varchar("color_label", { length: 20 }),
  dueDate: timestamp("due_date"),
  checklist: jsonb("checklist").$type<
    Array<{ text: string; done: boolean }>
  >(),
  completedAt: timestamp("completed_at"),
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskNotes = pgTable("task_notes", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Comments ──────────────────────────────────────────

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  contextType: varchar("context_type", { length: 20 }).notNull(),
  contextId: integer("context_id").notNull(),
  authorId: integer("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("comment"),
  pinned: boolean("pinned").notNull().default(false),
  replyToId: integer("reply_to_id"),
  attachments: jsonb("attachments").$type<
    Array<{ name: string; url: string; size: number; contentType: string }>
  >(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const commentReactions = pgTable("comment_reactions", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id")
    .references(() => comments.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  emoji: varchar("emoji", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Stripe Events (Webhook Audit Trail) ──────────────

// ─── Observability ─────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 100 }).notNull(),
    level: varchar("level", { length: 10 }).notNull().default("info"),
    actorId: integer("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetId: integer("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    typeCreatedAtIdx: index("events_type_created_at_idx").on(
      table.type,
      table.createdAt
    ),
    actorCreatedAtIdx: index("events_actor_created_at_idx").on(
      table.actorId,
      table.createdAt
    ),
    createdAtIdx: index("events_created_at_idx").on(table.createdAt),
  })
);

export const stripeEvents = pgTable("stripe_events", {
  id: serial("id").primaryKey(),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  relatedUserId: integer("related_user_id").references(() => users.id),
  relatedBookingId: integer("related_booking_id").references(
    () => lessonBookings.id
  ),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// ─── WebAuthn (Face ID / Touch ID / passkeys) ─────────────────────
//
// One row per device-bound credential a user has registered. A user can
// have many — phone, laptop, hardware key, etc. `credentialId` is the
// base64url-encoded id the browser/authenticator returns; we look it
// up on assertion. `publicKey` is the raw COSE public key bytes.
// `counter` is bumped on each successful assertion to detect cloned
// authenticators (a regression in counter is a hard error). `transports`
// captures hints from the browser ("internal", "usb", "ble", etc.) so
// follow-up assertions can be steered to the right authenticator.
export const webauthnCredentials = pgTable(
  "webauthn_credentials",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    credentialId: varchar("credential_id", { length: 255 }).notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: jsonb("transports").$type<string[]>(),
    /** User-supplied label so they can tell their phone from their laptop. */
    nickname: varchar("nickname", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => ({
    userIdIdx: index("webauthn_credentials_user_id_idx").on(table.userId),
  })
);


// ─── QR Login Tokens ───────────────────────────────────
//
// Short-id → JWT redirection table for the "open on phone" QR login.
// Keeps the QR URL tiny (`/q/<id>` instead of a 280-char JWT URL) so
// non-iPhone scanners — Android cameras, Samsung Internet, etc. —
// can resolve the dense JWT QR. Trade-off vs the previous
// self-contained JWT-in-URL approach: one extra DB lookup per scan;
// in exchange we get reliable cross-device scanning.
//
// `id` is short opaque base62 (8 chars = 218 trillion combinations,
// plenty for 5-min collision space). Single-use: `consumed_at` is
// set on first redemption so a scanned-and-shared URL can't replay.
// Expired/consumed rows are pruned opportunistically (no cron).
export const qrLoginTokens = pgTable(
  "qr_login_tokens",
  {
    id: varchar("id", { length: 16 }).primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * The full session JWT to install on redemption. Storing it lets
     * the redeem endpoint stay stateless w.r.t. role/email lookups —
     * everything needed to set the session cookie is in the token.
     */
    sessionJwt: text("session_jwt").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    expiresAtIdx: index("qr_login_tokens_expires_at_idx").on(table.expiresAt),
  })
);
