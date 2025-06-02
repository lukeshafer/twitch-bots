import { Resource } from "sst";
import crypto from "crypto";
import { twitchEvents } from "./data.js";
import * as v from "valibot";
import type { Context } from "hono";

export const Twitch = {
  AuthURL: "https://id.twitch.tv/oauth2/authorize",
  TokenURL: "https://id.twitch.tv/oauth2/token",
  WebsocketURL: "wss://eventsub.wss.twitch.tv/ws",
  ChatMessageURL: "https://api.twitch.tv/helix/chat/messages",
  ValidateAuthURL: "https://id.twitch.tv/oauth2/validate",
  SubscriptionsURL: "https://api.twitch.tv/helix/eventsub/subscriptions",

  MessageTypes: {
    Verification: "webhook_callback_verification",
    Notification: "notification",
    Revocation: "revocation",
  },

  TwitchHeaders: {
    MessageType: "twitch-eventsub-message-type",
    MessageID: "twitch-eventsub-message-id",
    MessageTimestamp: "twitch-eventsub-message-timestamp",
    MessageSignature: "twitch-eventsub-message-signature",
    MessageRetry: "twitch-eventsub-message-retry",
    SubscriptionType: "twitch-eventsub-subscription-type",
    SubscriptionVersion: "twitch-eventsub-subscription-version",
  },
} as const;

export function createAuthURL(options: {
  clientID: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");

  url.searchParams.set("client_id", options.clientID);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    ["user:read:chat", "user:write:chat", "user:bot", "openid"].join(" "),
  );

  return url.toString();
}

