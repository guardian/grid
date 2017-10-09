const AWS = require('aws-sdk');

class CredentialsConfig {
  static read() {
    return new Promise((resolve, reject) => {
      const s3 = new AWS.S3();
      const params = {
        Bucket: 'grid-conf',
        Key: `${process.env.STAGE}/reaper/conf.json`
      };

      s3.getObject(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
            const buffer = data.Body;
            const body = buffer.toString('utf8');
          resolve(body);
        }
      });
    });
  }
}

module.exports = CredentialsConfig;