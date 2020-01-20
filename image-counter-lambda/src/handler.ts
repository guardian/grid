import getCredentials from "./getCredentials";

const handler = async () => {
  // get credentials
  const credentials = await getCredentials();
  // query media api with credentials
  // post it to CW as metric

  return true;
};

const fns = { getCredentials, handler };

export default fns;
