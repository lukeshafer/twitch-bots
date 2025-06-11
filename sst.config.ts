/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "twitch-bots",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: input?.stage === "production" ? "us-west-1" : "us-east-2",
        },
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
    const authSecret = new sst.Secret("AuthSecret");

    const domain =
      $app.stage === "production"
        ? "twitch-bots.lksh.dev"
        : `${$app.stage}.dev.twitch-bots.lksh.dev`;

    const appConfig = new sst.Linkable("AppConfig", {
      properties: {
        SnaleUserID: "1312291952",
        ToxicUserID: "1316393910",
        BroadcasterUserID: "144313393",
        TokensBaseSSMPath: `/twitch-bots/${$app.name}/${$app.stage}/user-access-tokens/`,
        DomainName: domain,
      } as const,
    });

    const ssmPermission = sst.aws.permission({
      actions: ["ssm:GetParameter", "ssm:PutParameter", "ssm:DeleteParameter"],
      resources: ["*"],
    });

    const apiRouter = new sst.aws.Router("ApiRouter", { domain });

    const api = new sst.aws.Function("TwitchBotApi", {
      url: {
        router: {
          instance: apiRouter,
        },
      },
      environment: {
        TWITCHBOTS_DEBUG: $dev === true ? "true" : "",
      },
      handler: "src/index.handler",
      copyFiles: [{ from: "public" }],
      link: [clientID, clientSecret, authSecret, appConfig, db, apiRouter],
      permissions: [ssmPermission],
    });
  },
});
