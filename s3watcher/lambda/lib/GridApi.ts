import fetch from 'node-fetch'
import { CleanEvent, IngestConfig } from './Lambda'

interface Headers {
    [name: string]: string
}

interface Params {
    [name: string]: string
}

interface GridImportRequest {
    key: string
    url: string
    path: string
    size: number
    headers: Headers
    params: Params
}

export interface UploadResult {
    statusCode: number
    succeeded: boolean
    uploadedBy: string
    stage: string
}

export const buildGridImportRequest = function(config: IngestConfig, s3Event: CleanEvent): GridImportRequest {
    const headers = {
        'X-Gu-Media-Key': config.apiKey
    }

    const buildUploadedBy = function(path: string[]){
        if (path.length > 1) {
            return path[0];
        } else {
            throw new Error(`Unable to process file uploaded to root folder: ${s3Event.key}`);
        }
    };

    const uploadedBy = buildUploadedBy(s3Event.path);

    return {
        key: config.apiKey,
        url: config.baseUrl,
        path: "/imports",
        size: s3Event.size,
        headers: headers,
        params: {
            filename: s3Event.filename,
            uploadedBy: uploadedBy,
            stage: config.stage
        }
    };
}

export const importImage = async function(importRequest: GridImportRequest, imageUri: string): Promise<UploadResult> {
    const queryParams: Params = { 
        ... importRequest.params,
        uri: imageUri
    }
    const queryString = Object.keys(queryParams)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]))
        .join('&')
    const url = `${importRequest.url}${importRequest.path}?${queryString}`

    try {
        const uploadResponse = await fetch(url, { headers: importRequest.headers })
        return {
            statusCode: uploadResponse.status,
            succeeded: uploadResponse.status == 202,
            uploadedBy: importRequest.params.uploadedBy,
            stage: importRequest.params.stage
        }
    } catch(error) {
        console.error("Fetch failed with error", error)
        return {
            statusCode: 0,
            succeeded: false,
            uploadedBy: importRequest.params.uploadedBy,
            stage: importRequest.params.stage
        }
    }

}

