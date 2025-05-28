import { randomBytes } from "node:crypto";

const states = new Map<string, number>();

const STATE_TTL = 10_000; // 10 seconds

export function buildAuthURL(options: { redirectUri: string }) {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");

  url.searchParams.set("client_id", process.env.CLIENT_ID!);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    ["user:read:chat", "user:write:chat", "user:bot", "openid"].join(" "),
  );

  const state = randomOAuthStateString();
  const expiry = Date.now() + STATE_TTL;
  url.searchParams.set("state", state);
  states.set(state, expiry);

  return url.toString();
}

function randomOAuthStateString() {
  return [...randomBytes(16)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

export function verifyState(state: string): boolean {
  const expiry = states.get(state);
  states.delete(state);
  if (!expiry || Date.now() > expiry) {
    return false;
  }
  if (states.size > 0) {
    queueMicrotask(cleanupState);
  }
  return true;
}

function cleanupState() {
  let now = Date.now();
  let toDelete = [];
  for (let [state, expiry] of states) {
    if (now > expiry) toDelete.push(state);
  }

  toDelete.forEach((state) => states.delete(state));
}

export async function getTokenFromCode(options: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
}> {
  let params = new URLSearchParams({
    client_id: process.env.CLIENT_ID!,
    client_secret: process.env.CLIENT_SECRET!,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri,
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (response.status !== 200) {
    console.log("STATUS", response.status);
    console.error("An error was returned from Twitch: ", data);

    throw new Error("Unable to retrieve tokens");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
  };
}

export interface WelcomeMessagePayload {
  session: {
    status: "connected";
    id: string;
    connected_at: string;
    reconnect_url: string | null;
    keepalive_timeout_seconds: number;
  };
}

interface NotificationPayloadBase {
  subscription: {
    id: string;
    type: string;
  };
}

interface ChannelChatMessagePayload extends NotificationPayloadBase {
  subscription: {
    id: string;
    type: "channel.chat.message";
  };
  event: {
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    chatter_user_id: string;
    chatter_user_login: string;
    chatter_user_name: string;
    message: {
      text: string;
      fragments: Array<{
        type: string;
        text: string;
      }>;
    };
    badges: Array<{
      set_id: string;
      id: string;
      info: string;
    }>;
  };
}


export type NotificationPayload = ChannelChatMessagePayload;

// type Message<Type extends string, Payload> = {
//   metadata: {
//     message_type: Type;
//     message_id: string;
//     message_timestamp: string;
//   };
//   payload: Payload;
// };
