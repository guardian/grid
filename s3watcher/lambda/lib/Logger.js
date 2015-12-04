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

const baseMessage = function (message, level, state) {
    return {
        stack: "media-service",
        app: "s3-watcher",
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        state: state
    };
};

module.exports = {
    messages: messages,

    log: function (messageKey, state) {
        console.log(baseMessage(messageKey, level.INFO, state));
    },

    error: function (state, err) {
        const msg = baseMessage(messages.LAMBDA_ERROR, level.ERROR, state);
        msg['error'] = err;
        console.log(msg);
    }
};
