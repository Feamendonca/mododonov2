export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // IA (Claude/Anthropic) — usado por server/_core/llm.ts. Os campos forgeApiUrl/forgeApiKey
  // acima continuam em uso por outros módulos (storage, maps, heartbeat, notification,
  // imageGeneration, voiceTranscription) e não devem ser removidos.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