export async function generateAuthTokensFromAccessCode(options: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
}> {
  let params = new URLSearchParams({
    client_id: Resource.TwitchClientID.value,
    client_secret: Resource.TwitchClientSecret.value,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri,
  });

  const response = await fetch(Twitch.TokenURL, {
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

export interface ChannelChatMessagePayload {
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

interface TwitchRequest {
  headers: Record<string, string | undefined>;
  body?: string | undefined;
}

function verifyTwitchRequest(request: TwitchRequest) {
  try {
    const secret = Resource.TwitchClientSecret.value;
    const message = getHmacMessage(request);
    const hmac = getHmac(secret, message);

    const messageSignature =
      request.headers[Twitch.TwitchHeaders.MessageSignature];

    if (messageSignature && verifyMessage(hmac, messageSignature)) {
      return true;
    }
  } catch (e) {
    console.error(e);
    return false;
  }
  return false;
}

function getHmacMessage({ headers, body }: TwitchRequest): string {
  const messageId = headers[Twitch.TwitchHeaders.MessageID];
  const messageTimestamp = headers[Twitch.TwitchHeaders.MessageTimestamp];
  const messageBody = body ?? "";

  if (!messageId || !messageTimestamp) {
    throw new Error("Missing message headers");
  }

  const message = messageId + messageTimestamp + messageBody;
  return message;
}

function getHmac(secret: string, message: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(message).digest("hex")}`;
}

function verifyMessage(hmac: string, verifySignature: string) {
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(verifySignature),
  );
}

function parseTwitchHeaders(headers: Record<string, string | undefined>) {
  return {
    messageType: headers[Twitch.TwitchHeaders.MessageType],
    messageId: headers[Twitch.TwitchHeaders.MessageID],
    messageTimestamp: headers[Twitch.TwitchHeaders.MessageTimestamp],
    messageSignature: headers[Twitch.TwitchHeaders.MessageSignature],
    messageRetry: headers[Twitch.TwitchHeaders.MessageRetry],
    subscriptionType: headers[Twitch.TwitchHeaders.SubscriptionType],
    subscriptionVersion: headers[Twitch.TwitchHeaders.SubscriptionVersion],
  };
}

async function checkIsDuplicateTwitchEventMessageID(
  messageId: string,
  messageTimestamp: string,
): Promise<boolean> {
  const { data } = await twitchEvents.get({ message_id: messageId }).go();

  if (data == null) {
    await twitchEvents
      .put({ message_id: messageId, message_timestamp: messageTimestamp })
      .go();
    return false;
  } else {
    return true;
  }
}

export async function handleTwitchRequest(c: Context): Promise<
  | {
      response: Response;
      body: null;
    }
  | {
      response: null;
      body: TwitchEventBody;
    }
> {
  let bodyText = await c.req.text();

  if (!verifyTwitchRequest({ headers: c.req.header(), body: bodyText })) {
    console.error("Message not verified");
    c.status(403);
    return { response: c.res, body: null };
  }

  if (!bodyText) {
    console.error("No event body.");
    c.status(400);
    return { response: c.res, body: null };
  }

  console.log("Message received from Twitch. Determining type...");

  const { messageType, messageId, messageTimestamp } = parseTwitchHeaders(
    c.req.header(),
  );

  if (!messageId || !messageTimestamp) {
    console.error("No message ID");
    c.status(400);
    return { response: c.res, body: null };
  }

  const isDuplicateEvent = await checkIsDuplicateTwitchEventMessageID(
    messageId,
    messageTimestamp,
  );
  if (isDuplicateEvent) {
    console.error("Duplicate message: ", messageId);
    return { response: c.res, body: null };
  }

  console.log("Message type: ", messageType);
  if (messageType === Twitch.MessageTypes.Verification) {
    const { success, output } = v.safeParse(
      VerificationMessage,
      JSON.parse(bodyText),
    );
    if (!success) {
      console.error("Invalid verification request");
      c.status(400);
      return { response: c.res, body: null };
    }

    return {
      response: c.text(output.challenge),
      body: null,
    };
  }

  if (messageType !== Twitch.MessageTypes.Notification) {
    console.error(
      "Invalid message type: must be notification.",
      JSON.stringify({ messageType }),
    );

    c.status(400);
    return { response: c.res, body: null };
  }

  const body = v.parse(TwitchEventBody, JSON.parse(bodyText));

  return { response: null, body };
}

const VerificationMessage = v.object({
  challenge: v.string(),
});

export type TwitchEventBody = v.InferOutput<typeof TwitchEventBody>;
const TwitchEventBody = v.intersect([
  v.object({
    challenge: v.optional(v.string()),
    subscription: v.object({
      id: v.string(),
      version: v.string(),
      status: v.string(),
      cost: v.number(),
      condition: v.optional(
        v.object({
          broadcaster_user_id: v.string(),
        }),
      ),
      transport: v.optional(
        v.object({
          method: v.string(),
          callback: v.string(),
        }),
      ),
      created_at: v.string(),
    }),
  }),
  v.union([
    v.object({
      subscription: v.object({
        type: v.literal("channel.chat.message"),
      }),
      event: v.object({
        broadcaster_user_id: v.string(),
        broadcaster_user_login: v.string(),
        broadcaster_user_name: v.string(),
        chatter_user_id: v.string(),
        chatter_user_login: v.string(),
        chatter_user_name: v.string(),
        message_id: v.string(),
        message: v.object({
          text: v.string(),
          fragments: v.array(
            v.object({
              type: v.string(),
              text: v.string(),
            }),
          ),
        }),
        badges: v.array(
          v.object({
            set_id: v.string(),
            id: v.string(),
            info: v.string(),
          }),
        ),
      }),
    }),
  ]),
]);

export async function generateAppAccessToken(): Promise<string> {
  const response = await fetch(Twitch.TokenURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: Resource.TwitchClientID.value,
      client_secret: Resource.TwitchClientSecret.value,
      grant_type: "client_credentials",
    }).toString(),
  });

  const data = await response.json();

  if (response.status !== 200) {
    console.log("STATUS", response.status);
    console.error("An error was returned from Twitch: ", data);

    throw new Error("Unable to retrieve tokens");
  }

  return data.access_token;
}
