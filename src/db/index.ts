import { drizzle } from "drizzle-orm/libsql";
import { tokensTable, commands } from "./schema.js";
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

export async function getTokens(
  userID: string,
  name?: string,
): Promise<Tokens> {
  let result = await db
    .select({
      access: tokensTable.access_token,
      refresh: tokensTable.refresh_token,
    })
    .from(tokensTable)
    .where(eq(tokensTable.user_id, userID));

  const tokens = result.at(0);

  if (tokens == undefined) {
    console.error(
      `Please register an access token for ${userID}${name ? ` (${name})` : ""}`,
    );
    process.exit(1);
  }

  return tokens;
}

export async function createCommand(args: {
  name: string;
  text: string;
  userID: string;
  userLogin: string;
}) {
  await db.insert(commands).values({
    name: args.name,
    text: args.text,
    user_id: args.userID,
    user_login: args.userLogin,
  });
}

export async function updateCommand(args: { name: string; text: string }) {
  await db
    .update(commands)
    .set({ text: args.text })
    .where(eq(commands.name, args.name));
}

export async function deleteCommand(name: string) {
  await db.delete(commands).where(eq(commands.name, name));
}

export async function getCommandText(name: string): Promise<string | null> {
  let result = await db
    .select({ text: commands.text })
    .from(commands)
    .where(eq(commands.name, name));

  const cmd = result.at(0);

  if (cmd == undefined) {
    return null;
  }

  return cmd.text;
}

export async function getAllCommands() {
  let result = await db.select().from(commands);

  return result;
}
