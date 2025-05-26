import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tokensTable = sqliteTable("user_tokens", {
  user_id: text().primaryKey(),
  access_token: text().notNull(),
  refresh_token: text().notNull(),
});

export const commands = sqliteTable("commands", {
  name: text().primaryKey(),
  text: text().notNull(),
  user_id: text().notNull(),
  user_login: text().notNull(),
});
