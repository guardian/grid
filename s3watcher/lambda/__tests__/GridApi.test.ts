import {
  buildGridImportRequest,
  GridImportRequest,
  importImage,
} from "../lib/GridApi"
import { ImportAction } from "../lib/Lambda"
import { createMockLogger, ingestConfig } from "./Fixtures"
import fetch from "node-fetch"

test("build an import request", () => {
  const config = ingestConfig
  const cleanEvent: ImportAction = {
    bucket: "source-bucket",
    key: "SupplierSeven/incoming-image.jpg",
    filename: "incoming-image.jpg",
    path: ["SupplierSeven", "incoming-image.jpg"],
    size: 11235023,
  }
  const uri =
    "https://s3.example.net/signed-uri-to-access-image?signature=monkeybob"

  const importRequest = buildGridImportRequest(config, cleanEvent, uri)

  expect(importRequest).resolves.toEqual({
    fetchUrl:
      "https://grid.example.net/imports?filename=incoming-image.jpg&uploadedBy=SupplierSeven&stage=TEST&uri=https%3A%2F%2Fs3.example.net%2Fsigned-uri-to-access-image%3Fsignature%3Dmonkeybob",
    headers: {
      "X-Gu-Media-Key": "top-secret",
    },
    key: "top-secret",
    params: {
      filename: "incoming-image.jpg",
      stage: "TEST",
      uploadedBy: "SupplierSeven",
      uri:
        "https://s3.example.net/signed-uri-to-access-image?signature=monkeybob",
    },
    path: "/imports",
    size: 11235023,
    url: "https://grid.example.net",
  })
})

test("build an import request with a file in the root", () => {
  const config = ingestConfig
  const cleanEvent: ImportAction = {
    bucket: "source-bucket",
    key: "incoming-image.jpg",
    filename: "incoming-image.jpg",
    path: ["incoming-image.jpg"],
    size: 11235023,
  }
  const uri =
    "https://s3.example.net/signed-uri-to-access-image?signature=monkeybob"

  const importRequest = buildGridImportRequest(config, cleanEvent, uri)

  expect(importRequest).rejects.toThrowError(
    "Unable to process file uploaded to root folder: incoming-image.jpg"
  )
})

test("calling the Grid imports endpoint", () => {
  const logger = createMockLogger({})
  const request: GridImportRequest = {
    fetchUrl: "https://grid.example.net/imports?filename=incoming-image.jpg",
    headers: {
      "X-Gu-Media-Key": "top-secret",
    },
    key: "top-secret",
    params: {
      filename: "incoming-image.jpg",
      stage: "TEST",
      uploadedBy: "SupplierSeven",
      uri:
        "https://s3.example.net/signed-uri-to-access-image?signature=monkeybob",
    },
    path: "/imports",
    size: 11235023,
    url: "https://grid.example.net",
  }
  const mock = (fetch as unknown) as jest.Mock
  mock.mockReturnValue({})
  const result = importImage(logger, request)
  expect(result).resolves.not.toThrow()
  expect(mock).toBeCalledWith(
    "https://grid.example.net/imports?filename=incoming-image.jpg",
    {
      headers: {
        "X-Gu-Media-Key": "top-secret",
      },
      method: "POST",
    }
  )
})