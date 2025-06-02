import { randomInt } from "crypto";

export class Format {
  static readonly Reset = "\x1b[0m";
  static readonly Bright = "\x1b[1m";
  static readonly Dim = "\x1b[2m";
  static readonly Underscore = "\x1b[4m";
  static readonly Blink = "\x1b[5m";
  static readonly Reverse = "\x1b[7m";
  static readonly Hidden = "\x1b[8m";

  static readonly FgBlack = "\x1b[30m";
  static readonly FgRed = "\x1b[31m";
  static readonly FgGreen = "\x1b[32m";
  static readonly FgYellow = "\x1b[33m";
  static readonly FgBlue = "\x1b[34m";
  static readonly FgMagenta = "\x1b[35m";
  static readonly FgCyan = "\x1b[36m";
  static readonly FgWhite = "\x1b[37m";
  static readonly FgGray = "\x1b[90m";

  static readonly BgBlack = "\x1b[40m";
  static readonly BgRed = "\x1b[41m";
  static readonly BgGreen = "\x1b[42m";
  static readonly BgYellow = "\x1b[43m";
  static readonly BgBlue = "\x1b[44m";
  static readonly BgMagenta = "\x1b[45m";
  static readonly BgCyan = "\x1b[46m";
  static readonly BgWhite = "\x1b[47m";
  static readonly BgGray = "\x1b[100m";

  static FgColors = [
    "FgRed",
    "FgBlue",
    "FgCyan",
    // "FgGray",
    // "FgBlack",
    "FgGreen",
    "FgWhite",
    "FgYellow",
    "FgMagenta",
  ] as const satisfies Array<keyof typeof Format>;

  static BgColors = [
    "BgRed",
    "BgBlue",
    "BgCyan",
    "BgGray",
    "BgBlack",
    "BgGreen",
    "BgWhite",
    "BgYellow",
    "BgMagenta",
  ] as const satisfies Array<keyof typeof Format>;

  static get RandomFG() {
    return Format[randomItem(Format.FgColors)];
  }

  static get RandomBG() {
    return Format[randomItem(Format.BgColors)];
  }
}

export function randomItem<T>(array: ReadonlyArray<T>): T {
  return array[randomInt(array.length)];
}
