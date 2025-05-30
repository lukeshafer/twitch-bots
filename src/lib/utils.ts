import { randomInt } from "crypto";

export function exitHandler(handler: () => void) {
  // do something when app is closing
  process.on("exit", handler);

  // catches ctrl+c event
  process.on("SIGINT", handler);
  // catches "kill pid" (for example: nodemon restart)
  process.on("SIGUSR1", handler);
  process.on("SIGUSR2", handler);

  // catches uncaught exceptions
  process.on("uncaughtException", handler);
}

export function randomItem<T>(array: ReadonlyArray<T>): T {
  return array[randomInt(array.length)];
}
