import * as SSM from "@aws-sdk/client-ssm";
import { randomBytes } from "crypto";
import { Resource } from "sst";
import * as v from "valibot";
import { authStates } from "./data.js";
import { generateAppAccessToken } from "./twitch.js";

const ssm = new SSM.SSMClient();

export async function verifyState(state: string): Promise<boolean> {
  const { data } = await authStates.get({ state }).go();

  if (!data || Date.now() > data.expiration) {
    return false;
  }

  await authStates.delete({ state }).go();
  queueMicrotask(() => cleanupState);
  return true;
}

async function cleanupState() {
  let now = Date.now();
  const { data } = await authStates.scan
    .where((attr, ops) => ops.lt(attr.expiration, now))
    .go({ pages: "all" });

  if (!data.length) {
    return;
  }

  let { unprocessed } = await authStates.delete(data).go({ pages: "all" });
  if (unprocessed.length) {
    console.error(
      "Some states failed to delete:",
      JSON.stringify(unprocessed, null, 2),
    );
  }
}

function randomOAuthStateString() {
  return [...randomBytes(16)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

const STATE_TTL = 60_000; // 60 seconds

export async function generateState(): Promise<string> {
  const state = randomOAuthStateString();
  const expiration = Date.now() + STATE_TTL;
  await authStates.put({ state, expiration }).go();
  return state;
}

export type Tokens = v.InferOutput<typeof Tokens>;
let Tokens = v.object({
  access: v.string(),
  refresh: v.string(),
});

const tokenParamName = (userID: string) =>
  Resource.AppConfig.TokensBaseSSMPath + userID;

export async function setTwitchTokens(userID: string, tokens: Tokens) {
  const payload: Tokens = {
    access: tokens.access,
    refresh: tokens.refresh,
  };

  await ssm.send(
    new SSM.PutParameterCommand({
      Overwrite: true,
      Type: "SecureString",
      Name: tokenParamName(userID),
      Value: JSON.stringify(payload),
    }),
  );
}

export async function getTwitchTokens(userID: string) {
  const secret = await ssm
    .send(
      new SSM.GetParameterCommand({
        Name: tokenParamName(userID),
        WithDecryption: true,
      }),
    )
    .then((p) => p.Parameter?.Value)
    .catch(() => undefined);

  try {
    return v.parse(Tokens, await JSON.parse(secret || "{}"));
  } catch (error) {
    await ssm.send(
      new SSM.DeleteParameterCommand({ Name: tokenParamName(userID) }),
    ).catch(() => { /* param may not exist */});
    console.error(error);
    throw new Error("Failed to parse Twitch tokens");
  }
}

const appTokenParamName =
  Resource.AppConfig.TokensBaseSSMPath + "app-access-token";
export async function setAppAccessToken(token: string) {
  await ssm.send(
    new SSM.PutParameterCommand({
      Overwrite: true,
      Type: "SecureString",
      Name: appTokenParamName,
      Value: token,
    }),
  );
}

export async function getAppAccessToken(): Promise<string> {
  const secret = await ssm
    .send(
      new SSM.GetParameterCommand({
        Name: appTokenParamName,
        WithDecryption: true,
      }),
    )
    .then((p) => p.Parameter?.Value)
    .catch(() => undefined);

  if (!secret) {
    throw new Error("No app access token saved.");
  }

  return secret;
}

let appToken: string | undefined = undefined;
export async function fetchWithAccessToken(
  req: (token: string) => Request,
): Promise<Response> {
  if (!appToken) appToken = await getAppAccessToken();
  let request = req(appToken);

  console.log(`Sending fetch request to "${request.url}"...`);
  let response = await fetch(request);
  if (response.status === 401) {
    console.warn(
      `Request to "${request.url}" returned unauthorized. Refreshing...`,
    );
    appToken = await generateAppAccessToken();
    await setAppAccessToken(appToken);

    request = req(appToken);
    console.log(`Tokens refreshed! Re-fetching "${request.url}"...`);
    response = await fetch(request);
  }

  console.log(`Response status: "${response.statusText}"`);
  return response;
}
