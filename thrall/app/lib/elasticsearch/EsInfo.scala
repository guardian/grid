package lib.elasticsearch

import play.api.libs.json.{Json, Writes}

case class MigrationInfo(failures: Option[Map[String, String]] = None, migratedTo: Option[String] = None)
object MigrationInfo {
  implicit val reads = Json.reads[MigrationInfo]
  implicit val writes: Writes[MigrationInfo] = (migrationInfo: MigrationInfo) => Json.obj(
    "migratedTo" -> migrationInfo.migratedTo,
    "failures" -> migrationInfo.failures.map(_.mapValues {
      case message if message.contains("failed to parse field") => message.substring(0, message.indexOf("in document with id"))
      case message if message.length > 256 => s"${message.take(253)}..."
      case message => message
    })
  )
}


case class EsInfo(migration: Option[MigrationInfo] = None)
object EsInfo {
  implicit val format = Json.format[EsInfo]
}
