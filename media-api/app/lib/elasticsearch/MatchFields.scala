package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.ImageFields

class MatchFields(queriableIdentifiers: Seq[String]) extends ImageFields {
  val matchFields: Seq[String] = Seq("id") ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference", "englishAnalysedCatchAll").map(metadataField) ++
    Seq("labels").map(editsField) ++
    queriableIdentifiers.map(identifierField) ++
    Seq("restrictions").map(usageRightsField)
}
