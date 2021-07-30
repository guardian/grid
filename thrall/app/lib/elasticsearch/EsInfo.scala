package lib.elasticsearch

import play.api.libs.json.Json

case class MigrationEsInfo(
  migratedTo: List[String] = Nil,
  failures: List[String] = Nil,
)
object MigrationEsInfo {
  implicit val format = Json.format[MigrationEsInfo]
}

case class EsInfo(migration: Option[MigrationEsInfo] = None)
object EsInfo {
  implicit val format = Json.format[EsInfo]
}

