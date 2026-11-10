import { pgTable, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
export const platformMetadata = pgTable('platform_metadata', {
  singleton: boolean().primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
