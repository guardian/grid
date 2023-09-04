import fetch from "node-fetch";

export const ENV_VAR_BATCH_SIZE = "BATCH_SIZE";
export const ENV_VAR_MEDIA_API_HOSTNAME = "MEDIA_API_HOSTNAME";
export const ENV_VAR_MEDIA_API_KEY = "MEDIA_API_KEY";

const getEnvVarOrThrow = (name: string) => {
  const value = process.env[name];
  if(!value) {
    throw Error(`Missing environment variable ${name}`);
  }
  return value;
}

export const handler = async () => {

  const batchSize = getEnvVarOrThrow(ENV_VAR_BATCH_SIZE);

  const mediaApiHostname = getEnvVarOrThrow(ENV_VAR_MEDIA_API_HOSTNAME);
  const mediaApiImagesBaseUrl = `https://${mediaApiHostname}/images/`;

  const mediaApiKey = getEnvVarOrThrow(ENV_VAR_MEDIA_API_KEY);
  const fetchOptions = {
    headers: {
      "X-Gu-Media-Key": mediaApiKey,
    }
  }

  const IDsToSoftDelete = await fetch(`${mediaApiImagesBaseUrl}/nextIdsToBeSoftReaped`, fetchOptions)
    .then(response => response.json() as unknown as string[]);
  console.log({message:`${IDsToSoftDelete.length} images for soft deletion.`, IDsToSoftDelete});

  // TODO soft delete media items
  // TODO log IDs to permanent location

  const IDsToHardDelete: string[] = await fetch(`${mediaApiImagesBaseUrl}/nextIdsToBeHardReaped`, fetchOptions)
    .then(response => response.json() as unknown as string[]);
  console.log({message:`${IDsToHardDelete.length} images for hard deletion:`, IDsToHardDelete});

  // TODO hard delete media items
  // TODO log IDs to permanent location
};
