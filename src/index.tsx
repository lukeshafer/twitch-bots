import { Hono } from "hono";
import * as v from "valibot";
import { decode } from "hono/jwt";
import { handle } from "hono/aws-lambda";
import {
  generateState,
  setAppAccessToken,
  setTwitchTokens,
  verifyState,
} from "./auth.js";
import {
  createAuthURL,
  generateAppAccessToken,
  generateAuthTokensFromAccessCode,
  handleTwitchRequest,
} from "./twitch.js";
import { Resource } from "sst";
import { setupSnaleBot } from "./snale/bot.js";
import { setupToxicMan } from "./toxic-man/bot.js";

const app = new Hono();

app.get("/", async (c) => {
  let url = new URL(c.req.url);

  let authURL = createAuthURL({
    state: await generateState(),
    clientID: Resource.TwitchClientID.value,
    redirectUri: `https://${url.hostname}/callback`,
  });

  const queries = c.req.query();

  return c.html(
    <>
      {Object.keys(queries).length ? (
        <pre>{JSON.stringify(queries, null, 2)}</pre>
      ) : null}
      <a href={authURL}>Authorize</a>
      <form method="post" action="/setup-app-token">
        <button type="submit">Setup app access token</button>
      </form>
      <form method="post" action="/setup-bots">
        <button type="submit">Setup bots</button>
      </form>
    </>,
  );
});

const Claims = v.object({
  aud: v.string(),
  exp: v.number(),
  iat: v.number(),
  iss: v.string(),
  sub: v.string(),
  azp: v.string(),
  preferred_username: v.string(),
});

app.get("/callback", async (c) => {
  let code = c.req.query("code");
  let state = c.req.query("state");

  if (!state) {
    c.html(<p style="color:red;">STATE MISSING</p>);
  }
  if (!code) {
    c.html(<p style="color:red;">CODE MISSING</p>);
  }

  if (!state || !code) {
    return c.html(
      <>
        {state ? "" : <p style="color:red;">STATE MISSING</p>}
        {code ? "" : <p style="color:red;">CODE MISSING</p>}
      </>,
    );
  }

  let isValidState = verifyState(state);
  if (!isValidState) {
    return c.html(<p style="color:red;">INVALID STATE</p>);
  }

  let url = new URL(c.req.url);

  try {
    const tokens = await generateAuthTokensFromAccessCode({
      code,
      redirectUri: `https://${url.hostname}/callback`,
    });

    const claims = v.parse(Claims, decode(tokens.idToken).payload);

    await setTwitchTokens(claims.sub, {
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

app.post("/bots/snale", async (c) => {
  const { response, body } = await handleTwitchRequest(c);
  if (response) return response;

  const snale = await setupSnaleBot("/bots/snale", c);

  switch (body.subscription.type) {
    case "channel.chat.message": {
      console.log("Received message: ", body.event.message.text);
      await snale.handleChatMessage(body.event);
      break;
    }
  }

  return c.res;
});

app.post("/bots/toxic-man", async (c) => {
  const { response, body } = await handleTwitchRequest(c);
  if (response) return response;

  const toxicMan = await setupToxicMan("/bots/toxic-man", c);

  switch (body.subscription.type) {
    case "channel.chat.message": {
      console.log("Received message: ", body.event.message.text);
      await toxicMan.handleChatMessage(body.event);
      break;
    }
  }

  return c.res;
});
//
app.post("/setup-app-token", async (c) => {
  try {
    const token = await generateAppAccessToken();
    await setAppAccessToken(token);
    return c.redirect(`/?message=Saved app access token.`);
  } catch (error) {
    console.error(error);
    return c.redirect(
      `/?error=An error occurred with retrieving the access token.`,
    );
  }
});

app.post("/setup-bots", async (c) => {
  const snale = await setupSnaleBot("/bots/snale", c);
  const toxic = await setupToxicMan("/bots/toxic-man", c);

  try {
    await snale.registerEventSubListeners();
    await toxic.registerEventSubListeners();
  } catch (error: any) {
    console.error("An error occurred.", JSON.stringify(error));
    return c.json(error);
  }

  return c.redirect(`/?message=Registered%20bots!`);
});

export const handler = handle(app);
