import { upsertTokens, type Tokens } from "./db/index.js";
import { TwitchBot } from "./lib/bot.js";

const responses: Record<string, string | undefined> = {
  toxicman: "hhhhhhhheeeeeee",
};

export function createToxicManBot(tokens: Tokens) {
  let toxicMan = new TwitchBot({
    tokens,
    color: "FgRed",
    name: "ToxicMan",
    botUserID: process.env.TOXIC_MAN_ID,
    channelUserID: process.env.CHAT_CHANNEL_USER_ID,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  });

  toxicMan.onTokenRefresh = async (tokens) =>
    upsertTokens(toxicMan.userID, tokens);

  toxicMan.onMessage = (options) => {
    if (options.chatter.id === toxicMan.userID) {
      return null;
    }

    for (let key in responses) {
      if (options.message.toLowerCase().includes(key)) {
        toxicMan.sendMessage(responses[key]!);
        break;
      }
    }
  };

  return toxicMan;
}
