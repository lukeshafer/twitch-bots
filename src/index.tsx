import { Hono } from "hono";
import * as v from "valibot";
import { decode } from "hono/jwt";
import { handle } from "hono/aws-lambda";
import {
  setSession,
  generateState,
  setTwitchTokens,
  verifyState,
  getSession,
} from "./auth.js";
import {
  createAuthURL,
  generateAuthTokensFromAccessCode,
  handleTwitchRequest,
} from "./twitch.js";
import { Resource } from "sst";
import { setupSnaleBot } from "./snale/bot.js";
import { setupToxicMan } from "./toxic-man/bot.js";
import { commands } from "./data.js";
import { serveStatic } from "@hono/node-server/serve-static";
import { For, Show } from "./components/utils.js";

const app = new Hono();

app.get("/", async (c) => {
  const dbCommands = await commands.scan.go({ pages: "all" }).then(({ data }) =>
    data.map((cmd) => ({
      name: cmd.name,
      text: cmd.text,
    })),
  );

  const snaleCommands = await setupSnaleBot()
    .then((bot) => bot.getCommandsList())
    .catch(() => []);

  const toxicCommands = await setupToxicMan()
    .then((bot) => bot.getCommandsList())
    .catch(() => []);

  const userID = await getSession(c);

  return c.html(
    <html>
      <head>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <Show when={userID}>
          <p>Logged in as {userID}</p>
        </Show>
        <For
          each={Object.entries(c.req.query())}
          child={([key, value]) => (
            <p
              style={
                key.toLowerCase().includes("error") ? "color: red;" : undefined
              }
            >
              <b>{key}</b>: {value}
            </p>
          )}
        />

        <form method="post" action="/auth/login">
          <button type="submit">Login</button>
        </form>
        <Show when={userID === Resource.AppConfig.BroadcasterUserID}>
          <form method="post" action="/refresh">
            <button type="submit">Refresh</button>
          </form>
        </Show>
        <div>
          <header>
            <h1>Commands from DB</h1>
          </header>
          <table>
            <thead style="opacity: 0.75;">
              <tr>
                <td>Source</td>
                <td>Command</td>
                <td>Text</td>
              </tr>
            </thead>
            <tbody>
              {dbCommands.map(({ name, text }) => (
                <tr>
                  <td>db</td>
                  <td>!{name}</td>
                  <td>{text}</td>
                </tr>
              ))}
              {snaleCommands.map(({ name, text }) => (
                <tr>
                  <td>Snale Bot</td>
                  <td>!{name}</td>
                  <td>{text}</td>
                </tr>
              ))}
              {toxicCommands.map(({ name, text }) => (
                <tr>
                  <td>Toxic Man</td>
                  <td>!{name}</td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </body>
    </html>,
  );
});

app.use("*", serveStatic({ root: "./public" }));

app.post("/auth/login", async (c) => {
  let authURL = createAuthURL({
    state: await generateState(),
    clientID: Resource.TwitchClientID.value,
    redirectUri: `${Resource.ApiRouter.url}/auth/callback`,
  });

  return c.redirect(authURL);
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

app.get("/auth/callback", async (c) => {
  let code = c.req.query("code");
  let state = c.req.query("state");

  if (!state) {
    c.html(<p style="color:red;">STATE MISSING</p>);
  }
  if (!code) {
    c.html(<p style="color:red;">CODE MISSING</p>);
  }

  if (!state || !code) {
    const params = new URLSearchParams({
      error: (state ? "" : "STATE MISSING ") + (code ? "" : "CODE MISSING"),
    });
    return c.redirect(`/?` + params.toString());
  }

  let isValidState = await verifyState(state);
  if (!isValidState) {
    const params = new URLSearchParams({
      error: "INVALID STATE",
    });
    return c.redirect(`/?` + params.toString());
  }

  try {
    const tokens = await generateAuthTokensFromAccessCode({
      code,
      redirectUri: `${Resource.ApiRouter.url}/auth/callback`,
    });

    const tokensToSave = {
      access: tokens.accessToken,
      refresh: tokens.refreshToken,
    };

    const claims = v.parse(Claims, decode(tokens.idToken).payload);
    const params = new URLSearchParams();

    switch (claims.sub) {
      case Resource.AppConfig.ToxicUserID:
        await setTwitchTokens(claims.sub, tokensToSave);
        await setupToxicMan().then((bot) => bot.registerEventSubListeners());
        params.set(
          "Success",
          "Tokens saved, eventsub listeners registered for Toxic Man!",
        );
        break;

      case Resource.AppConfig.SnaleUserID:
        await setTwitchTokens(claims.sub, tokensToSave);
        await setupSnaleBot().then((bot) => bot.registerEventSubListeners());
        params.set(
          "Success",
          "Tokens saved, eventsub listeners registered for Snale Bot!",
        );
        break;

      case Resource.AppConfig.BroadcasterUserID:
        await setTwitchTokens(claims.sub, tokensToSave);
        // await generateAppAccessToken().then(setAppAccessToken);
        params.set("notice", "Refreshed App Access Token!");
        break;

      default: {
        console.error("Not an approved user!", JSON.stringify(claims));
        params.set(
          "Error",
          `Not an approved user: ${claims.sub} (${claims.preferred_username})`,
        );
        break;
      }
    }

    if (claims.sub) {
      console.log("Setting session");
      await setSession(c, claims.sub);
    }
    return c.redirect(`/?${params.toString()}`);
  } catch (e: any) {
    console.error(e);
    return c.text(e.message);
  }
});

app.post("/bots/snale", async (c) => {
  const { response, body } = await handleTwitchRequest(c);
  if (response) return response;

  const snale = await setupSnaleBot();
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

  const toxicMan = await setupToxicMan();
  switch (body.subscription.type) {
    case "channel.chat.message": {
      console.log("Received message: ", body.event.message.text);
      await toxicMan.handleChatMessage(body.event);
      break;
    }
  }

  return c.res;
});

app.post("/refresh", async (c) => {
  const session = await getSession(c);
  if (session == null || session !== Resource.AppConfig.BroadcasterUserID) {
    return c.redirect(`/?error=unauthorized!!`);
  }

  await setupSnaleBot().then((bot) => bot.registerEventSubListeners());
  await setupToxicMan().then((bot) => bot.registerEventSubListeners());

  return c.redirect(`/?msg=Refreshed%20bots`);
});

export const handler = handle(app);
