import { S3, CloudWatch } from 'aws-sdk'
import {transfer} from '../lib/Transfer'
import { deleteObjectPromise, getObjectPromise, getSignedUrlPromisePromise } from '../__mocks__/aws-sdk'
import { action, createMockLogger, ingestConfig } from './Fixtures'

test('transfer successfully coordinates a transfer', async () => {
  const logger = createMockLogger({loggerKey: "LoggerValue"})
  const s3Client = new S3()
  const cloudwatch = new CloudWatch()
  getSignedUrlPromisePromise.mockReturnValueOnce("https://s3.monkey.com/blah/blah")
  deleteObjectPromise.mockReturnValueOnce
  const importAction = jest.fn().mockReturnValueOnce({ succeeded: true })
  const result = transfer(logger, s3Client, cloudwatch, importAction, action, ingestConfig)
  await expect(result).resolves.toBeUndefined()
  expect(s3Client.getSignedUrlPromise).toHaveBeenCalled()
  expect(s3Client.deleteObject).toHaveBeenCalled()
  console.log(logger.getLoggedLines().map(l => JSON.stringify(l)).join("\n"))
})