function stripMargin(template, ...args) {
    const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
    return result.replace(/\r?(\n)\s*\|/g, '$1');
}

function getCorsAllowedOriginString(config) {
  return config.security.corsAllowedOrigins
    .map(origin => `${origin}.${config.DOMAIN}`)
    .join(',');
}

function getAuthConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |s3.config.bucket=${config.coreStackProps.ConfigBucket}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |metrics.request.enabled=false
        |`;
}

function getCollectionsConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |s3.collections.bucket=${config.coreStackProps.CollectionsBucket}
        |dynamo.table.collections=CollectionsTable
        |dynamo.table.imageCollections=ImageCollectionsTable
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getCropperConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |publishing.image.bucket=${config.coreStackProps.ImageOriginBucket}
        |publishing.image.host=public.media.${config.DOMAIN}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |s3.config.bucket=${config.coreStackProps.ConfigBucket}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getImageLoaderConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |s3.image.bucket=${config.coreStackProps.ImageBucket}
        |s3.thumb.bucket=${config.coreStackProps.ThumbBucket}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |s3.config.bucket=${config.coreStackProps.ConfigBucket}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getKahunaConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |origin.full=images.media.${config.DOMAIN}
        |origin.thumb=localstack.media.${config.DOMAIN}
        |origin.images=images.media.${config.DOMAIN}
        |origin.crops=public.media.${config.DOMAIN}
        |google.tracking.id=${config.google.tracking.id}
        |links.feedbackForm=${config.links.feedbackForm}
        |links.usageRightsHelp=${config.links.usageRightsHelp}
        |links.invalidSessionHelp=${config.links.invalidSessionHelp}
        |links.supportEmail=${config.links.supportEmail}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |security.frameAncestors=https://*.${config.DOMAIN}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |metrics.request.enabled=false
        |`;
}

function getLeasesConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |dynamo.tablename.leasesTable=LeasesTable
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getMediaApiConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |s3.image.bucket=${config.coreStackProps.ImageBucket}
        |s3.thumb.bucket=${config.coreStackProps.ThumbBucket}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |s3.config.bucket=${config.coreStackProps.ConfigBucket}
        |s3.usagemail.bucket=${config.coreStackProps.UsageMailBucket}
        |persistence.identifier=picdarUrn
        |es.index.aliases.read=readAlias
        |es7.url=${config.es7.url}
        |es7.cluster=${config.es7.cluster}
        |es7.shards=${config.es7.shards}
        |es7.replicas=${config.es7.replicas}
        |quota.store.key=rcs-quota.json
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |image.record.download=false
        |`;
}

function getMetadataEditorConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |s3.collections.bucket=${config.coreStackProps.CollectionsBucket}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |s3.config.bucket=${config.coreStackProps.ConfigBucket}
        |dynamo.table.edits=EditsTable
        |indexed.images.sqs.queue.url=${config.coreStackProps.IndexedImageMetadataQueue.replace("http://localhost:4576", `https://localstack.media.${config.DOMAIN}`)}
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getS3WatcherConfig(config) {
    return stripMargin`
        |aws.region=${config.AWS_DEFAULT_REGION}
        |loader.uri=https://loader.${config.DOMAIN}
        |auth.key.s3watcher=${config.s3Watcher.key}
        |s3.ingest.bucket=${config.coreStackProps.S3WatcherIngestBucket}
        |s3.fail.bucket=${config.coreStackProps.S3WatcherFailBucket}
        |`;
}

function getThrallConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |s3.image.bucket=${config.coreStackProps.ImageBucket}
        |s3.thumb.bucket=${config.coreStackProps.ThumbBucket}
        |persistence.identifier=picdarUrn
        |es.index.aliases.write=writeAlias
        |es.index.aliases.read=readAlias
        |indexed.image.sns.topic.arn=${config.coreStackProps.IndexedImageTopic}
        |es7.url=${config.es7.url}
        |es7.cluster=${config.es7.cluster}
        |es7.shards=${config.es7.shards}
        |es7.replicas=${config.es7.replicas}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallMessageStream}
        |thrall.kinesis.lowPriorityStream.name=${config.coreStackProps.ThrallLowPriorityMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |metrics.request.enabled=false
        |`;
}

function getUsageConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.coreStackProps.KeyBucket}
        |capi.live.url=${config.guardian.capi.live.url}
        |capi.apiKey=${config.guardian.capi.live.key}
        |dynamo.tablename.usageRecordTable=UsageRecordTable
        |composer.baseUrl=composer.${config.DOMAIN}
        |thrall.kinesis.stream.name=${config.coreStackProps.ThrallLowPriorityMessageStream}
        |aws.local.endpoint=https://localstack.media.${config.DOMAIN}
        |crier.live.arn=${config.guardian.crier.live.roleArn}
        |crier.preview.arn=${config.guardian.crier.preview.roleArn}
        |crier.preview.name=${config.guardian.crier.preview.streamName}
        |crier.live.name=${config.guardian.crier.live.streamName}
        |app.name=usage
        |security.cors.allowedOrigins=${getCorsAllowedOriginString(config)}
        |metrics.request.enabled=false
        |`;
}

function getGridProdConfig(config) {
  return stripMargin`
    |auth.useLocal=true
    |panda.userDomain=${config.EMAIL_DOMAIN}
    |panda.bucketName=${config.authStackProps.PanDomainBucket}
    |permissions.bucket=${config.authStackProps.PermissionsBucket}
    |`;
}

module.exports = {
    getCoreConfigs: (config) => {
        return {
            auth: getAuthConfig(config),
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
