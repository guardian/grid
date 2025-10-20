package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.LogMarker

import software.amazon.awssdk.services.s3vectors.model.PutVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock) {

  def createEmbeddingAndStore(imageFilePath: Path, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[PutVectorsResponse] = {
    val base64EncodedString: String = Base64.getEncoder().encodeToString(Files.readAllBytes(imageFilePath))

    val embeddingFuture = bedrock.createImageEmbedding(base64EncodedString)
    embeddingFuture.map { embedding =>
      s3vectors.storeEmbeddingInS3VectorStore(embedding, imageId)
    }
  }
}
