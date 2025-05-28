declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string;
      CLIENT_SECRET: string;
      BOT_USER_ID: string;
      TOXIC_MAN_ID: string;
      CHAT_CHANNEL_USER_ID: string;
      DB_FILE_NAME: string;
    }
  }
}

export {}
