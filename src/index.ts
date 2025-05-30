import startServer from "./api.js";
import { getTokens } from "./db/index.js";
import { exitHandler } from "./lib/utils.js";
import { createSnaleBot } from "./snale.js";
import { createToxicManBot } from "./toxic-man.js";

const snaleBot = createSnaleBot(
  await getTokens(process.env.BOT_USER_ID, "snale"),
);

const toxicMan = createToxicManBot(
  await getTokens(process.env.TOXIC_MAN_ID, "toxicman"),
);

snaleBot.start();
toxicMan.start();
startServer(snaleBot);

exitHandler(() => {
  snaleBot.stop();
  toxicMan.stop();
});
