package com.gu.mediaservice.model

import play.api.libs.json.{Json, OFormat}

case class FilterPanelItem(
  `type`: String,
  filterType: String,
  key: String,
  value: String,
  count: Option[Int] = None
) {
  def asQueryClauseString: String = {
    if (`type` != "filter") {
      throw new UnsupportedOperationException("Only filter type is supported")
    }
    s"""${if (filterType == "exclusion") "-" else ""}$key:"$value""""
  }
}

case object FilterPanelItem {
  implicit val format: OFormat[FilterPanelItem] = Json.format[FilterPanelItem]
}
