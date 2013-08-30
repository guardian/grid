package lib

import play.api.{Logger, Configuration, Play}


object Config {

  import play.api.Play.current

  val stage: String = Option(System.getenv("STAGE")) getOrElse "DEV"

  Logger.info(s"Stage: $stage")

  val stageConfig: Configuration =
    Play.configuration.getConfig(stage) getOrElse sys.error(s"No configuration found for stage: $stage")

  def apply(key: String): String =
    stageConfig.getString(key) getOrElse sys.error(s"Required configuration property missing: $key")

  def int(key: String): Int =
    stageConfig.getInt(key) getOrElse sys.error(s"Required configuration property missing: $key")

}
