const messages = {
    DOWNLOAD: "Downloading from ingest bucket.",
    UPLOAD: "Uploading to image-loader.",
    DELETE: "Deleting from ingest bucket.",
    COPY_TO_FAIL: "Copying to fail bucket.",
    RECORD: "Recording result to Cloud Watch",
    UPLOAD_FAIL: "Upload failed.",

    LAMBDA_ERROR: "Lambda failure",
    LAMBDA_SUCCESS: "Finished successfully."
};

const level = {
    INFO: "INFO",
    ERROR: "ERROR"
};

const baseMessage = function (stage, message, level, state) {
    return {
        stage: stage,
        stack: "media-service",
        app: "s3-watcher",
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        state: state
    };
};

const log = function (stage, message, state) {
    console.log(baseMessage(stage, message, level.INFO, state));
};

module.exports = {
    messages: messages,

    log: function (stage, messageKey, state) {
        log(stage, messageKey, state)
    },

    logDownload: function (stage, state) {
        log(state, messages.DOWNLOAD, state);
    },

    logUpload: function (stage, state) {
        log(state, messages.UPLOAD, state);
    },

    logDelete: function (stage, state) {
        log(state, messages.DELETE, state);
    },

    logCopyToFailBucket: function (stage, state) {
        log(state, messages.COPY_TO_FAIL, state);
    },

    logRecordToCloudWatch: function (stage, state) {
        log(state, messages.RECORD, state);
    },

    logUploadFail: function (stage, state) {
        log(state, messages.UPLOAD_FAIL, state);
    },

    logLambdaSuccess: function (stage, state) {
        log(state, messages.LAMBDA_SUCCESS, state);
    },

    logLambdaError: function (stage, state, err) {
        const msg = baseMessage(stage, messages.LAMBDA_ERROR, level.ERROR, state);
        msg['error'] = err;
        console.log(msg);
    }
};
