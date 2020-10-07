import { readConfig } from "../lib/EnvironmentConfig"

const OLD_ENV = process.env

beforeEach(() => {
  jest.resetModules() // most important - it clears the cache
  process.env = {} // clear the environment
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

  const config = readConfig()
  expect(config).toEqual({
    app: "monkey",
    isDev: false,
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
    profile: "media-service",
    region: "eu-west-1",
    stack: "media-service",
    stage: "DEV",
  })
})
