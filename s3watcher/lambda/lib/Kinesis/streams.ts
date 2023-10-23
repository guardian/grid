import { AWSError, Kinesis } from "aws-sdk"
import { Logger } from "../Logging"
import { PromiseResult } from "aws-sdk/lib/request"

/** TO DO - doesn't account for the total number of streams being >10 */
export const listAllStreams = async (
  logger: Logger,
  kinesis: Kinesis
): Promise<PromiseResult<Kinesis.ListStreamsOutput, AWSError>> => {
  logger.info("fetching streams")
  return await kinesis.listStreams({}).promise()
}

export const listShards = async (
  logger: Logger,
  kinesis: Kinesis,
  streamName: string
): Promise<PromiseResult<Kinesis.ListShardsOutput, AWSError>> => {
  logger.info("fetching streams")
  return await kinesis.listShards({ StreamName: streamName }).promise()
}
