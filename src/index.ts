import startServer from "./api.js";
import { createCommand, getCommandText, getTokens } from "./db/index.js";
import { TwitchBot } from "./lib/bot.js";

const tokens = await getTokens(process.env.BOT_USER_ID);

const snaleBot = new TwitchBot({
  tokens,
  name: "SnaleBot",
  botUserID: process.env.BOT_USER_ID,
  channelUserID: process.env.CHAT_CHANNEL_USER_ID,
  commands: {
    momo: "We're raising money to cover Momo's (my cat) medical expenses! All Subs and Bits go towards the goal, or you can donate at https://chuffed.org/project/131797-help-us-cover-momos-medical-bills",
    modstatus: (options) => {
      if (TwitchBot.checkIsModerator(options)) {
        return `@${options.chatter.login} is a moderator`;
      } else {
        return `@${options.chatter.login} is NOT a moderator`;
      }
    },
    addcommand: async (options) => {
      let isMod = TwitchBot.checkIsModerator(options);
      if (!isMod) {
        return null;
      }

      const cmd: {
        name: string;
        text: string;
      } | null = TwitchBot.parseCommand(options.message);

      if (cmd == null) {
        return "Usage: `!addcommand !commandname output`";
      }

      console.log(
        `[${options.chatter.login}] Adding command: !${cmd.name} ${cmd.text}`,
      );

      try {
        await createCommand({
          text: cmd.text,
          name: cmd.name,
          userID: options.chatter.id,
          userLogin: options.chatter.login,
        });

        return `Added command: !${cmd.name} ${cmd.text}`;
      } catch (e) {
        console.error(e);

        const existing = await getCommandText(cmd.name);
        if (existing) {
          return "Command already exists: !" + cmd.name;
        }

        return "An error occurred while adding the command";
      }
    },
  },
});

snaleBot.start()

// startBot()
// startServer();
