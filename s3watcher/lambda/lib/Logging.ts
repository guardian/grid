interface LoggingFields {
  [key: string]: string | number
}

type Log = (msg: string, fields?: LoggingFields) => void

export interface Logger {
  info: Log
  warn: Log
  error: Log
}

export const createLogger = function(baseFields: LoggingFields): Logger {
  return {
    info: logWithBaseFields({... baseFields, level: "INFO"}),
    warn: logWithBaseFields({... baseFields, level: "WARN"}),
    error: logWithBaseFields({... baseFields, level: "ERROR"})
  }
}

const logWithBaseFields = function(baseFields: LoggingFields): Log {
  return (msg: string, fields?: LoggingFields) => {
    const extraFields = fields === undefined ? {} : fields
    log({... baseFields, ... extraFields, message: msg})
  }
}

const log = function(fields: LoggingFields = {}) {
  console.log(JSON.stringify(fields)) // eslint-disable-line no-console
}