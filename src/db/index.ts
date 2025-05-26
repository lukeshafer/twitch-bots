import { drizzle } from "drizzle-orm/libsql";
import { tokensTable } from "./schema.js";
import { eq } from "drizzle-orm";

const db = drizzle(process.env.DB_FILE_NAME);

export type Tokens = {
  access: string;
  refresh: string;
};

export async function upsertTokens(
  userID: string,
  tokens: Tokens,
): Promise<void> {
  await db
    .insert(tokensTable)
    .values({
      user_id: userID,
      access_token: tokens.access,
      refresh_token: tokens.refresh,
    })
    .onConflictDoUpdate({
      target: tokensTable.user_id,
      set: {
        access_token: tokens.access,
        refresh_token: tokens.refresh,
      },
    });
}

export async function getTokens(userID: string): Promise<Tokens> {
  let result = await db
    .select({
      access: tokensTable.access_token,
      refresh: tokensTable.refresh_token,
    })
    .from(tokensTable)
    .where(eq(tokensTable.user_id, userID));

  const tokens = result.at(0);

  if (tokens == undefined) {
    console.error(`Please register an access token for ${userID}`);
    process.exit(1);
  }

  return tokens;
}
