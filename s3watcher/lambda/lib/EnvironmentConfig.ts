interface EnvironmentConfig {
  stack: string
  stage: string
  app: string
  isDev: boolean
  region: string
  profile: string
}

function getEnv(varName: string, def: string): string {
  return process.env[varName] || def
}

export function readConfig(): EnvironmentConfig {
  const stage = getEnv("STAGE", "DEV")
  return {
    stack: getEnv("STACK", "media-service"),
    stage,
    app: getEnv("APP", "s3-watcher"),
    isDev: stage === "DEV",
    region: getEnv("REGION", "eu-west-1"),
    profile: getEnv("PROFILE", "media-service"),
  }
}
