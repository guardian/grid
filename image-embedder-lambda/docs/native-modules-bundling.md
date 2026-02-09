# Node.js Lambda Native Modules & Bundling

## The Problem

Native Node.js modules like `sharp` ship platform-specific prebuilt binaries. When bundling on CI (linux-x64), the native code doesn't work on the Lambda runtime (linux-arm64).

Error looks like:
```
Error: Could not load the "sharp" module using the linux-arm64 runtime
```

## How Native Modules Work in Node

- `sharp` itself is just a JavaScript wrapper
- The actual compiled code lives in separate packages: `@img/sharp-<platform>-<arch>`
- These are "optional dependencies" – npm installs whichever ones match your platform
- Sharp also has JS dependencies: `detect-libc`, `semver`, `@img/colour`

After installing for multiple platforms, `node_modules/@img/` contains:
```
sharp-darwin-arm64/        # macOS ARM (M-series Macs)
sharp-linux-arm64/         # Linux ARM (Lambda target)
sharp-libvips-linux-arm64/ # libvips library that sharp depends on
...etc
```

## Current Solution (build.sh)

1. Mark `sharp` as external in esbuild (so it doesn't try to inline native code)
2. Install sharp with target platform flags: `npm install --os=linux --cpu=arm64 sharp`
3. Copy sharp + all its dependencies into `dist/node_modules/`
4. Zip the whole `dist/` directory

The `--external:sharp` flag makes esbuild emit `require("sharp")` unchanged, which Node resolves at runtime from the bundled `node_modules/`.

## Testing Locally

Run a linux-arm64 container that mimics Lambda:

```bash
docker run --rm -it --platform linux/arm64 \
  -v $(pwd)/image-embedder-lambda/dist:/var/task \
  --entrypoint "" \
  public.ecr.aws/lambda/nodejs:20 \
  /bin/bash
```

Then inside:
```bash
cd /var/task
node -e "const sharp = require('sharp'); console.log(sharp.versions)"
```

To actually invoke the handler:
```bash
docker run --rm -it --platform linux/arm64 \
  -p 9000:8080 \
  -v $(pwd)/image-embedder-lambda/dist:/var/task \
  public.ecr.aws/lambda/nodejs:20 \
  index.handler
```

Then curl it:
```bash
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"Records": [{"messageId": "test", "body": "{}"}]}'
```

## Alternative: CDK NodejsFunction

CDK's `NodejsFunction` can handle all of this automatically:

```typescript
new lambdaNodejs.NodejsFunction(this, "ImageEmbedder", {
  bundling: {
    externalModules: ["sharp"],
    nodeModules: ["sharp"],
    commandHooks: {
      beforeBundling() { return []; },
      beforeInstall() { return []; },
      afterBundling(_inputDir: string, outputDir: string): string[] {
        return [
          `cd ${outputDir}`,
          "npm install --os=linux --cpu=arm64 sharp"
        ];
      }
    }
  }
});
```

### When does bundling happen?

**During `cdk synth`**, not at deploy time:

1. CDK traverses your construct tree
2. `NodejsFunction` triggers esbuild bundling
3. `commandHooks` run (beforeBundling → bundling → afterBundling)
4. Output goes to `cdk.out/asset.xxxxx/`
5. CloudFormation template references the asset

Then `cdk deploy` uploads assets to S3 and creates/updates the stack.

### Why this is nice

- Single tool handles infrastructure + build
- No separate build scripts to maintain
- Asset hashing ensures deploys only happen when code changes

### Why we're not using it (yet)

Don't think anyone else in Guardian P&E is using this approach, so it may break some assumptions of standard Guardian CI/CD, e.g. that the CloudFormation deploy artifact doesn't contain the application code.

We should definitely try it out at some point to see what the pain points are!

## References

- https://sharp.pixelplumbing.com/install#cross-platform
- https://sharp.pixelplumbing.com/install#aws-lambda
- https://github.com/evanw/esbuild/issues/1051 (native .node modules discussion)
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html
