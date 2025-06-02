import { TwitchBot, type BotMessageOutput, type MessageOptions } from "../bot.js";
import { commands } from "../data.js";

export async function addCommand(
  bot: TwitchBot,
  options: MessageOptions,
): Promise<BotMessageOutput> {
  let isMod = bot.checkIsModerator(options);
  if (!isMod) return null;

  const cmd = bot.parseCommand(options.message);

  if (cmd == null) {
    return new TwitchBot.Message("Usage: `!addcommand !commandname output`");
  }

  console.log(
    `[${options.chatter.login}] Adding command: !${cmd.name} ${cmd.text}`,
  );

  try {
    await commands.create({ text: cmd.text, name: cmd.name }).go();
    return new TwitchBot.Message(`Added command !${cmd.name}: ${cmd.text}`);
  } catch (e) {
    console.error(e);

    const existing = await commands.get({ name: cmd.name }).go();
    if (existing) {
      return new TwitchBot.Message("Command already exists: !" + cmd.name);
    }

    return new TwitchBot.Message("An error occurred while adding the command");
  }
}

export async function editCommand(
  bot: TwitchBot,
  options: MessageOptions,
): Promise<BotMessageOutput> {
  let isMod = bot.checkIsModerator(options);
  if (!isMod) return null;

  const cmd = bot.parseCommand(options.message);

  if (cmd == null) {
    return new TwitchBot.Message("Usage: `!addcommand !commandname output`");
  }

  const { data } = await commands.get({ name: cmd.name }).go();
  if (data == null) {
    return new TwitchBot.Message(
      `brother command !${cmd.name} does not exist. use !addcommand or fix your spelling`,
    );
  }

  console.log(
    `[${options.chatter.login}] Editing command: !${cmd.name} ${cmd.text}`,
  );

  try {
    await commands.patch({ name: cmd.name }).set({ text: cmd.text }).go();
    return new TwitchBot.Message(`Command updated !${cmd.name}: ${cmd.text}`);
  } catch (e) {
    console.error(e);
    return new TwitchBot.Message(
      "UH OH! An error occurred while updating the command.",
    );
  }
}

export async function removeCommand(
  bot: TwitchBot,
  options: MessageOptions,
): Promise<BotMessageOutput> {
  let isMod = bot.checkIsModerator(options);
  if (!isMod) return null;

  const cmd = bot.parseCommand(options.message);
  if (cmd == null) {
    return new TwitchBot.Message("Usage: `!removecommand !commandname`");
  }

  const { data } = await commands.get({ name: cmd.name }).go();
  if (data == null) {
    return new TwitchBot.Message(
      `brother !${cmd.name} does not exist, i cannot delete that`,
    );
  }

  console.log(`[${options.chatter.login}] Removing command: !${cmd.name}`);

  try {
    await commands.delete({ name: cmd.name }).go();
    return new TwitchBot.Message(`deleted !${cmd.name}`);
  } catch (e) {
    console.error(e);
    return new TwitchBot.Message(
      "UH OH! An error occurred while deleting the command.",
    );
  }
}

export async function getCommandText(name: string): Promise<BotMessageOutput> {
  const { data } = await commands.get({ name }).go();

  if (data == null) return null;
  else return new TwitchBot.Message(data.text);
}
