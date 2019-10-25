package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import lib.MediaApiConfig

trait MatchFields extends ImageFields {

  def config: MediaApiConfig

  val matchFields: Seq[String] = Seq("id") ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference",
      "peopleInImage", "englishAnalysedCatchAll").map(metadataField) ++
    Seq("labels").map(editsField) ++
    config.queriableIdentifiers.map(identifierField) ++
    Seq("restrictions").map(usageRightsField)

}
