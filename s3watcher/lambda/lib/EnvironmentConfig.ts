interface EnvironmentConfig {
  stack: string
  stage: string
  app: string
  isDev: boolean
  region: string
  profile: string
  loggingRoleArn?: string
  loggingStream?: string
}

function getEnv(varName: string, def: string): string {
  return process.env[varName] || def
}

function getEnvOpt(varName: string): string | undefined {
  return process.env[varName]
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
    loggingRoleArn: getEnvOpt("LOGGING_ROLE"),
    loggingStream: getEnvOpt("STREAM_NAME"),
  }
}
