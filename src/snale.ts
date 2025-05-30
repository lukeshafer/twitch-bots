import { TwitchBot, type MessageOptions } from "./lib/bot.js";
import {
  createCommand,
  updateCommand,
  getCommandText,
  upsertTokens,
  type Tokens,
  deleteCommand,
} from "./db/index.js";

async function addCommand(options: MessageOptions) {
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

    return `Added command !${cmd.name}: ${cmd.text}`;
  } catch (e) {
    console.error(e);

    const existing = await getCommandText(cmd.name);
    if (existing) {
      return "Command already exists: !" + cmd.name;
    }

    return "An error occurred while adding the command";
  }
}

async function editCommand(options: MessageOptions) {
  let isMod = TwitchBot.checkIsModerator(options);
  if (!isMod) {
    return null;
  }

  const cmd: {
    name: string;
    text: string;
  } | null = TwitchBot.parseCommand(options.message);

  if (cmd == null) {
    return "Usage: `!editcommand !commandname output`";
  }

  const existingCommand = await getCommandText(cmd.name);
  if (existingCommand == null) {
    return `brother command !${cmd.name} does not exist. use !addcommand or fix your spelling`;
  }

  console.log(
    `[${options.chatter.login}] Editing command: !${cmd.name} ${cmd.text}`,
  );

  try {
    await updateCommand({ text: cmd.text, name: cmd.name });
    return `Command updated !${cmd.name}: ${cmd.text}`;
  } catch (e) {
    console.error(e);
    return "UH OH! An error occurred while updating the command.";
  }
}

async function removeCommand(options: MessageOptions) {
  let isMod = TwitchBot.checkIsModerator(options);
  if (!isMod) {
    return null;
  }

  const cmd: {
    name: string;
    text: string;
  } | null = TwitchBot.parseCommand(options.message);

  if (cmd == null) {
    return "Usage: `!removecommand !commandname`";
  }

  const existingCommand = await getCommandText(cmd.name);
  if (existingCommand == null) {
    return `brother !${cmd.name} does not exist, i cannot delete that`;
  }

  console.log(`[${options.chatter.login}] Removing command: !${cmd.name}`);

  try {
    await deleteCommand(cmd.name);
    return `deleted !${cmd.name}: ${existingCommand}`;
  } catch (e) {
    console.error(e);
    return "UH OH! An error occurred while deleting the command.";
  }
}

export function createSnaleBot(tokens: Tokens) {
  let snale = new TwitchBot({
    tokens,
    color: "FgCyan",
    name: "SnaleBot",
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    botUserID: process.env.BOT_USER_ID,
    channelUserID: process.env.CHAT_CHANNEL_USER_ID,
    commands: {
      momo: "We're raising money to cover Momo's (my cat) medical expenses! All Subs and Bits go towards the goal, or you can donate at https://chuffed.org/project/131797-help-us-cover-momos-medical-bills",
      addcommand: (options) => addCommand(options),
      editcommand: (options) => editCommand(options),
      removecommand: (options) => removeCommand(options),
      lurk: (options) => {
        return `hell yeah, thanks for the lurk @${options.chatter.login}`;
      },
      modstatus: (options) =>
        TwitchBot.checkIsModerator(options)
          ? `@${options.chatter.login} is a moderator`
          : `@${options.chatter.login} is NOT a moderator`,
    },
  });

  snale.onTokenRefresh = async (tokens) => upsertTokens(snale.userID, tokens);
  snale.onCommandMissing = async ({ message }) => {
    const cmd = TwitchBot.parseCommand(message);
    if (cmd == null) return null;

    const text = await getCommandText(cmd.name);
    return text;
  };

  return snale;
}
