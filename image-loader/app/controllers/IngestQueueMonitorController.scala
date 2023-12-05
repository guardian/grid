package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{SimpleSqsMessageConsumer, SqsHelpers}
import lib._
import play.api.mvc._

class IngestQueueMonitorController(
  auth: Authentication,
  maybeIngestQueue: Option[SimpleSqsMessageConsumer],
  config: ImageLoaderConfig,
  override val controllerComponents: ControllerComponents,
  authorisation: Authorisation,
) extends BaseController with ArgoHelpers with SqsHelpers  {

  private val AuthenticatedAndAuthorised = auth andThen authorisation.CommonActionFilters.authorisedForUpload

  private def getIndexResponse: Result =  {
    maybeIngestQueue match {
      case None => respond("no ingest queue")
      case Some(ingestQueue) => getQueueStatus(ingestQueue)
    }
  }

  private def getQueueStatus(ingestQueue:SimpleSqsMessageConsumer) = {
    val status = ingestQueue.getStatus
    respond(status)
  }

  def index: Action[AnyContent] = AuthenticatedAndAuthorised { getIndexResponse }

}
