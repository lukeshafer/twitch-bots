import { handleCommand } from "./commands.js";
import { getTokens, type Tokens } from "./db/index.js";
import type { NotificationPayload, WelcomeMessagePayload } from "./twitch.js";

let websocketSessionID: string;
const TWITCH_WEBSOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";

export async function startBot() {
  const tokens = await getTokens(process.env.BOT_USER_ID);
  await validateAuth(tokens);
  startWebSocketClient(tokens);
}

async function validateAuth(tokens: Tokens): Promise<Tokens> {
  let response = await fetch("https://id.twitch.tv/oauth2/validate", {
    method: "GET",
    headers: { Authorization: "OAuth " + tokens.access },
  });

  if (response.status !== 200) {
    let data = await response.json();
    console.error(
      "Token is not valid. /oauth2/validate returned status code",
      response.status,
    );
    console.error(data);
    process.exit(1);
  }

  return tokens;
}

function startWebSocketClient(tokens: Tokens) {
  let ws = new WebSocket(TWITCH_WEBSOCKET_URL);
  ws.onerror = console.error;

  ws.onopen = () => {
    console.log("Bot Websocket connection opened to", TWITCH_WEBSOCKET_URL);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.metadata.message_type) {
      case "session_welcome": {
        const payload: WelcomeMessagePayload = data.payload;
        // First message you get from the WebSocket server when connecting
        websocketSessionID = payload.session.id; // Register the Session ID it gives us

        // Listen to EventSub, which joins the chatroom from your bot's account
        registerEventSubListeners(tokens.access);
        break;
      }
      case "notification": {
        const payload: NotificationPayload = data.payload;

        // An EventSub notification has occurred, such as channel.chat.message
        switch (payload.subscription.type) {
          case "channel.chat.message":
            // console.log("Message Payload", JSON.stringify(payload, null, 2));
            console.log(
              `MSG #${payload.event.broadcaster_user_login} <${payload.event.chatter_user_login}> ${payload.event.message.text}`,
            );

            handleCommand({
              message: payload.event.message.text.trim(),
              broadcaster: {
                id: payload.event.broadcaster_user_id,
                login: payload.event.broadcaster_user_name,
              },
              chatter: {
                id: payload.event.chatter_user_id,
                login: payload.event.chatter_user_login,
              },
              badges: payload.event.badges.map((b) => ({ type: b.set_id })),
            }).then((result) => {
              if (result != null) sendChatMessage(result, tokens.access);
            });

            break;
        }
        break;
      }
    }
  };
}

async function sendChatMessage(chatMessage: string, accessToken: string) {
  let response = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Client-Id": process.env.CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: process.env.CHAT_CHANNEL_USER_ID,
      sender_id: process.env.BOT_USER_ID,
      message: chatMessage,
    }),
  });

  if (response.status !== 200) {
    let data = await response.json();
    console.error("Failed to send chat message");
    console.error(data);
  } else {
    console.log("Sent chat message:", chatMessage);
  }
}

async function registerEventSubListeners(accessToken: string) {
  // Register channel.chat.message
  let response = await fetch(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Client-Id": process.env.CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: process.env.CHAT_CHANNEL_USER_ID,
          user_id: process.env.BOT_USER_ID,
        },
        transport: {
          method: "websocket",
          session_id: websocketSessionID,
        },
      }),
    },
  );

  if (response.status != 202) {
    let data = await response.json();
    console.error(
      "Failed to subscribe to channel.chat.message. API call returned status code " +
        response.status,
    );
    console.error(data);
    process.exit(1);
  } else {
    const data = await response.json();
    console.log(`Subscribed to channel.chat.message [${data.data[0].id}]`);
  }
}
