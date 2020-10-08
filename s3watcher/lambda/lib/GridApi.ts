import fetch from "node-fetch"
import { ImportAction, IngestConfig } from "./Lambda"
import { Logger } from "./Logging"

interface Headers {
  [name: string]: string
}

interface Params {
  [name: string]: string
}

export interface GridImportRequest {
  key: string
  url: URL
  path: string
  size: number
  headers: Headers
  params: Params
  fetchUrl: URL
}

export interface UploadResult {
  statusCode: number
  succeeded: boolean
  uploadedBy: string
  stage: string
}

export const buildGridImportRequest = async function (
  config: IngestConfig,
  s3Event: ImportAction,
  imageUri: string
): Promise<GridImportRequest> {
  const IMPORT_PATH = "/imports"

  const headers = {
    "X-Gu-Media-Key": config.apiKey,
  }

  const buildUploadedBy = function (path: string[]) {
    if (path.length > 1) {
      return path[0]
    } else {
      throw new Error(
        `Unable to process file uploaded to root folder: ${s3Event.key}`
      )
    }
  }

  const uploadedBy = buildUploadedBy(s3Event.path)

  const params: Params = {
    filename: s3Event.filename,
    uploadedBy: uploadedBy,
    stage: config.stage,
    uri: imageUri,
  }

  const queryParams = new URLSearchParams(params)

  const fetchUrl = new URL(`${IMPORT_PATH}?${queryParams}`, config.baseUrl)

  return {
    key: config.apiKey,
    url: new URL(config.baseUrl),
    path: IMPORT_PATH,
    size: s3Event.size,
    headers,
    params,
    fetchUrl,
  }
}

export const importImage = async (
  logger: Logger,
  importRequest: GridImportRequest
): Promise<UploadResult> => {
  try {
    logger.info(`Calling ${importRequest.fetchUrl}`)
    const uploadResponse = await fetch(importRequest.fetchUrl, {
      method: "POST",
      headers: importRequest.headers,
    })
    return {
      statusCode: uploadResponse.status,
      succeeded: uploadResponse.status == 202,
      uploadedBy: importRequest.params.uploadedBy,
      stage: importRequest.params.stage,
    }
  } catch (error) {
    logger.error("Fetch failed with network error", {
      error: JSON.stringify(error),
    })
    return {
      statusCode: 0,
      succeeded: false,
      uploadedBy: importRequest.params.uploadedBy,
      stage: importRequest.params.stage,
    }
  }
}
