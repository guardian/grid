export const getObjectPromise = jest.fn().mockReturnValue(Promise.resolve(true))
export const deleteObjectPromise = jest
  .fn()
  .mockReturnValue(Promise.resolve(true))
export const getSignedUrlPromisePromise = jest
  .fn()
  .mockReturnValue(Promise.resolve(true))

const getObjectFn = jest
  .fn()
  .mockImplementation(() => ({ promise: getObjectPromise }))
const deleteObjectFn = jest
  .fn()
  .mockImplementation(() => ({ promise: deleteObjectPromise }))
const getSignedUrlPromiseFn = jest
  .fn()
  .mockImplementation(() => ({ promise: getSignedUrlPromisePromise }))

export class S3 {
  getObject = getObjectFn
  deleteObject = deleteObjectFn
  getSignedUrlPromise = getSignedUrlPromiseFn
}

export const putDataPromise = jest.fn().mockReturnValue(Promise.resolve(true))

const putDataFn = jest
  .fn()
  .mockImplementation(() => ({ promise: putDataPromise }))

export class CloudWatch {
  putMetricData = putDataFn
}
