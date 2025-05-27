// import {
//   createCommand,
//   getCommandText as getCommandTextFromDB,
// } from "./db/index.js";
//
// type CommandOptions = {
//   message: string;
//   chatter: { id: string; login: string };
//   broadcaster: { id: string; login: string };
//   badges: Array<{ type: string }>;
// };
//
// type CommandOutput = string | null;
//
// type CommandAction =
//   | string
//   | ((options: CommandOptions) => CommandOutput | Promise<CommandOutput>);
//
// const COMMAND_CHAR = "!";
//
// const commands: Record<string, CommandAction | undefined> = {
//   momo: "We're raising money to cover Momo's (my cat) medical expenses! All Subs and Bits go towards the goal, or you can donate at https://chuffed.org/project/131797-help-us-cover-momos-medical-bills",
//   modstatus: (options) => {
//     if (checkIsModerator(options)) {
//       return `@${options.chatter.login} is a moderator`;
//     } else {
//       return `@${options.chatter.login} is NOT a moderator`;
//     }
//   },
//   addcommand: async (options) => {
//     let isMod = checkIsModerator(options);
//     if (!isMod) {
//       return null;
//     }
//
//     const cmd = parseCommandString(options.message);
//     if (cmd == null) {
//       return "Usage: `!addcommand !commandname output`";
//     }
//
//     console.log(
//       `[${options.chatter.login}] Adding command: !${cmd.name} ${cmd.text}`,
//     );
//
//     try {
//       await createCommand({
//         text: cmd.text,
//         name: cmd.name,
//         userID: options.chatter.id,
//         userLogin: options.chatter.login,
//       });
//
//       return `Added command: !${cmd.name} ${cmd.text}`;
//     } catch (e) {
//       console.error(e);
//
//       const existing = await getCommandTextFromDB(cmd.name);
//       if (existing) {
//         return "Command already exists: !" + cmd.name;
//       }
//
//       return "An error occurred while adding the command";
//     }
//   },
// };
//
// export async function handleCommand(
//   options: CommandOptions,
// ): Promise<CommandOutput> {
//   if (!options.message.length) return null;
//
//   const cmd = parseCommandString(options.message);
//   if (!cmd) return null;
//
//   const action = commands[cmd.name];
//
//   if (action == undefined) {
//     return getCommandTextFromDB(cmd.name);
//   }
//
//   if (typeof action === "string") {
//     return action;
//   }
//
//   return action({
//     ...options,
//     message: cmd.text,
//   });
// }
//
// function checkIsModerator(options: CommandOptions): boolean {
//   if (options.broadcaster.id === options.chatter.id) return true;
//
//   if (
//     options.badges.some(
//       (b) => b.type === "moderator" || b.type === "broadcaster",
//     )
//   )
//     return true;
//
//   return false;
// }
//
// function parseCommandString(input: string) {
//   const [command, ...msg] = input.split(" ").filter((s) => s.length > 0);
//   if (!command.startsWith(COMMAND_CHAR)) return null;
//
//   return {
//     name: command.slice(1).toLowerCase(),
//     text: msg.join(" "),
//   };
// }
