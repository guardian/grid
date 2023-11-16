/* eslint-disable no-console */
import AWS from "aws-sdk";
import { readConfig } from "../lambda/lib/EnvironmentConfig";

import { exit } from "process";

const envConfig = readConfig();

const awsConfig = envConfig.isDev
  ? {
      accessKeyId: "test",
      secretAccessKey: "test",
      region: envConfig.region,
      endpoint: "http://localhost:4566",
      s3ForcePathStyle: true,
    }
  : undefined;

AWS.config.update({
  region: envConfig.region,
});

const s3 = new AWS.S3(awsConfig);

const findWatcherBucketNames = async () => {
  const { Buckets: buckets = [] } = await s3.listBuckets().promise();
  return buckets
    .filter((bucket) => bucket.Name?.includes("s3watcheringestbucket"))
    .map((bucket) => bucket.Name) as string[];
};

const listObjectsInEachBucket = async (bucketNames: string[]) => {
  return Promise.all(
    bucketNames.map(async (bucketName) => {
      const { Contents: contents = [] } = await s3
        .listObjects({
          Bucket: bucketName,
        })
        .promise();
      return { bucketName, contents };
    })
  );
};

findWatcherBucketNames()
  .then(listObjectsInEachBucket)
  .then((results) => {
    results.forEach((bucket) => {
      if (!bucket) {
        return;
      }
      console.log(bucket.bucketName);
      console.table(bucket.contents, ["Key", "Size"]);
    });
  })
  .then(() => {
    exit();
  });
