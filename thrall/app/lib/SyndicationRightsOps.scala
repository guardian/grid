package lib

import com.gu.mediaservice.model.SyndicationRights
import org.elasticsearch.action.update.UpdateResponse

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(es: ElasticSearch)(implicit ex: ExecutionContext) {
  def upsertImageSyndicationRights(id: String, syndicationRights: Option[SyndicationRights]): List[Future[UpdateResponse]] = {
    es.updateImageSyndicationRights(id = id, syndicationRights)
  }
}
