import { fetchWithAccessToken, type Tokens } from "./auth.js";
import { Twitch, type TwitchEventBody } from "./twitch.js";
import { Format } from "./utils.js";
import * as v from "valibot";

export type MessageOptions = {
  message: string;
  messageID: string;
  chatter: { id: string; login: string };
  broadcaster: { id: string; login: string };
  badges: Array<{ type: string }>;
};

type SendMessageOptions = {
  replyTo?: string;
};

export type BotMessageOutput = InstanceType<
  (typeof TwitchBot)["Message"]
> | null;
type CommandActionCallback = (
  options: MessageOptions,
) => BotMessageOutput | Promise<BotMessageOutput>;
type CommandAction = string | CommandActionCallback;

type Commands = Record<string, CommandAction | undefined>;

type TwitchBotInit = {
  name: string;
  botUserID: string;
  botUsername: string;
  channelUserID: string;
  tokens: Tokens;
  clientID: string;
  clientSecret: string;
  commandPrefix?: string;
  webhookCallback: string;
  commands?: Commands;
  logColor: (typeof Format.FgColors)[number];

  onTokenRefresh?: (tokens: Tokens) => Promise<any>;
  onMessage?: CommandActionCallback;
  onCommandMissing?: CommandActionCallback;
};

export class TwitchBot {
  static Message = class BotMessage {
    message: string;
    replyToID?: string;
    constructor(payload: string | { message: string; replyToID?: string }) {
      if (typeof payload === "string") {
        this.message = payload;
      } else {
        this.message = payload.message;
        this.replyToID = payload.replyToID;
      }
    }
  };
  name: string;
  tokens: Tokens;

  #logColor: string;
  userID: string;
  username: string;
  #clientID: string;
  commands: Commands;
  channelUserID: string;
  #clientSecret: string;
  commandPrefix: string;
  webhookCallback: string;

  onMessage?: (options: MessageOptions) => unknown;
  onCommandMissing?: CommandActionCallback;
  onTokenRefresh?: ((tokens: Tokens) => Promise<any>) | undefined;

  constructor(options: TwitchBotInit) {
    this.name = options.name;
    this.tokens = options.tokens;
    this.userID = options.botUserID;
    this.username = options.botUsername;
    this.commands = options.commands ?? {};
    this.channelUserID = options.channelUserID;
    this.#clientID = options.clientID;
    this.#clientSecret = options.clientSecret;
    this.commandPrefix = options.commandPrefix || "!";
    this.webhookCallback = options.webhookCallback;

    this.#logColor = Format[options.logColor];

    this.onMessage = options.onMessage;
    this.onCommandMissing = options.onCommandMissing;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  get #logprefix() {
    return `${this.#logColor}<${this.name}>${Format.Reset} `;
  }

