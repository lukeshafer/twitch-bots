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
    new sst.aws.Function("TwitchBotApi", {
      url: true,
      handler: "src/lambda/index.handler",
    });
  },
});
