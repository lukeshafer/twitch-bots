import type { Context } from "hono";
import { Resource } from "sst";
import { TwitchBot } from "../bot.js";
import { getTwitchTokens, setTwitchTokens } from "../auth.js";
import { randomItem } from "../utils.js";
import { answers, reactions, responses } from "./config.js";
import { buildName } from "./utils.js";

export async function setupToxicMan(path: string, c: Context) {
  const toxicMan = new TwitchBot({
    name: "ToxicMan",
    logColor: "FgRed",
    clientID: Resource.TwitchClientID.value,
    commands: {
      test: "hhhhhhheee pleas, Do NOT talk to!! !",
      ask: (e) =>
        new TwitchBot.Message({
          message: randomItem(answers),
          replyToID: e.messageID,
        }),
      name: (e) =>
        new TwitchBot.Message({
          message: buildName(),
          replyToID: e.messageID,
        }),
    },
    clientSecret: Resource.TwitchClientSecret.value,
    botUserID: Resource.TwitchConfig.ToxicUserID,
    channelUserID: Resource.TwitchConfig.BroadcasterUserID,
    webhookCallback: `https://${new URL(c.req.url).hostname}${path}`,
    tokens: await getTwitchTokens(Resource.TwitchConfig.ToxicUserID),
  });

  toxicMan.onTokenRefresh = async (tokens) =>
    setTwitchTokens(toxicMan.userID, tokens);

  toxicMan.onMessage = (e) => {
    if (e.chatter.id === toxicMan.userID) return null;
    toxicMan.debug("Message received...", JSON.stringify(e, null, 2));

    try {
      let key: keyof typeof reactions;
      for (key in reactions) {
        if (e.message.toLowerCase().includes(key)) {
          toxicMan.sendMessage(reactions[key]!);
          break;
        }
      }
    } catch (error) {
      toxicMan.error(error);
      throw error;
    }
  };

  return toxicMan;
}
