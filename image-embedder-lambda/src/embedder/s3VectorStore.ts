import {
  PutInputVector, PutVectorsCommand,
  PutVectorsCommandInput,
  PutVectorsCommandOutput,
  S3VectorsClient
} from "@aws-sdk/client-s3vectors";

export class S3VectorStore {
  s3VectorsClient: S3VectorsClient
  vectorBucketName: string;
  constructor(s3VectorsClient: S3VectorsClient, vectorBucketName: string) {
    this.s3VectorsClient = s3VectorsClient;
    this.vectorBucketName = vectorBucketName;
  }
  async storeEmbeddings(
    vectors: PutInputVector[],
  ): Promise<PutVectorsCommandOutput> {
    console.log(`Storing ${vectors.length} embeddings to vector store`);

    const input: PutVectorsCommandInput = {
      vectorBucketName: this.vectorBucketName,
      indexName: 'cohere-embed-english-v4',
      vectors: vectors,
    };

    console.log(
      `PutVectorsCommand input: vectorBucketName=${input.vectorBucketName}, indexName=${input.indexName}, vectorCount=${vectors.length}`,
    );

    try {
      const command = new PutVectorsCommand(input);
      const response = await this.s3VectorsClient.send(command);

      console.log(
        `S3 Vectors response metadata: ${JSON.stringify(response.$metadata)}`,
      );
      console.log(`Successfully stored ${vectors.length} embeddings`);

      return response;
    } catch (error) {
      console.error(`Error storing embeddings:`, error);
      throw error;
    }
  }
}
