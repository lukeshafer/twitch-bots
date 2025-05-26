import { buildAuthURL, getTokenFromCode, verifyState } from "./twitch.js";
import { Hono } from "hono";
import { decode } from "hono/jwt";
import { html } from "hono/html";
import { serve } from "@hono/node-server";
import * as v from "valibot";
import { upsertTokens } from "./db/index.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST ?? "localhost";
const BASE_ADDRESS = `http://${HOST}:${PORT.toFixed()}`;

const app = new Hono();

const Claims = v.object({
  aud: v.string(),
  exp: v.number(),
  iat: v.number(),
  iss: v.string(),
  sub: v.string(),
  azp: v.string(),
  preferred_username: v.string(),
});

app.get("/", (c) => {
  let authURL = buildAuthURL({ redirectUri: `${BASE_ADDRESS}/callback` });

  const queries = c.req.query();

  let queryHTML = Object.keys(queries).length
    ? html`<pre>${JSON.stringify(queries, null, 2)}</pre>`
    : "";

  return c.html(html`${queryHTML}<a href="${authURL}">Authorize</a>`);
});

app.get("/callback", async (c) => {
  let code = c.req.query("code");
  let state = c.req.query("state");

  if (!state) {
    c.html(html`<p style="color:red;">STATE MISSING</p>`);
  }
  if (!code) {
    c.html(html`<p style="color:red;">CODE MISSING</p>`);
  }

  if (!state || !code) {
    return c.html(html`
      ${state ? "" : html`<p style="color:red;">STATE MISSING</p>`}
      ${code ? "" : html`<p style="color:red;">CODE MISSING</p>`}
    `);
  }

  let isValidState = verifyState(state);
  if (!isValidState) {
    return c.html(html`<p style="color:red;">INVALID STATE</p>`);
  }

  try {
    const tokens = await getTokenFromCode({
      code,
      redirectUri: `${BASE_ADDRESS}/callback`,
    });

    const claims = v.parse(Claims, decode(tokens.idToken).payload);

    await upsertTokens(claims.sub, {
      access: tokens.accessToken,
      refresh: tokens.refreshToken,
    });

    const params = new URLSearchParams({
      message: `Tokens saved for ${claims.sub} (${claims.preferred_username})`,
    });

    return c.redirect(`/?${params.toString()}`);
  } catch (e: any) {
    console.error(e);
    return c.text(e.message);
  }
});

export default function startServer() {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  });
}
