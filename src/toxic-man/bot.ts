import { Resource } from "sst";
import { TwitchBot } from "../bot.js";
import { getTwitchTokens, setTwitchTokens } from "../auth.js";
import { randomItem } from "../utils.js";
import { answers, reactions, responses } from "./config.js";
import { buildName } from "./utils.js";
import { toxicResponseTimeout } from "../data.js";

export async function setupToxicMan() {
  const toxicMan = new TwitchBot({
    name: "ToxicMan",
    logColor: "FgRed",
    botUsername: "ieatgarbage69_420",
    clientID: Resource.TwitchClientID.value,
    commands: {
      test:
        process.env.SST_DEV === "true"
          ? "hhhhhhheee pleas, Do NOT talk to!! !"
          : undefined,
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
    botUserID: Resource.AppConfig.ToxicUserID,
    channelUserID: Resource.AppConfig.BroadcasterUserID,
    webhookCallback: `${Resource.ApiRouter.url}/bots/toxic-man`,
    tokens: await getTwitchTokens(Resource.AppConfig.ToxicUserID),
  });

  toxicMan.onTokenRefresh = async (tokens) =>
    setTwitchTokens(toxicMan.userID, tokens);

  toxicMan.onMessage = async (e) => {
    if (e.chatter.id === toxicMan.userID) return null;
    toxicMan.debug("Message received...", JSON.stringify(e, null, 2));

    if (e.message.includes(`@${toxicMan.username}`)) {
      toxicMan.sendMessage(randomItem(responses), { replyTo: e.messageID });
      return;
    }

    try {
      let noWhitespace = e.message
        .toLowerCase()
        .split(" ")
        .map((s) => s.trim())
        .join("");

      let key: keyof typeof reactions;
      for (key in reactions) {
        if (noWhitespace.includes(key) && (await checkIfCanReact(key))) {
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

const RESPONSE_TTL = 600_000; // 10 minutes
async function checkIfCanReact(keyword: string): Promise<boolean> {
  const now = Date.now();
  const { data } = await toxicResponseTimeout.get({ keyword }).go();
  if (data && data.expiration > now) {
    return false;
  }

  await toxicResponseTimeout
    .put({ keyword, expiration: now + RESPONSE_TTL })
    .go();

  return true;
}
