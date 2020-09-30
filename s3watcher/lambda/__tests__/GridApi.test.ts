import {buildGridImportRequest} from '../lib/GridApi'
import { ImportAction } from '../lib/Lambda'
import {ingestConfig} from './Fixtures'

test('build an import request', () => {
  const config = ingestConfig
  const cleanEvent: ImportAction = {
    bucket: 'source-bucket',
    key: 'SupplierSeven/incoming-image.jpg',
    filename: 'incoming-image.jpg',
    path: ['SupplierSeven', 'incoming-image.jpg'],
    size: 11235023
  }
  const uri = 'https://s3.example.net/signed-uri-to-access-image?signature=monkeybob'

  const importRequest = buildGridImportRequest(config, cleanEvent, uri)

  expect(importRequest).toEqual({
    fetchUrl: "https://grid.example.net/imports?filename=incoming-image.jpg&uploadedBy=SupplierSeven&stage=TEST&uri=https%3A%2F%2Fs3.example.net%2Fsigned-uri-to-access-image%3Fsignature%3Dmonkeybob",
    headers: {
      "X-Gu-Media-Key": "top-secret",
    },
    key: "top-secret",
    params: {
      filename: "incoming-image.jpg",
      stage: "TEST",
      uploadedBy: "SupplierSeven",
      uri: "https://s3.example.net/signed-uri-to-access-image?signature=monkeybob",
    },
    path: "/imports",
    size: 11235023,
    url: "https://grid.example.net",
  })
})