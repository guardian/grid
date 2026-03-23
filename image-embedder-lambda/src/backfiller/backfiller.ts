import {Context, EventBridgeEvent, SQSBatchResponse, SQSEvent} from "aws-lambda";

export const handler = async (
  event: EventBridgeEvent<"Scheduled Event", {}>,
  context: Context,
): Promise<void> => {
  console.log(`Starting handler embedding pipeline`);
}
