/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "twitch-bots",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: { region: "us-east-2" },
      },
    };
  },
  async run() {
    const db = new sst.aws.Dynamo("BotData", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      },
    });

    const clientID = new sst.Secret("TwitchClientID");
    const clientSecret = new sst.Secret("TwitchClientSecret");

    const twitchConfig = new sst.Linkable("TwitchConfig", {
      properties: {
        SnaleUserID: "1312291952",
        ToxicUserID: "1316393910",
        BroadcasterUserID: "144313393",
        TokensBaseSSMPath: `/twitch-bots/${$app.name}/${$app.stage}/user-access-tokens/`,
      } as const,
    });

    const ssmPermission = sst.aws.permission({
      actions: ["ssm:GetParameter", "ssm:PutParameter"],
      resources: ["*"],
    });

    const api = new sst.aws.Function("TwitchBotApi", {
      url: true,
      environment: {
        NODE_DEBUG: $dev === true ? "1" : "0",
      },
      handler: "src/lambda/index.handler",
      copyFiles: [{ from: "public" }],
      link: [clientID, clientSecret, twitchConfig, db],
      permissions: [ssmPermission],
    });
  },
});
