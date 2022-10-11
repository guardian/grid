# Authentication

There are three ways to authenticate with Grid.

## Inner service
Services can call other Grid services, typically reusing the credentials of the original using the `onBehalfOf` mechanism. However, sometimes services such as `thrall` will need to originate a call to another Grid service (e.g. during a long-running migration), in which case they can make use of the `innerServiceCall` method on instances of `Authentication` (the same place where one can call `getOnBehalfOfPrincipal`). This `innerServiceCall` method adds the following headers to the request: 

- `X-Inner-Service-Identity`: contains the name of the originating service, e.g. `thrall` and  possibly names of other services the request has gone via (see `onBehalfOf` section below)
- `X-Inner-Service-UUID`: contains a unique identifier for the request
- `X-Inner-Service-Timestamp`
- `X-Inner-Service-Signature`: contains a checksum of the above 3 headers, encrypted using the Play secret (which is already shared between the services),

which are then verified and interpreted as an `InnerServicePrincipal` when received in the service being called.

## Panda Auth
This is typically used for client-server authentication.

We use the [pan-domain-authentication](https://github.com/guardian/pan-domain-authentication) library to authenticate
using Google.

## API Keys
This is typically used for server-server authentication.

API keys are stored in the `KeyBucket` of the cloudformation stack; drop a key file here and it'll get picked by Grid
within 10 minutes and you'll be able to make authenticated calls.

When running locally, the `setup.sh` creates an API key `dev-`.

### Creating a Key
Generate a key file with a random string as the filename. The contents of the file should contain the name of the user or the application.
The following script will create a key file with a random string as the filename, and the name of the user or application as the contents.
The API key will by default have the "Internal" tier, other tiers can be set by naming the tier in the second line of the file contents.


```bash
./dev/script/mkapikey.sh <name>
```

Now you have a key file, find your `KeyBucket`:

```bash
./get-stack-resource.sh KeyBucket <stack-name>
```

Then copy your key:

```bash
aws s3 cp <api-key-file> s3://<bucket> --profile media-service
```

Be sure to delete the key from your local machine!

### Testing a Key
Once you've copied your key up to the `KeyBucket` it'll be picked up by the apps within 10 minutes.

You can test your key by making a curl request:

```bash
curl -s -I -X GET -H "X-Gu-Media-Key: <your-key>" "https://<media-api-domain>/"
```

You should get a 200 response code once the keys have synced.
You can always redeploy the application if impatient!

### API Key Tiers

API keys are considered to have different "tiers" of access. Three are currently considered:

- internal - Allowed to call any endpoint
- readonly - Only allows GET requests
- syndication - Only allows GET requests on endpoints specifically required for the syndication workflows

The key tier is set by setting one of the above values in the *second* line of the api key file. Not setting a tier will default the key to *internal*.

