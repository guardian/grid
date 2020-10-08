export const getObjectPromise = jest.fn()
export const copyObjectPromise = jest.fn()
export const deleteObjectPromise = jest.fn()
export const getSignedUrlPromisePromise = jest.fn()

const getObjectFn = jest
  .fn()
  .mockImplementation(() => ({ promise: getObjectPromise }))
const copyObjectFn = jest
  .fn()
  .mockImplementation(() => ({ promise: copyObjectPromise }))
const deleteObjectFn = jest
  .fn()
  .mockImplementation(() => ({ promise: deleteObjectPromise }))
const getSignedUrlPromiseFn = jest
  .fn()
  .mockImplementation(() => ({ promise: getSignedUrlPromisePromise }))

export class S3 {
  getObject = getObjectFn
  copyObject = copyObjectFn
  deleteObject = deleteObjectFn
  getSignedUrlPromise = getSignedUrlPromiseFn
}

export const putDataPromise = jest.fn()

const putDataFn = jest
  .fn()
  .mockImplementation(() => ({ promise: putDataPromise }))

export class CloudWatch {
  putMetricData = putDataFn
}

const mocks = [
  getObjectFn,
  copyObjectFn,
  deleteObjectFn,
  getSignedUrlPromiseFn,
  putDataFn,
  getObjectPromise,
  copyObjectPromise,
  deleteObjectPromise,
  getSignedUrlPromisePromise,
  putDataPromise,
]

export const resetMocks = function (): void {
  mocks.forEach((m) => {
    m.mockClear()
  })
}
