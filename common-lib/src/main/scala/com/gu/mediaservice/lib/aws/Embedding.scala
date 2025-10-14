package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.LogMarker
import software.amazon.awssdk.services.s3vectors.model.PutVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

class Embedding(s3vectors: S3Vectors, bedrock: Bedrock) {

  def createEmbeddingAndStore(imageFilePath: Path, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[PutVectorsResponse] = {
    //    TODO construct the base64 string inside the fetch embedding option only if config is switched on
    val base64EncodedString: String = Base64.getEncoder().encodeToString(Files.readAllBytes(imageFilePath))

    val embeddingFuture = bedrock.createImageEmbedding(base64EncodedString)
    val vectorInput = embeddingFuture.map { embedding =>
      s3vectors.storeEmbeddingInS3VectorStore(embedding, imageId)
    }
    vectorInput
  }
}
