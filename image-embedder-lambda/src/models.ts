// A PutInputVector with guaranteed key and float32 data.
import {PutInputVector} from "@aws-sdk/client-s3vectors";
import {PutRecordsResultEntry} from "@aws-sdk/client-kinesis";

export interface ValidVector extends PutInputVector {
  key: string;
  data: { float32: number[] };
}

export interface SQSMessageBody {
  imageId: string;
  s3Bucket: string;
  s3Key: string;
  fileType: string;
}

export interface CohereV3Embedding {
  image: number[];
}

export interface Embedding {
  cohereEmbedEnglishV3: CohereV3Embedding;
}

export interface FetchedImage {
  bytes: Uint8Array;
  mimeType: string;
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
