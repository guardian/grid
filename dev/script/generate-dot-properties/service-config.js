function stripMargin(template, ...args) {
    const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
    return result.replace(/\r?(\n)\s*\|/g, '$1');
}

function getAuthConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |`;
}

function getCollectionsConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.collections.bucket=${config.stackProps.CollectionsBucket}
        |dynamo.table.collections=CollectionsTable
        |dynamo.table.imageCollections=ImageCollectionsTable
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getCropperConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |publishing.image.bucket=${config.stackProps.ImageOriginBucket}
        |publishing.image.host=public.media.${config.DOMAIN}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getImageLoaderConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getKahunaConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
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
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |security.frameAncestors=https://*.${config.DOMAIN}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |`;
}

function getLeasesConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |dynamo.tablename.leasesTable=LeasesTable
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getMediaApiConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |s3.usagemail.bucket=${config.stackProps.UsageMailBucket}
        |persistence.identifier=picdarUrn
        |es.index.aliases.read=readAlias
        |es6.url=${config.es6.url}
        |es6.cluster=${config.es6.cluster}
        |es6.shards=${config.es6.shards}
        |es6.replicas=${config.es6.replicas}
        |quota.store.key=rcs-quota.json
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getMetadataEditorConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.collections.bucket=${config.stackProps.CollectionsBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |dynamo.table.edits=EditsTable
        |indexed.images.sqs.queue.url=${config.stackProps.IndexedImageMetadataQueue.replace("http://localhost:4576", config.LOCALSTACK_ENDPOINT)}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

function getS3WatcherConfig(config) {
    return stripMargin`
        |aws.region=${config.AWS_DEFAULT_REGION}
        |loader.uri=https://loader.${config.DOMAIN}
        |auth.key.s3watcher=${config.s3Watcher.key}
        |s3.ingest.bucket=${config.stackProps.S3WatcherIngestBucket}
        |s3.fail.bucket=${config.stackProps.S3WatcherFailBucket}
        |`;
}

function getThrallConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |persistence.identifier=picdarUrn
        |es.index.aliases.write=writeAlias
        |es.index.aliases.read=readAlias
        |indexed.image.sns.topic.arn=${config.stackProps.IndexedImageTopic}
        |es6.url=${config.es6.url}
        |es6.cluster=${config.es6.cluster}
        |es6.shards=${config.es6.shards}
        |es6.replicas=${config.es6.replicas}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageStream}
        |thrall.kinesis.lowPriorityStream.name=${config.stackProps.ThrallLowPriorityMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |`;
}

function getUsageConfig(config) {
    return stripMargin`
        |domain.root=${config.DOMAIN}
        |aws.region=${config.AWS_DEFAULT_REGION}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |capi.live.url=${config.guardian.capi.live.url}
        |capi.apiKey=${config.guardian.capi.live.key}
        |dynamo.tablename.usageRecordTable=UsageRecordTable
        |composer.baseUrl=composer.${config.DOMAIN}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallLowPriorityMessageStream}
        |aws.local.endpoint=${config.LOCALSTACK_ENDPOINT}
        |crier.live.arn=${config.guardian.crier.live.roleArn}
        |crier.preview.arn=${config.guardian.crier.preview.roleArn}
        |crier.preview.name=${config.guardian.crier.preview.streamName}
        |crier.live.name=${config.guardian.crier.live.streamName}
        |app.name=usage
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |`;
}

module.exports = {
    getConfigs: (config) => {
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
    }
};
