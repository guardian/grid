function stripMargin(template, ...args) {
    const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
    return result.replace(/\r?(\n)\s*\|/g, '$1');
}

function getAuthConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |`;
}

function getCollectionsConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |dynamo.table.collections="${config.stackProps.CollectionsDynamoTable}"
        |dynamo.table.imageCollections="${config.stackProps.ImageCollectionsDynamoTable}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |`;
}

function getCropperConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |publishing.image.bucket="${config.stackProps.ImageOriginBucket}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |`;
}

function getImageLoaderConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |s3.image.bucket="${config.stackProps.ImageBucket}"
        |s3.thumb.bucket="${config.stackProps.ThumbBucket}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |`;
}

function getKahunaConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |origin.full="${config.stackProps.ImageBucket}.s3.${config.aws.region}.amazonaws.com"
        |origin.thumb="${config.stackProps.ThumbBucket}.s3.${config.aws.region}.amazonaws.com"
        |origin.images="${config.stackProps.ImageBucket}.s3.${config.aws.region}.amazonaws.com"
        |origin.crops="${config.stackProps.ImageOriginBucket}"
        |google.tracking.id="${config.google.tracking.id}"
        |`;
}

function getLeasesConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |dynamo.tablename.leasesTable="${config.stackProps.LeasesDynamoTable}"
        |`;
}

function getMediaApiConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |s3.image.bucket="${config.stackProps.ImageBucket}"
        |s3.thumb.bucket="${config.stackProps.ThumbBucket}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |es.index.aliases.read="readAlias"
        |es6.host="localhost"
        |es6.port=9206
        |es6.cluster="media-service"
        |es6.shards=1
        |es6.replicas=0
        |# TODO MRB: quota and usage should be optional
        |quota.store.key="rcs-quota.json"
        |s3.usagemail.bucket="${config.stackProps.UsageMailBucket}"
        |`;
}

function getMetadataEditorConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |domain.root="${config.domainRoot}"
        |panda.bucket.name="${config.panda.bucketName}"
        |panda.settings.key="${config.panda.settingsFileKey}"
        |panda.user.domain="${config.panda.userDomain}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |s3.collections.bucket="${config.stackProps.CollectionsBucket}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |dynamo.table.edits="${config.stackProps.EditsDynamoTable}"
        |indexed.images.sqs.queue.url="${config.stackProps.IndexedImageMetadataQueueUrl}"
        |`;
}

function getS3WatcherConfig(config) {
    return stripMargin`
        |aws.region="${config.aws.region}"
        |loader.uri="https://loader.${config.domainRoot}"
        |auth.key.s3watcher="${config.s3Watcher.key}"
        |s3.ingest.bucket="${config.stackProps.S3WatcherIngestBucket}"
        |s3.fail.bucket="${config.stackProps.S3WatcherFailBucket}"
        |`;
}

function getThrallConfig(config) {
    return stripMargin`
        |domain.root="${config.domainRoot}"
        |aws.region="${config.aws.region}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |s3.image.bucket="${config.stackProps.ImageBucket}"
        |s3.thumb.bucket="${config.stackProps.ThumbBucket}"
        |sqs.queue.url="${config.stackProps.SqsQueueUrl}"
        |thrall.kinesis.stream="${config.stackProps.ThrallMessageQueue}"
        |indexed.image.sns.topic.arn="${config.stackProps.IndexedImageTopicArn}"
        |es.index.aliases.write="writeAlias"
        |es6.host="localhost"
        |es6.port=9206
        |es6.cluster="media-service"
        |es6.shards=1
        |es6.replicas=0
        |`;
}

function getUsageConfig(config) {
    return stripMargin`
        |domain.root="${config.domainRoot}"
        |aws.region="${config.aws.region}"
        |auth.keystore.bucket="${config.stackProps.KeyBucket}"
        |capi.live.url="${config.capi.live.url}"
        |capi.apiKey="${config.capi.live.key}"
        |dynamo.tablename.usageRecordTable="${config.stackProps.UsageRecordTable}"
        |composer.baseUrl="${config.composer.url}"
        |sns.topic.arn="${config.stackProps.SnsTopicArn}"
        |crier.live.arn="${config.crier.live.roleArn}"
        |crier.preview.arn="${config.crier.preview.roleArn}"
        |crier.preview.name="${config.crier.preview.streamName}"
        |crier.live.name="${config.crier.live.streamName}"
        |app.name="usage"
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
            thrall: getThrallConfig(config)
//            usage: getUsageConfig(config)
        };
    }
};
