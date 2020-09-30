import { readConfig } from "../lib/EnvironmentConfig"

const OLD_ENV = process.env

beforeEach(() => {
  jest.resetModules() // most important - it clears the cache
  process.env = { ...OLD_ENV } // make a copy
})

afterAll(() => {
  process.env = OLD_ENV // restore old env
})

test("read environment vars are set", () => {
  process.env.STAGE = "TEST"
  process.env.APP = "monkey"
  process.env.STACK = "grid_stack"
  process.env.REGION = "us-east-1"
  process.env.PROFILE = "grid_profile"
  process.env.LOGGING_ROLE = "a_logging_role"
  process.env.STREAM_NAME = "grid_logging_stream"

  const config = readConfig()
  expect(config).toEqual({
    app: "monkey",
    isDev: false,
    loggingRoleArn: "a_logging_role",
    loggingStream: "grid_logging_stream",
    profile: "grid_profile",
    region: "us-east-1",
    stack: "grid_stack",
    stage: "TEST",
  })
})

test("read environment when empty", () => {
  const config = readConfig()
  expect(config).toEqual({
    app: "s3-watcher",
    isDev: true,
    loggingRoleArn: undefined,
    loggingStream: undefined,
    profile: "media-service",
    region: "eu-west-1",
    stack: "media-service",
    stage: "DEV",
  })
})
