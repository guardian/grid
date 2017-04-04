const messages = {
    IMPORT: "Importing via image-loader.",
    DELETE: "Deleting from ingest bucket.",
    COPY_TO_FAIL: "Copying to fail bucket.",
    RECORD: "Recording result to Cloud Watch",
    IMPORT_FAIL: "Import failed.",

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
    // eslint-disable-next-line no-console
    console.log(baseMessage(stage, message, level.INFO, state));
};

module.exports = {
    messages: messages,

    log: function (stage, messageKey, state) {
        log(stage, messageKey, state);
    },

    logImport: function (stage, state) {
        log(stage, messages.IMPORT, state);
    },

    logDelete: function (stage, state) {
        log(stage, messages.DELETE, state);
    },

    logCopyToFailBucket: function (stage, state) {
        log(stage, messages.COPY_TO_FAIL, state);
    },

    logRecordToCloudWatch: function (stage, state) {
        log(stage, messages.RECORD, state);
    },

    logImportFail: function (stage, state) {
        log(stage, messages.IMPORT_FAIL, state);
    },

    logLambdaSuccess: function (stage, state) {
        log(stage, messages.LAMBDA_SUCCESS, state);
    },

    logLambdaError: function (stage, state, err) {
        const msg = baseMessage(stage, messages.LAMBDA_ERROR, level.ERROR, state);
        msg['error'] = err;
        // eslint-disable-next-line no-console
        console.log(msg);
    }
};
