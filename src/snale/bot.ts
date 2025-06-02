import { Resource } from "sst";
import { TwitchBot } from "../bot.js";
import { getTwitchTokens, setTwitchTokens } from "../auth.js";
import type { Context } from "hono";
import {
  addCommand,
  editCommand,
  getCommandText,
  removeCommand,
} from "./commands.js";

export async function setupSnaleBot(path: string, c: Context) {
  const snale = new TwitchBot({
    name: "SnaleBot",
    logColor: "FgCyan",
    clientID: Resource.TwitchClientID.value,
    commands: { test: "Snale bot is working" },
    clientSecret: Resource.TwitchClientSecret.value,
    botUserID: (Resource.TwitchConfig.SnaleUserID),
    channelUserID: (Resource.TwitchConfig.BroadcasterUserID),
    webhookCallback: `https://${new URL(c.req.url).hostname}${path}`,
    tokens: await getTwitchTokens((Resource.TwitchConfig.SnaleUserID)),
  });

  snale.commands.modstatus = (options) =>
    snale.checkIsModerator(options)
      ? new TwitchBot.Message(`@${options.chatter.login} is a moderator`)
      : new TwitchBot.Message( `@${options.chatter.login} is NOT a moderator` );

  snale.commands.addcommand = (options) => addCommand(snale, options);
  snale.commands.editcommand = (options) => editCommand(snale, options);
  snale.commands.removecommand = (options) => removeCommand(snale, options);

  snale.onTokenRefresh = async (tokens) =>
    setTwitchTokens(snale.userID, tokens);

  snale.onCommandMissing = async ({ message }) => {
    const cmd = snale.parseCommand(message);
    if (cmd == null) return null;

    return getCommandText(cmd.name);
  };

  return snale;
}
