// A PutInputVector with guaranteed key and float32 data.
import {PutInputVector} from "@aws-sdk/client-s3vectors";

export interface ValidVector extends PutInputVector {
  key: string;
  data: { float32: number[] };
}



