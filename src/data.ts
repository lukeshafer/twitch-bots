import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type * as ElectroDB from "electrodb";
import { Entity } from "electrodb";

const config = {
  table: Resource.BotData.name,
  client: new DynamoDBClient(),
} satisfies ElectroDB.EntityConfiguration;

const service = "snaily-twitch-bots";

const dateAttributes = () =>
  ({
    createdAt: {
      type: "string",
      default: () => new Date().toISOString(),
      // cannot be modified after created
      readOnly: true,
    },
    updatedAt: {
      type: "string",
      default: () => new Date().toISOString(),
      watch: "*", // watch for changes to any attribute
      set: () => new Date().toISOString(), // set current timestamp when updated
      readOnly: true,
    },
  }) satisfies Record<string, ElectroDB.Attribute>;

export const authStates = new Entity(
  {
    model: { entity: "auth-state", version: "1", service },
    attributes: {
      state: { type: "string", required: true },
      expiration: { type: "number", required: true },
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["state"] },
        sk: { field: "sk", composite: [] },
      },
      byExpiration: {
        index: "gsi1",
        pk: { field: "gsi1pk", composite: [] },
        sk: { field: "gsi1sk", composite: ["expiration"] },
      },
    },
  },
  config,
);

export const twitchEvents = new Entity(
  {
    model: { entity: "twitch-event", version: "1", service },
    attributes: {
      message_id: { type: "string", required: true },
      message_timestamp: { type: "string", required: true },
      ...dateAttributes(),
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["message_id"] },
        sk: { field: "sk", composite: [] },
      },
    },
  },
  config,
);

export const commands = new Entity(
  {
    model: { entity: "command", version: "1", service },
    attributes: {
      name: { type: "string", required: true },
      text: { type: "string", required: true },
      ...dateAttributes(),
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["name"] },
        sk: { field: "sk", composite: [] },
      },
    },
  },
  config,
);

export const toxicResponseTimeout = new Entity(
  {
    model: { entity: "toxic-response-timeout", version: "1", service },
    attributes: {
      keyword: { type: "string", required: true },
      expiration: { type: "number", required: true },
      ...dateAttributes(),
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["keyword"] },
        sk: { field: "sk", composite: [] },
      },
    },
  },
  config,
);

export type Quote = ElectroDB.EntityItem<typeof quotes>
export const quotes = new Entity(
  {
    model: { entity: "quote", version: "1", service },
    attributes: {
      number: { type: "number", required: true },
      text: { type: "string", required: true },
      date: { type: "string", required: true },
      category: { type: "string", required: true },
      createdBy: { type: "string", required: true },
      ...dateAttributes(),
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["number"] },
        sk: { field: "sk", composite: [] },
      },
      byDate: {
        index: "gsi1",
        pk: { field: "gsi1pk", composite: ["category"] },
        sk: { field: "gsi1sk", composite: ["date"] },
      },
    },
  },
  config,
);
