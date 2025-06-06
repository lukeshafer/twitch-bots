import {
  TwitchBot,
  type BotMessageOutput,
  type MessageOptions,
} from "../bot.js";
import { quotes, type Quote } from "../data.js";
import { getLiveStreamInfo } from "../twitch.js";
import { randomItem } from "../utils.js";

export async function addQuote(
  bot: TwitchBot,
  options: MessageOptions,
): Promise<BotMessageOutput> {
  console.log("Attempting to add quote")

  let isMod = bot.checkIsModerator(options);
  if (!isMod) return null;

  const streamInfo = await getLiveStreamInfo();
  const today = new Date().toISOString();

  const nextNumber = (await quotes.scan.go({ pages: "all" })).data.length + 1;
  const text = options.message.trim();

  await quotes
    .create({
      text,
      date: today,
      number: nextNumber,
      createdBy: options.chatter.id,
      category: streamInfo?.game_name || "Offline",
    })
    .go();

  return new TwitchBot.Message(
    `Added Quote #${nextNumber.toFixed()}: "${text}"`,
  );
}

function formatQuoteString(quote: Quote) {
  const date = new Date(quote.date).toLocaleDateString();
  return `Quote #${quote.number}: "${quote.text}" (${date} ${quote.category})`;
}

export async function getQuoteCommandHandler(
  bot: TwitchBot,
  options: MessageOptions,
) {
  const quoteNumber = Math.abs(parseInt(options.message));

  if (quoteNumber) {
    return (
      (await getQuote(quoteNumber)) ??
      new TwitchBot.Message(`quote ${quoteNumber} not found :(`)
    );
  } else {
    return getRandomQuote();
  }
}

export async function getQuote(number: number): Promise<BotMessageOutput> {
  const { data } = await quotes.get({ number }).go();
  if (data == null) return null;

  return new TwitchBot.Message(formatQuoteString(data));
}

export async function getRandomQuote(): Promise<BotMessageOutput> {
  const { data } = await quotes.scan.go({ pages: "all" });
  const item = randomItem(data);

  return new TwitchBot.Message(formatQuoteString(item));
}
