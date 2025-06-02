import { randomItem } from "../utils.js";
import { names } from "./config.js";

export function buildName(): string {
  let name =
    randomItem(names.names1) +
    randomItem(names.names2) +
    randomItem(names.names3);

  if (Math.random() < 0.1) {
    name += randomItem(names.names4)
  }
  
  return name;
}
