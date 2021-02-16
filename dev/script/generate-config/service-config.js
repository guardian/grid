function stripMargin(template, ...args) {
    const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
    return result.replace(/\r?(\n)\s*\|/g, '$1');
}

function getCorsAllowedOriginString(config) {
  return config.security.corsAllowedOrigins
    .map(origin => `${origin}.${config.DOMAIN}`)
    .join(',');
}

function getCommonConfig(config) {
  return `domain.root="${config.DOMAIN}"
        |authentication.providers.machine.config.authKeyStoreBucket="${config.coreStackProps.KeyBucket}"
        |aws.local.endpoint="https://localstack.media.${config.DOMAIN}"
        |thrall.kinesis.stream.name="${config.coreStackProps.ThrallMessageStream}"
        |thrall.kinesis.lowPriorityStream.name="${config.coreStackProps.ThrallLowPriorityMessageStream}"
        |`;
}

function getAuthConfig(config) {
  return stripMargin`${getCommonConfig(config)}
        |s3.config.bucket="${config.coreStackProps.ConfigBucket}"
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getAdminToolsConfig(config) {
  return stripMargin`${getCommonConfig(config)}`;
}

function getCollectionsConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |s3.collections.bucket="${config.coreStackProps.CollectionsBucket}"
        |dynamo.table.collections="CollectionsTable"
        |dynamo.table.imageCollections="ImageCollectionsTable"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getCropperConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |publishing.image.bucket="${config.coreStackProps.ImageOriginBucket}"
        |publishing.image.host="public.media.${config.DOMAIN}"
        |s3.config.bucket="${config.coreStackProps.ConfigBucket}"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getImageLoaderConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |s3.image.bucket="${config.coreStackProps.ImageBucket}"
        |s3.thumb.bucket="${config.coreStackProps.ThumbBucket}"
        |s3.quarantine.bucket="${config.coreStackProps.QuarantineBucket}"
        |s3.config.bucket="${config.coreStackProps.ConfigBucket}"
        |dynamo.table.upload.status="UploadStatusTable"
        |aws.local.endpoint="https://localstack.media.${config.DOMAIN}"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |transcoded.mime.types="image/tiff"
        |upload.quarantine.enabled=false
        |`;
}

function getKahunaConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |origin.full="images.media.${config.DOMAIN}"
        |origin.thumb="localstack.media.${config.DOMAIN}"
        |origin.images="images.media.${config.DOMAIN}"
        |origin.crops="public.media.${config.DOMAIN}"
        |google.tracking.id="${config.google.tracking.id}"
        |links.feedbackForm="${config.links.feedbackForm}"
        |links.usageRightsHelp="${config.links.usageRightsHelp}"
        |links.invalidSessionHelp="${config.links.invalidSessionHelp}"
        |links.supportEmail="${config.links.supportEmail}"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |security.frameAncestors="https://*.${config.DOMAIN}"
        |metrics.request.enabled=false
        |`;
}

function getLeasesConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |dynamo.tablename.leasesTable="LeasesTable"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getMediaApiConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |s3.image.bucket="${config.coreStackProps.ImageBucket}"
        |s3.thumb.bucket="${config.coreStackProps.ThumbBucket}"
        |s3.config.bucket="${config.coreStackProps.ConfigBucket}"
        |s3.usagemail.bucket="${config.coreStackProps.UsageMailBucket}"
        |persistence.identifier="picdarUrn"
        |es.index.aliases.read="readAlias"
        |es6.url="${config.es6.url}"
        |es6.cluster="${config.es6.cluster}"
        |es6.shards=${config.es6.shards}
        |es6.replicas=${config.es6.replicas}
        |quota.store.key="rcs-quota.json"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |image.record.download=false
        |`;
}

function getMetadataEditorConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |s3.collections.bucket="${config.coreStackProps.CollectionsBucket}"
        |dynamo.table.edits="EditsTable"
        |indexed.images.sqs.queue.url="${config.coreStackProps.IndexedImageMetadataQueue.replace("http://localhost:4576", `https://localstack.media.${config.DOMAIN}`)}"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getS3WatcherConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |loader.uri="https://loader.${config.DOMAIN}"
        |auth.key.s3watcher="${config.s3Watcher.key}"
        |s3.ingest.bucket="${config.coreStackProps.S3WatcherIngestBucket}"
        |s3.fail.bucket="${config.coreStackProps.S3WatcherFailBucket}"
        |`;
}

function getThrallConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |s3.image.bucket="${config.coreStackProps.ImageBucket}"
        |s3.thumb.bucket="${config.coreStackProps.ThumbBucket}"
        |persistence.identifier="picdarUrn"
        |es.index.aliases.write="writeAlias"
        |es.index.aliases.read="readAlias"
        |indexed.image.sns.topic.arn="${config.coreStackProps.IndexedImageTopic}"
        |es6.url="${config.es6.url}"
        |es6.cluster="${config.es6.cluster}"
        |es6.shards=${config.es6.shards}
        |es6.replicas=${config.es6.replicas}
        |metrics.request.enabled=false
        |`;
}

function getUsageConfig(config) {
    return stripMargin`${getCommonConfig(config)}
        |aws.region="${config.AWS_DEFAULT_REGION}"
        |capi.live.url="${config.guardian.capi.live.url}"
        |capi.apiKey="${config.guardian.capi.live.key}"
        |dynamo.tablename.usageRecordTable="UsageRecordTable"
        |composer.baseUrl="composer.${config.DOMAIN}"
        |crier.live.arn="${config.guardian.crier.live.roleArn}"
        |crier.preview.arn="${config.guardian.crier.preview.roleArn}"
        |crier.preview.name="${config.guardian.crier.preview.streamName}"
        |crier.live.name="${config.guardian.crier.live.streamName}"
        |app.name="usage"
        |security.cors.allowedOrigins="${getCorsAllowedOriginString(config)}"
        |metrics.request.enabled=false
        |`;
}

function getGridProdConfig(config) {
  return stripMargin`
    |auth.useLocal=true
    |panda.userDomain="${config.EMAIL_DOMAIN}"
    |panda.bucketName="${config.authStackProps.PanDomainBucket}"
    |permissions.bucket="${config.authStackProps.PermissionsBucket}"
    |`;
}

module.exports = {
    getCoreConfigs: (config) => {
        return {
            auth: getAuthConfig(config),
            'admin-tools': getAdminToolsConfig(config),
            collections: getCollectionsConfig(config),
            cropper: getCropperConfig(config),
            'image-loader': getImageLoaderConfig(config),
            kahuna: getKahunaConfig(config),
            leases: getLeasesConfig(config),
            'media-api': getMediaApiConfig(config),
            'metadata-editor': getMetadataEditorConfig(config),
            s3Watcher: getS3WatcherConfig(config),
            thrall: getThrallConfig(config),
            usage: getUsageConfig(config)
        };
    },
    getUseLocalAuthConfig: (config) => getGridProdConfig(config)
};
