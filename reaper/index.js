const fetch = require('node-fetch');
const ELKKinesisLogger = require('@guardian/elk-kinesis-logger');
const CredentialsConfig = require('./CredentialsConfig');

exports.handler = (event, context, callback) => {
    CredentialsConfig.read().then(
        data => {
            const json = JSON.parse(data);
            const logger = new ELKKinesisLogger({
                stage: json.stage,
                stack: json.stack,
                app: json.app,
                roleArn: json.roleArn,
                streamName: json.streamName
            });
            logger.open().then(() => {
                logger.log("logger started")
                const headers = {
                    'X-Gu-Media-Key': json["X-Gu-Media-Key"]
                };
                fetch(`${json.baseUrl}/images?until=20.days&length=100&persisted=false`, { headers }).then(
                    res => res.json()
                )
                .then(
                    json => json.data.forEach(image => {
                        const imageId = image.data.id;
                        fetch(image.uri, { headers, method: 'DELETE' })
                        .then(res => {
                            if(res.status >= 200 && res.status < 300) {
                                logger.log( `${res.status}: successfully deleted picture ${imageId}`, {
                                  status: res.status
                                });
                            } else {
                                logger.log(`Delete attempt for picture ${imageId} failed with status: ${res.status}`, {
                                  status: res.status
                                });
                            }
                        });
                        return logger.close();
                    })
                ).catch(e => {
                    logger.error(e.message);
                    logger.close().then(
                        () => callback(e.message)
                    )
                });
            })
        }
    )
    .catch(e => {
        const customError = `Failed to retrieve S3 config with error: ${e.message}`
        console.log(customError);
        callback(customError);
    })
};
