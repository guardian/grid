// We are going to write to an SQS queue in image loader instead
// We want to make sure that we only write to the queue at the very end, 
// when the record is successfully in ES
// Then the handler will embed and can do it in batches
// It's not easy to get it to take batches of 10 at a time but we can investigate 
// Whether it's worth it to do that 
// We can also reuse the lambda for the backfill

import { Context, S3Event } from 'aws-lambda';

export const handler = async (event: S3Event, context: Context) => {
    console.log('Hello world!');
    
    // Function code
};