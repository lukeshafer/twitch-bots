import type { Tokens } from "../db/index.js";
import type { NotificationPayload } from "./twitch.js";
import { randomItem } from "./utils.js";

export type MessageOptions = {
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
  botUserID: string;
  channelUserID: string;
  tokens: Tokens;
  clientID: string;
  clientSecret: string;
  commands?: Commands;
  color?: (typeof Format.FgColors)[number];

  onTokenRefresh?: (tokens: Tokens) => Promise<any>;
  onMessage?: (options: MessageOptions) => any;
  onCommandMissing?: (
    options: MessageOptions,
  ) => string | null | Promise<string | null>;
};

export class TwitchBot {
  static readonly WebsocketURL = "wss://eventsub.wss.twitch.tv/ws";
  static readonly ChatMessageURL = "https://api.twitch.tv/helix/chat/messages";
  static readonly ValidateAuthURL = "https://id.twitch.tv/oauth2/validate";
  static readonly TokenURL = "https://id.twitch.tv/oauth2/token";
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
  #color: string;

  #clientID: string;
  #clientSecret: string;

  #onMessage?: ((options: MessageOptions) => any) | undefined;
  set onMessage(value: ((options: MessageOptions) => any) | undefined) {
    this.#onMessage = value;
  }

  #onCommandMissing?:
    | ((options: MessageOptions) => string | null | Promise<string | null>)
    | undefined;
  set onCommandMissing(
    value:
      | ((options: MessageOptions) => string | null | Promise<string | null>)
      | undefined,
  ) {
    this.#onCommandMissing = value;
  }

  #onTokenRefresh?: ((tokens: Tokens) => Promise<any>) | undefined;
  set onTokenRefresh(value: ((tokens: Tokens) => Promise<any>) | undefined) {
    this.#onTokenRefresh = value;
  }

  constructor(options: TwitchBotOptions) {
    this.name = options.name;
    this.tokens = options.tokens;
    this.userID = options.botUserID;
    this.commands = options.commands ?? {};
    this.channelUserID = options.channelUserID;
    this.#clientID = options.clientID;
    this.#clientSecret = options.clientSecret;

    if (options.color) {
      this.#color = Format[options.color];
    } else {
      this.#color = Format.RandomFG;
    }

    this.onMessage = options.onMessage;
    this.onCommandMissing = options.onCommandMissing;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  get #logprefix() {
    return `${this.#color}<${this.name}>${Format.Reset} `;
  }

