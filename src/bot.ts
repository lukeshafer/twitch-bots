import { getTokens, type Tokens } from "./db/index.js";

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

  return tokens
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
      case "session_welcome": // First message you get from the WebSocket server when connecting
        websocketSessionID = data.payload.session.id; // Register the Session ID it gives us

        // Listen to EventSub, which joins the chatroom from your bot's account
        registerEventSubListeners(tokens);
        break;
      case "notification": // An EventSub notification has occurred, such as channel.chat.message
        switch (data.metadata.subscription_type) {
          case "channel.chat.message":
            console.log("EVENT", JSON.stringify(data, null, 2))
            // First, print the message to the program's console.
            console.log(
              `MSG #${data.payload.event.broadcaster_user_login} <${data.payload.event.chatter_user_login}> ${data.payload.event.message.text}`,
            );

            // Then check to see if that message was "HeyGuys"
            if (data.payload.event.message.text.trim() == "HeyGuys") {
              sendChatMessage("HELLO DINGUS", tokens);
            }
            break;
        }
        break;
    }
  };
}

async function sendChatMessage(chatMessage: string, tokens: Tokens) {
  let response = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + tokens.access,
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

async function registerEventSubListeners(tokens: Tokens) {
  // Register channel.chat.message
  let response = await fetch(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokens.access,
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
