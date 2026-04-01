// Reference schema tables copied from silverswing.golf
// These need adaptation for the lessons project's own schema
//
// Dependencies: users table, locations table (from silverswing)

import {
  pgTable,
  serial,
  timestamp,
  jsonb,
  integer,
  varchar,
  boolean,
  text,
  date,
} from "drizzle-orm/pg-core";

// Users membership fields (were on the silverswing users table):
// membershipPlan: varchar("membership_plan", { length: 50 }).default("free"),
// membershipStartedAt: timestamp("membership_started_at"),
// membershipExpiresAt: timestamp("membership_expires_at"),
// stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
// stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),

// Placeholder references (replace with actual tables in lessons project)
const users = { id: null as any };
const locations = { id: null as any };

export const proProfiles = pgTable("pro_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  photoUrl: varchar("photo_url", { length: 500 }),
  lessonDurations: jsonb("lesson_durations").$type<number[]>().notNull().default([60]),
  maxGroupSize: integer("max_group_size").notNull().default(4),
  priceIndication: varchar("price_indication", { length: 100 }),
  googleCalendarEmail: varchar("google_calendar_email", { length: 255 }),
  bookingEnabled: boolean("booking_enabled").notNull().default(true),
  bookingNotice: integer("booking_notice").notNull().default(24),
  bookingHorizon: integer("booking_horizon").notNull().default(60),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const proAvailabilityOverrides = pgTable("pro_availability_overrides", {
  id: serial("id").primaryKey(),
  proProfileId: integer("pro_profile_id")
    .references(() => proProfiles.id, { onDelete: "cascade" })
    .notNull(),
  proLocationId: integer("pro_location_id").references(() => proLocations.id, {
    onDelete: "cascade",
  }),
  date: date("date").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  startTime: varchar("start_time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  manageToken: varchar("manage_token", { length: 64 }).notNull().unique(),
  googleEventId: varchar("google_event_id", { length: 255 }),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
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
