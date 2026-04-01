import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 50 }),
  password: varchar("password", { length: 255 }),
  roles: varchar("roles", { length: 255 }).default(""),
  preferredLocale: varchar("preferred_locale", { length: 5 }).default("en"),
  emailOptOut: boolean("email_opt_out").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
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