  log = (...args: any) => console.log(this.#logprefix, ...args);
  error = (...args: any) => console.error(this.#logprefix, ...args);
  warn = (...args: any) => console.warn(this.#logprefix, ...args);
  debug = (...args: any) =>
    process.env.TWITCHBOTS_DEBOG === "true"
      ? console.debug(this.#logprefix, ...args)
      : undefined;

  async handleChatMessage(event: TwitchEventBody["event"]) {
    this.debug(
      `MSG #${event.broadcaster_user_login} <${event.chatter_user_login}> ${event.message.text}`,
    );

    const msgOptions: MessageOptions = {
      messageID: event.message_id,
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

    await this.onMessage?.(msgOptions);
    await this.handleCommand(msgOptions).then((res) => {
      if (!res) return;
      return this.sendMessage(res.message, { replyTo: res.replyToID });
    });
  }

  async handleCommand(options: MessageOptions): Promise<BotMessageOutput> {
    if (!options.message.length) return null;
    const cmd = this.parseCommand(options.message);
    if (!cmd) return null;

    this.debug("Command detected: ", JSON.stringify({ cmd }));

    const action = this.commands[cmd.name];

    if (action == undefined) {
      this.debug("Invalid command:", "!" + cmd.name);
      return this.onCommandMissing?.(options) ?? null;
    }

    if (typeof action === "string")
      return new TwitchBot.Message({ message: action });
    else return action({ ...options, message: cmd.text });
  }

  parseCommand(input: string) {
    const [command, ...msg] = input.split(" ").filter((s) => s.length > 0);
    if (!command.startsWith(this.commandPrefix)) return null;

    return {
      name: command.slice(1).toLowerCase(),
      text: msg.join(" "),
    };
  }

  async sendMessage(msg: string, options?: SendMessageOptions) {
    let body: Record<string, any> = {
      message: msg,
      sender_id: this.userID,
      broadcaster_id: this.channelUserID,
    };

    if (options?.replyTo) body.reply_parent_message_id = options.replyTo;

    let response = await this.fetchWithTokenRefresh(
      () =>
        new Request(Twitch.ChatMessageURL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.tokens.access,
            "Client-Id": this.#clientID,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
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

  async #refreshTokens(): Promise<boolean> {
    const prevRefresh = this.tokens.refresh;

    const params = new URLSearchParams({
      client_id: this.#clientID,
      client_secret: this.#clientSecret,
      grant_type: "refresh_token",
      refresh_token: prevRefresh,
    });

    const response = await fetch(Twitch.TokenURL, {
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

    await this.onTokenRefresh?.({
      access: newAccess,
      refresh: newRefresh,
    });

    this.tokens.access = newAccess;
    this.tokens.refresh = newRefresh;

    return true;
  }

  async registerEventSubListeners() {
    const subs = await this.#getExistingEventSubListeners();

    const subsToDelete = subs.filter(
      (s) =>
        s.type === "channel.chat.message" &&
        s.status === "enabled" &&
        s.transport.callback !== this.webhookCallback,
    );

    for (let s of subsToDelete) {
      this.debug("Deleting sub: ", JSON.stringify(s));
      await this.#deleteEventSubListener(s.id);
    }

    const subAlreadyExists = subs.some(
      (s) =>
        s.type === "channel.chat.message" &&
        s.status === "enabled" &&
        s.transport.callback === this.webhookCallback,
    );
    if (subAlreadyExists) return;

    // Register channel.chat.message
    let response = await fetchWithAccessToken(
      (token) =>
        new Request(Twitch.SubscriptionsURL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Client-ID": this.#clientID,
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
              method: "webhook",
              callback: this.webhookCallback,
              secret: this.#clientSecret,
            },
          }),
        }),
    );

    if (response.status != 202) {
      let body = await response.json();
      this.error(
        "Failed to subscribe to channel.chat.message. API call returned status code " +
          response.statusText,
      );
      this.error(body);
      return Promise.reject({ body, res: response.headers });
    } else {
      const data = await response.json();
      this.log(`Subscribed to channel.chat.message [${data.data[0].id}]`);
    }
  }

  async #deleteEventSubListener(id: string) {
    const subURL = new URL(Twitch.SubscriptionsURL);
    subURL.searchParams.set("id", id);
    const response = await fetchWithAccessToken(
      (token) =>
        new Request(subURL.toString(), {
          method: "DELETE",
          headers: {
            "Client-ID": this.#clientID,
            Authorization: `Bearer ${token}`,
          },
        }),
    );

    return response.ok;
  }

  async #getExistingEventSubListeners() {
    const subURL = new URL(Twitch.SubscriptionsURL);
    subURL.searchParams.set("user_id", this.userID);
    const response = await fetchWithAccessToken(
      (token) =>
        new Request(subURL.toString(), {
          method: "GET",
          headers: {
            "Client-ID": this.#clientID,
            Authorization: `Bearer ${token}`,
          },
        }),
    );

    if (!response.ok) {
      console.error(response, await response.text());
      throw new Error("Failed to fetch subscriptions");
    }

    const body = await response.json();

    this.debug("Event sub listeners: ", JSON.stringify(body, null, 2));

    return v.parse(
      v.array(
        v.object({
          id: v.string(),
          status: v.string(),
          type: v.string(),
          condition: v.record(v.string(), v.union([v.string(), v.number()])),
          transport: v.object({
            method: v.string(),
            callback: v.string(),
          }),
        }),
      ),
      body.data,
    );
  }

  checkIsModerator(options: MessageOptions): boolean {
    if (
      options.broadcaster.id === this.channelUserID &&
      options.broadcaster.id === options.chatter.id
    ) {
      return true;
    }

    if (
      options.badges.some(
        (b) => b.type === "moderator" || b.type === "broadcaster",
      )
    ) {
      return true;
    }

    return false;
  }

  getCommandsList = (): Array<{ name: string; text: string }> =>
    Object.entries(this.commands).map(([name, text]) => ({
      name,
      text: typeof text === "string" ? text : "[ Dynamic command action. ]",
    }));
}
