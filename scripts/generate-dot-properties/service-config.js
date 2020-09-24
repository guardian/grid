function stripMargin(template, ...args) {
    const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
    return result.replace(/\r?(\n)\s*\|/g, '$1');
}

function getAuthConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |aws.region=${config.aws.region}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getCollectionsConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.collections.bucket=${config.stackProps.CollectionsBucket}
        |dynamo.table.collections=${config.stackProps.CollectionsDynamoTable}
        |dynamo.table.imageCollections=${config.stackProps.ImageCollectionsDynamoTable}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getCropperConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |publishing.image.bucket=${config.stackProps.ImageOriginBucket}
        |publishing.image.host=${config.stackProps.ImageOriginBucket}.s3.amazonaws.com
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getImageLoaderConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getKahunaConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |aws.region=${config.aws.region}
        |origin.full=${config.stackProps.ImageBucket}.s3.${config.aws.region}.amazonaws.com
        |origin.thumb=${config.stackProps.ThumbBucket}.s3.${config.aws.region}.amazonaws.com
        |origin.images=${config.stackProps.ImageBucket}.s3.${config.aws.region}.amazonaws.com
        |origin.crops=${config.stackProps.ImageOriginBucket}
        |google.tracking.id=${config.google.tracking.id}
        |links.feedbackForm=${config.links.feedbackForm}
        |links.usageRightsHelp=${config.links.usageRightsHelp}
        |links.invalidSessionHelp=${config.links.invalidSessionHelp}
        |links.supportEmail=${config.links.supportEmail}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |security.frameAncestors=${config.security.frameAncestors}
        |metrics.request.enabled=false
        |`;
}

function getLeasesConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |dynamo.tablename.leasesTable=${config.stackProps.LeasesDynamoTable}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getMediaApiConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
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
        |metrics.request.enabled=false
        |`;
}

function getMetadataEditorConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |s3.config.bucket=${config.stackProps.ConfigBucket}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.collections.bucket=${config.stackProps.CollectionsBucket}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |dynamo.table.edits=${config.stackProps.EditsDynamoTable}
        |indexed.images.sqs.queue.url=${config.stackProps.IndexedImageMetadataQueueUrl}
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
        |`;
}

function getS3WatcherConfig(config) {
    return stripMargin`
        |aws.region=${config.aws.region}
        |loader.uri=https://loader.${config.domainRoot}
        |auth.key.s3watcher=${config.s3Watcher.key}
        |s3.ingest.bucket=${config.stackProps.S3WatcherIngestBucket}
        |s3.fail.bucket=${config.stackProps.S3WatcherFailBucket}
        |`;
}

function getThrallConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |s3.image.bucket=${config.stackProps.ImageBucket}
        |s3.thumb.bucket=${config.stackProps.ThumbBucket}
        |persistence.identifier=picdarUrn
        |es.index.aliases.write=writeAlias
        |es.index.aliases.read=readAlias
        |indexed.image.sns.topic.arn=${config.stackProps.IndexedImageTopicArn}
        |es6.url=${config.es6.url}
        |es6.cluster=${config.es6.cluster}
        |es6.shards=${config.es6.shards}
        |es6.replicas=${config.es6.replicas}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |metrics.request.enabled=false
        |`;
}

function getUsageConfig(config) {
    return stripMargin`
        |domain.root=${config.domainRoot}
        |aws.region=${config.aws.region}
        |auth.keystore.bucket=${config.stackProps.KeyBucket}
        |capi.live.url=${config.capi.live.url}
        |capi.apiKey=${config.capi.live.key}
        |dynamo.tablename.usageRecordTable=${config.stackProps.UsageRecordTable}
        |composer.baseUrl=${config.composer.url}
        |thrall.kinesis.stream.name=${config.stackProps.ThrallMessageQueue}
        |crier.live.arn=${config.crier.live.roleArn}
        |crier.preview.arn=${config.crier.preview.roleArn}
        |crier.preview.name=${config.crier.preview.streamName}
        |crier.live.name=${config.crier.live.streamName}
        |app.name=usage
        |security.cors.allowedOrigins=${config.security.corsAllowedOrigins}
        |metrics.request.enabled=false
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
