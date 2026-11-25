/**
 * Reuses the existing dev config generator (`dev/script/generate-config/service-config.js`)
 * to produce per-service Grid config from live CloudFormation stack resources, then
 * routes runtime AWS calls through Chekov when enabled, while Elasticsearch
 * continues to use its Testcontainers network alias.
 */
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import JSON5 from "json5";
import {
  DOMAIN,
  EMAIL_DOMAIN,
  ELASTICSEARCH_ALIAS,
  ELASTICSEARCH_PORT,
  LOCALSTACK_ALIAS,
  LOCALSTACK_PORT,
  REGION,
  REPO_ROOT,
  SERVICE_CONFIGS,
} from "./constants.ts";

/** `service-config.js` is CommonJS and lives outside this package, so load it via require. */
const require = createRequire(import.meta.url);

const GENERATE_CONFIG_DIR = path.join(
  REPO_ROOT,
  "dev",
  "script",
  "generate-config",
);

const GRID_SERVICES = Object.keys(SERVICE_CONFIGS);

type StackProps = Record<string, string>;

/**
 * Image types and a metadata template baked into the e2e Kahuna server so the
 * metadata-editor scenarios exercise real server config end-to-end rather than a
 * client-side stub. Applied at stack boot, so they are present for every scenario.
 */
export const E2E_IMAGE_TYPES = ["Photograph", "Illustration", "Composite"];

export const E2E_METADATA_TEMPLATE = {
  templateName: "E2E Agency",
  fields: [
    { name: "byline", value: "E2E Byline" },
    { name: "credit", value: "E2E Agency" },
  ],
};

/**
 * Templates that replace an image's title (and description), for the single image view's
 * title and description preview scenarios. They set no usage rights, so selecting them
 * doesn't open a rights preview.
 */
export const E2E_TITLE_AND_DESCRIPTION_TEMPLATE = {
  templateName: "E2E Title and description",
  fields: [
    { name: "title", value: "Template title" },
    { name: "description", value: "Template description" },
  ],
};

export const E2E_TITLE_ONLY_TEMPLATE = {
  templateName: "E2E Title only",
  fields: [{ name: "title", value: "Template title" }],
};

/** Templates that set metadata fields (each replacing the image's value). */
export const E2E_METADATA_FIELD_TEMPLATES = [
  E2E_METADATA_TEMPLATE,
  E2E_TITLE_AND_DESCRIPTION_TEMPLATE,
  E2E_TITLE_ONLY_TEMPLATE,
];

/**
 * A template that only sets usage rights, kept separate from `E2E_METADATA_TEMPLATE` so the
 * upload page's metadata template scenarios don't also open a rights preview. Pay to use has
 * no required properties, so the template's rights are complete: templates can't set the
 * `supplier` that Agency requires (only `suppliers`), and the metadata editor would reject it.
 */
export const E2E_RIGHTS_TEMPLATE = {
  templateName: "E2E Pay to use rights",
  usageRights: {
    category: "pay-to-use",
    restrictions: "E2E template restriction",
  },
};

/**
 * media-api derives `usageInstructions` from an image's usageRights category via this map, so
 * an image whose category is `agency` (see the AAP-credited fixture) shows this text.
 */
export const E2E_USAGE_INSTRUCTIONS = {
  category: "agency",
  text: "These images are supplied under agency terms; check the licence before use.",
};

/** Linked from the upload page for users without the upload_images permission. */
export const E2E_UPLOAD_SUPPORT_EMAIL = `mailto:grid-e2e-upload-support@${EMAIL_DOMAIN}`;

/** Render the e2e-only Kahuna settings as HOCON to append to the generated `kahuna.conf`. */
function kahunaE2eConfig(): string {
  const metadataFieldTemplates = E2E_METADATA_FIELD_TEMPLATES.flatMap(
    (template) => [
      "  {",
      `    templateName = "${template.templateName}"`,
      "    metadataFields = [",
      ...template.fields.map(
        (f) =>
          `      { name = "${f.name}", value = "${f.value}", resolveStrategy = "replace" }`,
      ),
      "    ]",
      "  },",
    ],
  );

  return [
    // The e2e stack has no Bedrock access, so AI search requests would 500.
    "ai.search.enabled = false",
    `links.uploadImagesPermissionSupportEmail = "${E2E_UPLOAD_SUPPORT_EMAIL}"`,
    `imageTypes = ${JSON.stringify(E2E_IMAGE_TYPES)}`,
    "metadata.templates = [",
    ...metadataFieldTemplates,
    "  {",
    `    templateName = "${E2E_RIGHTS_TEMPLATE.templateName}"`,
    `    usageRights = ${JSON.stringify(E2E_RIGHTS_TEMPLATE.usageRights)}`,
    "  }",
    "]",
    "",
  ].join("\n");
}

