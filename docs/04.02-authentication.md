# Authentication

There are two ways to authenticate with Grid.

## Panda Auth
This is typically used for client-server authentication.

We use the [pan-domain-authentication](https://github.com/guardian/pan-domain-authentication) library to authenticate
using Google.

## API Keys
This is typically used for server-server authentication.

API keys are stored in the `KeyBucket` of the cloudformation stack; drop a key file here and it'll get picked by Grid
within 10 minutes and you'll be able to make authenticated calls.

### Creating a Key
Generate a key file with a random string as the filename. The contents of the file should be the application name.

```bash
export APP=test && echo $APP > $APP-`head -c 1024 /dev/urandom | md5 | tr '[:upper:]' '[:lower:]' | cut -c1-20`
```

Now you have a key file, find your `KeyBucket`:

```bash
./get-stack-resource.sh KeyBucket <stack-name>
```

Then copy your key:

```bash
aws s3 cp /path/to/file s3://bucket --profile media-service
```

Be sure to delete the key from your local machine!

### Testing a Key
Once you've copied your key up to the `KeyBucket` it'll be picked up by the apps within 10 minutes.

You can test your key by making a curl request:

```bash
curl -s -I -X GET -H "X-Gu-Media-Key: <your-key>" "https://<grid-api-local>"
```

You should get a 200 response code once the keys have synced.
