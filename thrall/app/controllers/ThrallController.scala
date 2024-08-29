package controllers

import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.config.{InstanceForRequest, Services}
import com.gu.mediaservice.lib.elasticsearch.{NotRunning, Running}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{CompleteMigrationMessage, CreateMigrationIndexMessage, Instance, UpsertFromProjectionMessage}
import lib.elasticsearch.ElasticSearch
import lib.{MigrationRequest, OptionalFutureRunner, Paging, ThrallStore}
import org.joda.time.{DateTime, DateTimeZone}
import play.api.data.Form
import play.api.data.Forms._
import play.api.libs.json.Json
import play.api.mvc.{Action, AnyContent, ControllerComponents}

import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.language.postfixOps

case class MigrateSingleImageForm(id: String)

class ThrallController(
  es: ElasticSearch,
  store: ThrallStore,
  sendMigrationRequest: MigrationRequest => Future[Boolean],
  messageSender: ThrallMessageSender,
  actorSystem: ActorSystem,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents,
  gridClient: GridClient
)(implicit val ec: ExecutionContext) extends BaseControllerWithLoginRedirects with GridLogging with InstanceForRequest {

  private val numberFormatter: Long => String = java.text.NumberFormat.getIntegerInstance().format

  def index = withLoginRedirectAsync {
    val countDocsInIndex = OptionalFutureRunner.run(es.countImages) _
    for {
      currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias)
      currentIndexName = currentIndex.map(_.name)
      currentIndexCount <- countDocsInIndex(currentIndexName)

      migrationIndex <- es.getIndexForAlias(es.imagesMigrationAlias)
      migrationIndexName = migrationIndex.map(_.name)
      migrationIndexCount <- countDocsInIndex(migrationIndexName)

      historicalIndex <- es.getIndexForAlias(es.imagesHistoricalAlias)

      currentIndexCountFormatted = currentIndexCount.map(_.catCount).map(numberFormatter).getOrElse("!")
      migrationIndexCountFormatted = migrationIndexCount.map(_.catCount).map(numberFormatter).getOrElse("-")
    } yield {
      Ok(views.html.index(
        currentAlias = es.imagesCurrentAlias,
        currentIndex = currentIndexName.getOrElse("ERROR - No index found! Please investigate this!"),
        currentIndexCount = currentIndexCountFormatted,
        migrationAlias = es.imagesMigrationAlias,
        migrationIndexCount = migrationIndexCountFormatted,
        migrationStatus = es.migrationStatus,
        hasHistoricalIndex = historicalIndex.isDefined,
      ))
    }
  }

  def upsertProjectPage(imageId: Option[String]) = withLoginRedirectAsync { implicit request =>
    implicit val i: Instance = instanceOf(request)
    imageId match {
      case Some(id) if store.doesOriginalExist(id) =>
        gridClient.getProjectionDiff(id, auth.innerServiceCall).map {
          case None => NotFound("couldn't generate projection for that image!!")
          case Some(diff) => Ok(views.html.previewUpsertProject(id, Json.prettyPrint(diff)))
        }
      case Some(_) => Future.successful(Redirect(routes.ThrallController.restoreFromReplica))
      case None => Future.successful(Ok(views.html.upsertProject()))
    }
  }

  def migrationFailuresOverview(): Action[AnyContent] = withLoginRedirectAsync { request =>
    val instance = instanceOf(request)
    es.migrationStatus match {
      case running: Running =>
        es.getMigrationFailuresOverview(es.imagesCurrentAlias, running.migrationIndexName).map(failuresOverview => {
          Ok(views.html.migrationFailuresOverview(
            failuresOverview,
            apiBaseUrl = services.apiBaseUri(instance),
            uiBaseUrl = services.kahunaBaseUri(instance)
          ))
        }
        )
      case _ => for {
        currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias)
        currentIndexName <- currentIndex.map(_.name).map(Future.successful).getOrElse(Future.failed(new Exception(s"No index found for '${es.imagesCurrentAlias}' alias")))
        failuresOverview <- es.getMigrationFailuresOverview(es.imagesHistoricalAlias, currentIndexName)
        response = Ok(views.html.migrationFailuresOverview(
          failuresOverview,
          apiBaseUrl = services.apiBaseUri(instance),
          uiBaseUrl = services.kahunaBaseUri(instance),
        ))
      } yield response
    }
  }

  def migrationFailures(filter: String, maybePage: Option[Int]): Action[AnyContent] = withLoginRedirectAsync { request =>
    val instance = instanceOf(request)
    Paging.withPaging(maybePage) { paging =>
      es.migrationStatus match {
        case running: Running =>
          es.getMigrationFailures(es.imagesCurrentAlias, running.migrationIndexName, paging.from, paging.pageSize, filter).map(failures =>
            Ok(views.html.migrationFailures(
              failures,
              apiBaseUrl = services.apiBaseUri(instance),
              uiBaseUrl = services.kahunaBaseUri(instance),
              filter,
              paging.page,
              shouldAllowReattempts = true
            ))
          )
        case _ => for {
          currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias)
          currentIndexName <- currentIndex.map(_.name).map(Future.successful).getOrElse(Future.failed(new Exception(s"No index found for '${es.imagesCurrentAlias}' alias")))
          failures <- es.getMigrationFailures(es.imagesHistoricalAlias, currentIndexName, paging.from, paging.pageSize, filter)
          response = Ok(views.html.migrationFailures(
            failures,
            apiBaseUrl = services.apiBaseUri(instance),
            uiBaseUrl = services.kahunaBaseUri(instance),
            filter,
            paging.page,
            shouldAllowReattempts = false
          ))
        } yield response
      }
    }
  }

  implicit val pollingMaterializer: Materializer = Materializer.matFromSystem(actorSystem)

  def startMigration = withLoginRedirectAsync { implicit request =>

    if(Form(single("start-confirmation" -> text)).bindFromRequest().get != "start"){
      Future.successful(BadRequest("you did not enter 'start' in the text box"))
    } else {
      val msgFailedToFetchIndex = s"Could not fetch ES index details for alias '${es.imagesMigrationAlias}'"
      es.getIndexForAlias(es.imagesMigrationAlias) recover { case error: Throwable =>
        logger.error(msgFailedToFetchIndex, error)
        InternalServerError(msgFailedToFetchIndex)
      } map {
        case Some(index) =>
          BadRequest(s"There is already an index '${index}' for alias '${es.imagesMigrationAlias}', and thus a migration underway.")
        case None =>
          messageSender.publish(CreateMigrationIndexMessage(
            migrationStart = DateTime.now(DateTimeZone.UTC),
            gitHash = utils.buildinfo.BuildInfo.gitCommitId,
            instanceOf(request).id
          ))
          // poll until images migration alias is created, giving up after 10 seconds
          Await.result(
            Source(1 to 20)
              .throttle(1, 500 millis)
              .mapAsync(parallelism = 1)(_ => es.getIndexForAlias(es.imagesMigrationAlias))
              .takeWhile(_.isEmpty, inclusive = true)
              .runWith(Sink.last)
              .map(_.fold {
                val timedOutMessage = s"Still no index for alias '${es.imagesMigrationAlias}' after 10 seconds."
                logger.error(timedOutMessage)
                InternalServerError(timedOutMessage)
              } { _ =>
                Redirect(routes.ThrallController.index)
              })
              .recover { case error: Throwable =>
                logger.error(msgFailedToFetchIndex, error)
                InternalServerError(msgFailedToFetchIndex)
              },
            atMost = 12 seconds
          )
      }
    }
  }

  def completeMigration(): Action[AnyContent] = withLoginRedirectAsync { implicit request =>

    if(Form(single("complete-confirmation" -> text)).bindFromRequest().get != "complete"){
      Future.successful(BadRequest("you did not enter 'complete' in the text box"))
    } else {
      es.refreshAndRetrieveMigrationStatus() match {
        case _: Running =>
          messageSender.publish(CompleteMigrationMessage(
            lastModified = DateTime.now(DateTimeZone.UTC),
            instanceOf(request).id
          ))
          // poll until images migration status is not running or error, giving up after 10 seconds
          Source(1 to 20)
            .throttle(1, 500 millis)
            .map(_ => es.refreshAndRetrieveMigrationStatus())
            .takeWhile(_.isInstanceOf[Running], inclusive = true)
            .runWith(Sink.last)
            .map {
              case NotRunning => Redirect(routes.ThrallController.index)
              case migrationStatus =>
                val timedOutMessage = s"MigrationStatus was still '$migrationStatus' after 10 seconds."
                logger.error(timedOutMessage)
                InternalServerError(timedOutMessage)
            }
        case migrationStatus =>
          Future.successful(
            BadRequest(s"MigrationStatus is $migrationStatus so cannot complete migration.")
          )
      }
    }
  }

  private def adjustMigration(action: () => Unit) = withLoginRedirect {
    action()
    es.refreshAndRetrieveMigrationStatus()
    Redirect(routes.ThrallController.index)
  }
  def pauseMigration = adjustMigration(es.pauseMigration _)
  def resumeMigration = adjustMigration(es.resumeMigration _)
  def previewMigrationCompletion = adjustMigration(es.previewMigrationCompletion _)
  def unPreviewMigrationCompletion = adjustMigration(es.unPreviewMigrationCompletion _)

  def migrateSingleImage: Action[AnyContent] = withLoginRedirectAsync { implicit request =>
    val imageId = migrateSingleImageFormReader.bindFromRequest().get.id

    es.getImageVersion(imageId) flatMap {

      case Some(version) =>
        sendMigrationRequest(MigrationRequest(imageId, version)).map {
          case true => Ok(s"Image migration queued successfully with id:$imageId")
          case false => InternalServerError(s"Failed to send migrate image message $imageId")
        }
      case None =>
        Future.successful(InternalServerError(s"Failed to send migrate image message $imageId"))
    }
  }

  def upsertFromProjectionSingleImage: Action[AnyContent] = withLoginRedirectAsync { implicit request =>
    implicit val instance: Instance = instanceOf(request)
    val imageId = migrateSingleImageFormReader.bindFromRequest().get.id

    for {
      maybeImage <- gridClient.getImageLoaderProjection(imageId, auth.innerServiceCall)
    } yield { maybeImage match {
      case Some(projectedImage) =>
        messageSender.publish(UpsertFromProjectionMessage(imageId, projectedImage, DateTime.now,
          instanceOf(request).id))
        Ok(s"upsert request for $imageId submitted")
      case None => NotFound("")
    }}
  }

  def restoreFromReplica: Action[AnyContent] = withLoginRedirect {implicit request =>
    Ok(views.html.restoreFromReplica(s"${services.loaderBaseUri(instanceOf(request))}/images/restore")) //FIXME figure out imageId bit
  }

  def reattemptMigrationFailures(filter: String, page: Int): Action[AnyContent] = withLoginRedirectAsync { implicit request =>
    Paging.withPaging(Some(page)) { paging =>
      es.migrationStatus match {
        case running: Running =>
          val migrationRequestsF = es.getMigrationFailures(es.imagesCurrentAlias, running.migrationIndexName, paging.from, paging.pageSize, filter).map(failures =>
            failures.details.map(detail => MigrationRequest(detail.imageId, detail.version))
          )
          for {
            migrationRequests <- migrationRequestsF
            successfulSubmissions <- Future.sequence(migrationRequests.map(sendMigrationRequest))
          } yield {
            val failures = successfulSubmissions.count(_ == false)
            if (failures == 0) {
              Ok("Submitted all failures for reattempted migration")
            } else {
              InternalServerError(s"Failed to submit $failures images for reattempted migration")
            }
          }
        case _ => Future.successful(InternalServerError("Cannot resubmit images; migration is not running"))
      }
    }
  }

  val migrateSingleImageFormReader: Form[MigrateSingleImageForm] = Form(
    mapping(
      "id" -> text
    )(MigrateSingleImageForm.apply)(MigrateSingleImageForm.unapply)
  )
}
