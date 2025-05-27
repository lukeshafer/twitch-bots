import type { Tokens } from "../db/index.js";
import type { NotificationPayload } from "../twitch.js";

type MessageOptions = {
  message: string;
  chatter: { id: string; login: string };
  broadcaster: { id: string; login: string };
  badges: Array<{ type: string }>;
};

type CommandAction =
  | string
  | ((options: MessageOptions) => string | null | Promise<string | null>);

type Commands = Record<string, CommandAction | undefined>;

type TwitchBotOptions = {
  name: string;
  tokens: Tokens;
  botUserID: string;
  channelUserID: string;
  commands?: Commands;

  onMessage?: (options: MessageOptions) => any;
  onCommandMissing?: (
    options: MessageOptions,
  ) => string | null | Promise<string | null>;
  // onTokenRefresh: (tokens: Tokens) => unknown;
};

export class TwitchBot {
  static readonly WebsocketURL = "wss://eventsub.wss.twitch.tv/ws";
  static readonly ChatMessageURL = "https://api.twitch.tv/helix/chat/messages";
  static readonly ValidateAuthURL = "https://id.twitch.tv/oauth2/validate";
  static readonly CommandPrefix = "!";

  static checkIsModerator(options: MessageOptions): boolean {
    if (options.broadcaster.id === options.chatter.id) return true;

    if (
      options.badges.some(
        (b) => b.type === "moderator" || b.type === "broadcaster",
      )
    )
      return true;

    return false;
  }

  name: string;
  tokens: Tokens;
  userID: string;
  channelUserID: string;
  commands: Commands;
  #websocketSessionID?: string;

  #messageHandler?: (options: MessageOptions) => any;
  #commandMissingHandler?: (
    options: MessageOptions,
  ) => string | null | Promise<string | null>;

  constructor(options: TwitchBotOptions) {
    this.name = options.name;
    this.tokens = options.tokens;
    this.userID = options.botUserID;
    this.commands = options.commands ?? {};
    this.channelUserID = options.channelUserID;

    this.#messageHandler = options.onMessage;
    this.#commandMissingHandler = options.onCommandMissing;
  }

  log(...args: any) {
    console.log(`<${this.name}> `, ...args);
  }
  error(...args: any) {
    console.error(`<${this.name}> `, ...args);
  }

  async authenticate(): Promise<boolean> {
    let response = await fetch(TwitchBot.ValidateAuthURL, {
      method: "GET",
      headers: { Authorization: "OAuth " + this.tokens.access },
    });

    if (response.status !== 200) {
      let data = await response.json();
      this.error(
        "Token is not valid. /oauth2/validate returned status code",
        response.status,
      );
      this.error(data);
      return false;
      // process.exit(1);
    }

    return true;
  }

  start() {
    let ws = new WebSocket(TwitchBot.WebsocketURL);
    ws.onerror = this.error;

    ws.onopen = () => {
      this.log("Bot Websocket connection opened to", TwitchBot.WebsocketURL);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.metadata.message_type) {
        case "session_welcome":
          // First message you get from the WebSocket server when connecting
          this.#websocketSessionID = data.payload.session.id; // Register the Session ID it gives us

          // Listen to EventSub, which joins the chatroom from your bot's account
          this.#registerEventSubListeners();
          break;
        case "notification": {
          const { subscription, event }: NotificationPayload = data.payload;

          // An EventSub notification has occurred, such as channel.chat.message
          switch (subscription.type) {
            case "channel.chat.message":
              this.log(
                `MSG #${event.broadcaster_user_login} <${event.chatter_user_login}> ${event.message.text}`,
              );

              const msgOptions: MessageOptions = {
                message: event.message.text.trim(),
                broadcaster: {
                  id: event.broadcaster_user_id,
                  login: event.broadcaster_user_name,
                },
                chatter: {
                  id: event.chatter_user_id,
                  login: event.chatter_user_login,
                },
                badges: event.badges.map((b) => ({ type: b.set_id })),
              };

              this.#messageHandler?.(msgOptions);
              this.#handleCommand(msgOptions).then((result) => {
                if (result != null) this.sendMessage(result);
              });

              break;
          }
          break;
        }
      }
    };
  }

  async #registerEventSubListeners() {
    // Register channel.chat.message
    let response = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.tokens.access,
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
            session_id: this.#websocketSessionID,
          },
        }),
      },
    );

    if (response.status != 202) {
      let data = await response.json();
      this.error(
        "Failed to subscribe to channel.chat.message. API call returned status code " +
          response.status,
      );
      this.error(data);
      process.exit(1);
    } else {
      const data = await response.json();
      this.log(`Subscribed to channel.chat.message [${data.data[0].id}]`);
    }
  }

  async #handleCommand(options: MessageOptions): Promise<string | null> {
    if (!options.message.length) return null;
    const cmd = TwitchBot.parseCommand(options.message);
    if (!cmd) return null;

    const action = this.commands[cmd.name];

    if (action == undefined) {
      if (this.#commandMissingHandler != undefined) {
        return this.#commandMissingHandler(options);
      } else {
        return null;
      }
    }

    if (typeof action === "string") return action;
    else return action({ ...options, message: cmd.text });
  }

  static parseCommand(input: string): { name: string; text: string } | null {
    const [command, ...msg] = input.split(" ").filter((s) => s.length > 0);
    if (!command.startsWith(TwitchBot.CommandPrefix)) return null;

    return {
      name: command.slice(1).toLowerCase(),
      text: msg.join(" "),
    };
  }

  async sendMessage(msg: string) {
    let response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access,
        "Client-Id": process.env.CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_id: process.env.CHAT_CHANNEL_USER_ID,
        sender_id: process.env.BOT_USER_ID,
        message: msg,
      }),
    });

    if (response.status !== 200) {
      let data = await response.json();
      this.error("Failed to send chat message");
      this.error(data);
    } else {
      this.log("Sent chat message:", msg);
    }
  }
}