  log(...args: any) {
    console.log(this.#logprefix, ...args);
  }
  error(...args: any) {
    console.error(this.#logprefix, ...args);
  }
  warn(...args: any) {
    console.warn(this.#logprefix, ...args);
  }
  debug(...args: any){
    if (process.env.NODE_DEBUG !== "1") return
    console.debug(this.#logprefix, ...args);
  }

  async authenticate(): Promise<boolean> {
    let response = await this.fetchWithTokenRefresh(
      () =>
        new Request(TwitchBot.ValidateAuthURL, {
          method: "GET",
          headers: { Authorization: "OAuth " + this.tokens.access },
        }),
    );

    if (response.status !== 200) {
      let data = await response.json();
      this.error(
        "Token is not valid. /oauth2/validate returned status code",
        response.status,
      );
      this.error(data);
      return false;
      process.exit(1);
    }

    return true;
  }

  #ws?: WebSocket;
  #startWS() {
    this.#ws = new WebSocket(TwitchBot.WebsocketURL);
    this.#ws.onerror = this.error;

    this.#ws.onopen = () => {
      this.log("Bot Websocket connection opened to", TwitchBot.WebsocketURL);
    };

    this.#ws.onclose = (event) => {
      this.log(
        Format.FgYellow + `Bot Websocket connection closed: "${event.reason}"` + Format.Reset,
      );
    };

    this.#ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.debug(JSON.stringify(data, null, 2))

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

              this.#onMessage?.(msgOptions);
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

  start() {
    this.authenticate().then(() => this.#startWS());
  }

  stop(code?: number, reason?: string) {
    this.#ws?.close(code, reason);
  }

  async #registerEventSubListeners() {
    // Register channel.chat.message
    let response = await this.fetchWithTokenRefresh(
      () =>
        new Request("https://api.twitch.tv/helix/eventsub/subscriptions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.tokens.access,
            "Client-Id": this.#clientID,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "channel.chat.message",
            version: "1",
            condition: {
              broadcaster_user_id: this.channelUserID,
              user_id: this.userID,
            },
            transport: {
              method: "websocket",
              session_id: this.#websocketSessionID,
            },
          }),
        }),
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
      if (this.#onCommandMissing != undefined) {
        return this.#onCommandMissing(options);
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
    let response = await this.fetchWithTokenRefresh(
      () =>
        new Request(TwitchBot.ChatMessageURL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.tokens.access,
            "Client-Id": this.#clientID,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: msg,
            sender_id: this.userID,
            broadcaster_id: this.channelUserID,
          }),
        }),
    );

    if (response.status !== 200) {
      let data = await response.json();
      this.error("Failed to send chat message");
      this.error(data);
    } else {
      this.log("Sent chat message:", msg);
    }
  }

  async #refreshTokens(): Promise<boolean> {
    const prevRefresh = this.tokens.refresh;

    const params = new URLSearchParams({
      client_id: this.#clientID,
      client_secret: this.#clientSecret,
      grant_type: "refresh_token",
      refresh_token: prevRefresh,
    });

    const response = await fetch(TwitchBot.TokenURL, {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.status !== 200) {
      let data = await response.text();
      this.error("Failed to send chat message");
      this.error(data);

      return false;
    }

    let body = await response.json();

    const newAccess: string = body.access_token;
    const newRefresh: string = body.refresh_token;

    await this.#onTokenRefresh?.({
      access: newAccess,
      refresh: newRefresh,
    });

    this.tokens.access = newAccess;
    this.tokens.refresh = newRefresh;

    return true;
  }

  #fetchID = 0;
  async fetchWithTokenRefresh(req: () => Request): Promise<Response> {
    let fetchID = (this.#fetchID++).toString().padStart(4, "0");
    let requestColor = Format.FgGray;
    let request = req();

    const logstr = (str: string) =>
      `${requestColor}Fetch ${fetchID} ${str} ${Format.Reset}`;

    this.log(logstr(`Sending fetch request to "${request.url}"...`));
    let resp = await fetch(request);
    if (resp.status === 401) {
      this.warn(
        logstr(
          `Request to "${request.url}" returned unauthorized. Refreshing...`,
        ),
      );
      let success = await this.#refreshTokens();
      if (success) {
        this.log(logstr(`Tokens refreshed! Re-fetching...`));
        resp = await fetch(req());
      } else {
        this.error(logstr("Unable to refresh token!"));
      }
    }

    this.log(logstr(`Response status: "${resp.statusText}"`));

    return resp;
  }

  getCommandsList = (): Array<{ name: string; text: string }> =>
    Object.entries(this.commands).map(([name, text]) => ({
      name,
      text: typeof text === "string" ? text : "[ Dynamic command action. ]",
    }));
}

class Format {
  static readonly Reset = "\x1b[0m";
  static readonly Bright = "\x1b[1m";
  static readonly Dim = "\x1b[2m";
  static readonly Underscore = "\x1b[4m";
  static readonly Blink = "\x1b[5m";
  static readonly Reverse = "\x1b[7m";
  static readonly Hidden = "\x1b[8m";

  static readonly FgBlack = "\x1b[30m";
  static readonly FgRed = "\x1b[31m";
  static readonly FgGreen = "\x1b[32m";
  static readonly FgYellow = "\x1b[33m";
  static readonly FgBlue = "\x1b[34m";
  static readonly FgMagenta = "\x1b[35m";
  static readonly FgCyan = "\x1b[36m";
  static readonly FgWhite = "\x1b[37m";
  static readonly FgGray = "\x1b[90m";

  static readonly BgBlack = "\x1b[40m";
  static readonly BgRed = "\x1b[41m";
  static readonly BgGreen = "\x1b[42m";
  static readonly BgYellow = "\x1b[43m";
  static readonly BgBlue = "\x1b[44m";
  static readonly BgMagenta = "\x1b[45m";
  static readonly BgCyan = "\x1b[46m";
  static readonly BgWhite = "\x1b[47m";
  static readonly BgGray = "\x1b[100m";

  static FgColors = [
    "FgRed",
    "FgBlue",
    "FgCyan",
    // "FgGray",
    // "FgBlack",
    "FgGreen",
    "FgWhite",
    "FgYellow",
    "FgMagenta",
  ] as const satisfies Array<keyof typeof Format>;

  static BgColors = [
    "BgRed",
    "BgBlue",
    "BgCyan",
    "BgGray",
    "BgBlack",
    "BgGreen",
    "BgWhite",
    "BgYellow",
    "BgMagenta",
  ] as const satisfies Array<keyof typeof Format>;

  static get RandomFG() {
    return Format[randomItem(Format.FgColors)];
  }

  static get RandomBG() {
    return Format[randomItem(Format.BgColors)];
  }
}

