package lib.elasticsearch

import play.api.libs.json.{Json, OFormat}

sealed trait MigrationEsInfo

object MigrationEsInfo {
  implicit val migratedToFormat: OFormat[MigratedTo] = Json.format[MigratedTo]
  implicit val migrationFailuresFormat: OFormat[MigrationFailures] = Json.format[MigrationFailures]
  implicit val format: OFormat[MigrationEsInfo] = Json.format[MigrationEsInfo]
}

case class MigratedTo(
  migratedTo: List[String]
) extends MigrationEsInfo

case class MigrationFailures(
  failures: List[String]
) extends MigrationEsInfo
