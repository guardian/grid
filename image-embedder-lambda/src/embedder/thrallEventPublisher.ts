import {KinesisClient, PutRecordsCommand, PutRecordsRequestEntry, PutRecordsResultEntry} from "@aws-sdk/client-kinesis";
import {ValidVector} from "./models";
import { SQSBatchItemFailure } from "aws-lambda";
import {ELASTICSEARCH_VECTOR_DIMENSIONS} from "./constants"

export interface CohereV4Embedding {
  image: number[];
}

export interface Embedding {
  cohereEmbedV4: CohereV4Embedding;
}


// Message format matching Scala's ExternalThrallMessage serialisation.
// Play JSON uses a `_type` discriminator field with the fully qualified class name.
export interface UpdateEmbeddingMessage {
  _type: 'com.gu.mediaservice.model.UpdateEmbeddingMessage';
  lastModified: string;
  id: string;
  embedding: Embedding;
}

export interface KinesisFailureEntry extends PutRecordsResultEntry {
  SequenceNumber?: undefined;
  ShardId?: undefined;
  ErrorCode: string;
  ErrorMessage: string;
}


export class ThrallEventPublisher {
  kinesisClient: KinesisClient
  thrallKinesisStreamArn: string
  stage: string
  constructor(kinesisClient: KinesisClient, thrallKinesisStreamArn: string, stage: string) {
    this.kinesisClient = kinesisClient;
    this.thrallKinesisStreamArn = thrallKinesisStreamArn;
    this.stage = stage;
  }

  matryoshkaEmbeddingToElasticsearchDimensions(vectors: ValidVector[]): ValidVector[] {
    return vectors.map((vector) => ({
      ...vector,
      data: {
        ...vector.data,
        float32: vector.data.float32.slice(0, ELASTICSEARCH_VECTOR_DIMENSIONS),
      },
    }));
  }

  async sendEmbeddingsToKinesis(
    vectors: ValidVector[],
    imageIdToMessageId: Map<string, string>,
    batchItemFailures: SQSBatchItemFailure[],
  ) {
    const failedImageIds = await this.putRecordsToKinesis(vectors);
    for (const imageId of failedImageIds) {
      const messageId = imageIdToMessageId.get(imageId);
      if (messageId) {
        console.log(
          `Error writing image with ID ${imageId} to Kinesis, adding as batchItemFailure`,
        );
        batchItemFailures.push({ itemIdentifier: messageId });
      }
    }
  }

  private async putRecordsToKinesis(
    vectors: ValidVector[],
  ): Promise<string[]> {
    const records: PutRecordsRequestEntry[] = vectors.map((v) => {
      const message: UpdateEmbeddingMessage = {
        _type: 'com.gu.mediaservice.model.UpdateEmbeddingMessage',
        lastModified: new Date().toISOString(),
        id: v.key,
        embedding: {
          cohereEmbedV4: {
            image: v.data.float32,
          },
        },
      };
      return {
        PartitionKey: v.key,
        Data: Buffer.from(JSON.stringify(message)),
      };
    });

    console.log(`Writing ${records.length} embeddings to Kinesis stream...`);

    const command = new PutRecordsCommand({
      StreamARN: this.thrallKinesisStreamArn,
      Records: records,
    });

    try {
      const response = await this.kinesisClient.send(command);

      if (response.Records?.length !== records.length) {
        throw new Error(
          `Unexpected Kinesis response: expected ${records.length} fully-populated records, got ${response.Records?.length ?? 0}`,
        );
      }

      const responseRecords: PutRecordsResultEntry[] = response.Records;

      const failures = responseRecords.filter(
        (r): r is KinesisFailureEntry => !!r.ErrorCode,
      );

      console.log(
        `Published ${responseRecords.length - failures.length} embeddings to Kinesis (${failures.length} failed)`,
      );

      const failedImageIds = failures.map((failure) => {
        const index = responseRecords.indexOf(failure);
        return vectors[index].key;
      });

      return failedImageIds;
    } catch (error) {
      console.error(`Error writing to Kinesis:`, error);
      throw error;
    }
  }
}
