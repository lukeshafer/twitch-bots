import { Resource } from "sst";
import { TwitchBot } from "../bot.js";
import { getTwitchTokens, setTwitchTokens } from "../auth.js";
import {
  addCommand,
  editCommand,
  getCommandText,
  removeCommand,
} from "./commands.js";

export async function setupSnaleBot() {
  const snale = new TwitchBot({
    name: "SnaleBot",
    botUsername: "its_snale_bot",
    logColor: "FgCyan",
    clientID: Resource.TwitchClientID.value,
    commands: {
      test: "Snale bot is working",
      lurk: (e) =>
        new TwitchBot.Message(`have a good lurk @${e.chatter.login}!!`),
      unlurk: (e) => new TwitchBot.Message(`welcome back @${e.chatter.login}!`),
    },
    clientSecret: Resource.TwitchClientSecret.value,
    botUserID: Resource.AppConfig.SnaleUserID,
    channelUserID: Resource.AppConfig.BroadcasterUserID,
    webhookCallback: `${Resource.ApiRouter.url}/bots/snale`,
    tokens: await getTwitchTokens(Resource.AppConfig.SnaleUserID),
  });

  snale.commands.modstatus = (options) =>
    snale.checkIsModerator(options)
      ? new TwitchBot.Message(`@${options.chatter.login} is a moderator`)
      : new TwitchBot.Message(`@${options.chatter.login} is NOT a moderator`);

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
