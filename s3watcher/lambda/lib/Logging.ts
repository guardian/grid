export interface LoggingFields {
  [key: string]: string | number
}

type Log = (msg: string, fields?: LoggingFields) => void

export interface Logger {
  info: Log
  warn: Log
  error: Log
}

export const createLogger = function (
  baseFields: LoggingFields,
  logger: (fields: LoggingFields) => void = log
): Logger {
  return {
    info: logWithBaseFields({ ...baseFields, level: "INFO" }, logger),
    warn: logWithBaseFields({ ...baseFields, level: "WARN" }, logger),
    error: logWithBaseFields({ ...baseFields, level: "ERROR" }, logger),
  }
}

const logWithBaseFields = function (
  baseFields: LoggingFields,
  logger: (fields: LoggingFields) => void
): Log {
  return (msg: string, fields?: LoggingFields) => {
    const extraFields = fields === undefined ? {} : fields
    logger({ ...baseFields, ...extraFields, message: msg })
  }
}

const log = function (fields: LoggingFields = {}) {
  console.log(JSON.stringify(fields)) // eslint-disable-line no-console
}
