import getCredentials from "./getCredentials";
import fetch from "node-fetch";

interface AWSCredentials {
  baseUrl: string;
  "X-Gu-Media-Key": string;
}

const getImageCount = async (credentials: AWSCredentials): Promise<number> => {
  const response = await fetch(credentials.baseUrl + "/images", {
    headers: {
      "X-Gu-Media-Key": credentials["X-Gu-Media-Key"]
    }
  });
  const images: { total: number } = await response.json();
  return images.total;
};

const handler = async (): Promise<{ statusCode: number; body: string }> => {
  // get credentials
  const credentials = await getCredentials();

  // query media api with credentials
  const images = await getImageCount(credentials);

  // post it to CW as metric

  // return happy lambda response to caller
  return { statusCode: 200, body: "Metric sent" };
};

const fns = { getCredentials, handler, getImageCount };

export default fns;
