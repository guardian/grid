package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import lib.MediaApiConfig

trait MatchFields extends ImageFields {

  def config: MediaApiConfig

  val matchFields: Seq[String] = Seq("id") ++ Seq("mimeType").map(sourceField) ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference",
      "peopleInImage", "specialInstructions", "englishAnalysedCatchAll",
      "imageType").map(metadataField) ++
    Seq("labels").map(editsField) ++
    Seq("restrictions").map(usageRightsField)

}
