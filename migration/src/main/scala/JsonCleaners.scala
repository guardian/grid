import play.api.libs.json._

trait JsonCleaners {

  val stripNullsFromSuggestMetadataCredit: Reads[JsObject] = (__ \ "suggestMetadataCredit" \ "input").json.update{ a =>
    JsSuccess(a match {
      case JsArray(i) =>
        JsArray(i.filter(_ != JsNull))
      case _ =>
        a
    })
  }

  val pruneUnusedLeasesCurrentField: Reads[JsObject] = (__ \ "leases" \ "current").json.prune

}
