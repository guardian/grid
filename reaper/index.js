const fetch = require("node-fetch");
const CredentialsConfig = require("./CredentialsConfig");
const pAll = require("p-all");

exports.handler = (event, context, callback) => {
  CredentialsConfig.read()
    .then(data => {
      const json = JSON.parse(data);

      console.log("console started");
      const headers = {
        "X-Gu-Media-Key": json["X-Gu-Media-Key"]
      };
      fetch(`${json.baseUrl}/images?until=20.days&length=100&persisted=false`, {
        headers
      })
        .then(res => res.json())
        .then(json => {
          const deletions = json.data.map(image => () => {
            const imageId = image.data.id;
            return fetch(image.uri, { headers, method: "DELETE" }).then(res => {
              if (res.status >= 200 && res.status < 300) {
                console.log(
                  `${res.status}: successfully deleted picture ${imageId}`,
                  {
                    status: res.status
                  }
                );
              } else {
                console.log(
                  `Delete attempt for picture ${imageId} failed with status: ${res.status}`,
                  {
                    status: res.status
                  }
                );
              }
            });
          });
          return pAll(deletions, { concurrency: 4 });
        })
        .catch(e => {
          console.error(e.message);
          console.close().then(() => callback(e.message));
        });
    })
    .catch(e => {
      const customError = `Failed to retrieve S3 config with error: ${e.message}`;
      console.error(customError);
      callback(customError);
    });
};
