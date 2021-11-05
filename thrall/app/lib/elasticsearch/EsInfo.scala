package lib.elasticsearch

import play.api.libs.json.Json

case class MigrationInfo(failures: Option[Map[String, String]] = None, migratedTo: Option[String] = None)
object MigrationInfo {
  implicit val format = Json.format[MigrationInfo]
}

case class EsInfo(migration: Option[MigrationInfo] = None)
object EsInfo {
  implicit val format = Json.format[EsInfo]
}
