package lib.elasticsearch

import play.api.libs.json.{Format, JsResult, JsValue, Json}

case class MigrationTo(
  migratedTo: String
)
object MigrationTo {
  implicit val format = Json.format[MigrationTo]
}

case class MigrationFailure(
  failures: Map[String, String]
)
object MigrationFailure {
  implicit val format = Json.format[MigrationFailure]
}

case class EsInfo(migration: Option[Either[MigrationFailure, MigrationTo]] = None)
object EsInfo {
  implicit val eitherFormat: Format[Either[MigrationFailure, MigrationTo]] = new Format[Either[MigrationFailure, MigrationTo]] {
    def reads(json: JsValue): JsResult[Either[MigrationFailure, MigrationTo]] = {
      MigrationTo.format.reads(json) map {
        Right(_)
      }
    } orElse{
      MigrationFailure.format.reads(json) map {
        Left(_)
      }
    }

    def writes(c: Either[MigrationFailure, MigrationTo]) = c match {
      case Left(a) => MigrationFailure.format.writes(a)
      case Right(b) => MigrationTo.format.writes(b)
    }
  }
  implicit val format = Json.format[EsInfo]
}
