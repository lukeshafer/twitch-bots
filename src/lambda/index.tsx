import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { buildAuthURL } from "../lib/twitch.js";

const app = new Hono();

app.get("/", (c) => {
  return c.html(<p>Hello JSX</p>);
});

app.get("/auth", async (c) => {
  let url = new URL(c.req.url);
  let authURL = buildAuthURL({
    redirectUri: `https://${url.hostname}/callback`,
  });

  const queries = c.req.query();

  return c.html(
    <>
      {Object.keys(queries).length ? (
        <pre>{JSON.stringify(queries, null, 2)}</pre>
      ) : null}
      <a href={authURL}>Authorize</a>
      <br />
      <a href={`https://${url.hostname}/auth`}>Here</a>
    </>,
  );
});

export const handler = handle(app);
