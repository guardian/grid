package lib

import java.io.File
import scala.io.Source.fromFile
import play.api.Play


object Config {

  val appConfig = Play.current.configuration

  def apply(key: String): String =
    string(key)

  def string(key: String): String =
    appConfig.getString(key) getOrElse missing(key, "string")

  def int(key: String): Int =
    appConfig.getInt(key) getOrElse missing(key, "integer")

  val stage: String = stageFromFile getOrElse "DEV"

  private def stageFromFile: Option[String] = {
    val file = new File("/etc/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")
}