/** Render the e2e-only media-api settings as HOCON to append to the generated `media-api.conf`. */
function mediaApiE2eConfig(): string {
  return [
    "usageInstructions {",
    `  ${E2E_USAGE_INSTRUCTIONS.category} = "${E2E_USAGE_INSTRUCTIONS.text}"`,
    "}",
    "",
  ].join("\n");
}

/**
 * Route runtime AWS endpoints and queue URLs through Chekov when enabled.
 */
export function rewriteEndpoints(conf: string, coreStackProps: StackProps, proxy: boolean): string {
  const localstackUrl = `http://${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}`;
  const guardianLocalstackUrl = `https://${LOCALSTACK_ALIAS}.media.${DOMAIN}`;
  const legacyLocalstackUrl = "http://localhost:4576";
  const localLocalstackUrl = `http://localhost:${LOCALSTACK_PORT}`;
  const runtimeEndpoint = proxy ? guardianLocalstackUrl : localstackUrl;

  const imageOrigins = proxy
    ? conf
      .split(`images.media.${DOMAIN}`)
      .join(`${coreStackProps.ImageBucket}.s3.${DOMAIN}`)
      .split(`public.media.${DOMAIN}`)
      .join(`${coreStackProps.ImageOriginBucket}.s3.${DOMAIN}`)
    : conf;

  const rewrittenConf = [guardianLocalstackUrl, legacyLocalstackUrl, localLocalstackUrl, localstackUrl]
    .reduce((rewritten, endpoint) => rewritten.split(endpoint).join(runtimeEndpoint), imageOrigins);

  return `${rewrittenConf}\naws.local.presigningEndpoint="${guardianLocalstackUrl}"\n`;
}

/**
 * Generate all service config files into `configDir`.
 */
export function generateServiceConfig(
  configDir: string,
  coreStackProps: StackProps,
  authStackProps: StackProps,
  proxy = true,
): void {
  const ServiceConfig = require(
    path.join(GENERATE_CONFIG_DIR, "service-config.js"),
  );
  const defaultConfig = JSON5.parse(
    fs.readFileSync(path.join(GENERATE_CONFIG_DIR, "config.json5"), "utf8"),
  );

  const config = {
    ...defaultConfig,
    DOMAIN,
    EMAIL_DOMAIN,
    AWS_DEFAULT_REGION: REGION,
    coreStackProps,
    authStackProps,
    es6: {
      ...defaultConfig.es6,
      url: `http://${ELASTICSEARCH_ALIAS}:${ELASTICSEARCH_PORT}`,
    },
  };

  const serviceConfigs: Record<string, string> =
    ServiceConfig.getCoreConfigs(config);
  const localAuthConfig: string = ServiceConfig.getUseLocalAuthConfig(config);

  // e2e-only config appended per service on top of the generated base config.
  const extraConfig: Record<string, string> = {
    kahuna: kahunaE2eConfig(),
    "media-api": mediaApiE2eConfig(),
  };

  fs.mkdirSync(configDir, { recursive: true });

  // Mark the stage as DEV so services load `~/.grid/<app>.conf` (see GridConfigLoader).
  fs.writeFileSync(path.join(configDir, "stage"), "DEV");

  // The staged apps run in Play prod mode, which requires an application secret (>= 256
  // bits). GridConfigLoader loads `common.conf` for every service, so set it once here
  // rather than injecting it as a JVM option in the container.
  fs.writeFileSync(
    path.join(configDir, "common.conf"),
    [
      'play.http.secret.key = "testcontainers-e2e-application-secret-0123456789"',
      "enforceUploadImagesPermission = true",
      `usageRights.applicable = ${JSON.stringify([
        "com.gu.mediaservice.model.NoRights",
        "com.gu.mediaservice.model.PayToUse",
        "com.gu.mediaservice.model.PRAndThirdParty",
        "com.gu.mediaservice.model.Agency",
        "com.gu.mediaservice.model.PublisherPhotography",
        "com.gu.mediaservice.model.PublisherIllustration",
      ])}`,
      "",
    ].join("\n"),
  );

  for (const service of GRID_SERVICES) {
    const conf = serviceConfigs[service];
    if (!conf) {
      throw new Error(
        `service-config.js did not produce config for '${service}'`,
      );
    }

    const rewritten = rewriteEndpoints(`${conf}\n${localAuthConfig}`, coreStackProps, proxy);
    const extras = extraConfig[service];
    const withExtras = extras ? `${rewritten}\n${extras}` : rewritten;
    fs.writeFileSync(path.join(configDir, `${service}.conf`), withExtras);
  }
}
