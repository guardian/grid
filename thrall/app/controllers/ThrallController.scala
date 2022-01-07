package controllers

import akka.actor.ActorSystem
import akka.stream.{ActorMaterializer, Materializer}
import akka.stream.scaladsl.{Sink, Source}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.elasticsearch.{NotRunning, Running}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{CompleteMigrationMessage, CreateMigrationIndexMessage, MigrateImageMessage, MigrationMessage}
import lib.OptionalFutureRunner
import lib.elasticsearch.ElasticSearch
import org.joda.time.{DateTime, DateTimeZone}
import play.api.data.Form
import play.api.data.Forms._
import play.api.mvc.{Action, AnyContent, ControllerComponents}

import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}

import scala.language.postfixOps

case class MigrateSingleImageForm(id: String)

class ThrallController(
  es: ElasticSearch,
  sendMigrationMessage: MigrationMessage => Future[Boolean],
  messageSender: ThrallMessageSender,
  actorSystem: ActorSystem,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents,
  gridClient: GridClient
)(implicit val ec: ExecutionContext) extends BaseControllerWithLoginRedirects with GridLogging {

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

      currentIndexCountFormatted = currentIndexCount.map(_.catCount.toString).getOrElse("!")
      migrationIndexCountFormatted = migrationIndexCount.map(_.catCount.toString).getOrElse("-")
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

  def migrationFailuresOverview(): Action[AnyContent] = withLoginRedirectAsync {
    es.migrationStatus match {
      case running: Running =>
        es.getMigrationFailuresOverview(es.imagesCurrentAlias, running.migrationIndexName).map(failuresOverview =>
          Ok(views.html.migrationFailuresOverview(
            failuresOverview,
            apiBaseUrl = services.apiBaseUri,
            uiBaseUrl = services.kahunaBaseUri,
          ))
        )
      case _ => for {
        currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias)
        currentIndexName <- currentIndex.map(_.name).map(Future.successful).getOrElse(Future.failed(new Exception(s"No index found for '${es.imagesCurrentAlias}' alias")))
        failuresOverview <- es.getMigrationFailuresOverview(es.imagesHistoricalAlias, currentIndexName)
        response = Ok(views.html.migrationFailuresOverview(
          failuresOverview,
          apiBaseUrl = services.apiBaseUri,
          uiBaseUrl = services.kahunaBaseUri,
        ))
      } yield response
    }
  }

  def migrationFailures(filter: String, maybePage: Option[Int]): Action[AnyContent] = withLoginRedirectAsync {
    val pageSize = 250
    // pages are indexed from 1
    val page = maybePage.getOrElse(1)
    val from = (page - 1) * pageSize
    if (page < 1) {
      Future.successful(BadRequest(s"Value for page parameter should be >= 1"))
    } else {
      es.migrationStatus match {
        case running: Running =>
          es.getMigrationFailures(es.imagesCurrentAlias, running.migrationIndexName, from, pageSize, filter).map(failures =>
            Ok(views.html.migrationFailures(
              failures,
              apiBaseUrl = services.apiBaseUri,
              uiBaseUrl = services.kahunaBaseUri,
              filter,
              page,
              shouldAllowReattempts = true
            ))
          )
        case _ => for {
          currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias)
          currentIndexName <- currentIndex.map(_.name).map(Future.successful).getOrElse(Future.failed(new Exception(s"No index found for '${es.imagesCurrentAlias}' alias")))
          failures <- es.getMigrationFailures(es.imagesHistoricalAlias, currentIndexName, from, pageSize, filter)
          response = Ok(views.html.migrationFailures(
            failures,
            apiBaseUrl = services.apiBaseUri,
            uiBaseUrl = services.kahunaBaseUri,
            filter,
            page,
            shouldAllowReattempts = false
          ))
        } yield response
      }
    }
  }

  implicit val pollingMaterializer = Materializer.matFromSystem(actorSystem)

  def startMigration = withLoginRedirectAsync { implicit request =>

    if(Form(single("start-confirmation" -> text)).bindFromRequest.get != "start"){
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
            gitHash = utils.buildinfo.BuildInfo.gitCommitId
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

  def completeMigration: Action[AnyContent] = withLoginRedirectAsync { implicit request =>

    if(Form(single("complete-confirmation" -> text)).bindFromRequest.get != "complete"){
      Future.successful(BadRequest("you did not enter 'complete' in the text box"))
    } else {
      es.refreshAndRetrieveMigrationStatus() match {
        case _: Running =>
          messageSender.publish(CompleteMigrationMessage(
            lastModified = DateTime.now(DateTimeZone.UTC),
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

  def pauseMigration = withLoginRedirect {
    es.pauseMigration
    es.refreshAndRetrieveMigrationStatus()
    Redirect(routes.ThrallController.index)
  }

  def resumeMigration = withLoginRedirect {
    es.resumeMigration
    es.refreshAndRetrieveMigrationStatus()
    Redirect(routes.ThrallController.index)
  }

  def migrateSingleImage: Action[AnyContent] = withLoginRedirectAsync { implicit request =>
    val imageId = migrateSingleImageFormReader.bindFromRequest.get.id

    val migrateImageMessage = (
      for {
        maybeProjection <- gridClient.getImageLoaderProjection(mediaId = imageId, auth.innerServiceCall)
        maybeVersion <- es.getImageVersion(imageId)
      } yield MigrateImageMessage(imageId, maybeProjection, maybeVersion)
    ).recover {
      case error => MigrateImageMessage(imageId, Left(error.toString))
    }

    val msgFailedToMigrateImage = s"Failed to send migrate image message ${imageId}"
    migrateImageMessage.flatMap(message => sendMigrationMessage(message).map{
      case true => Ok(s"Image migration message sent successfully with id:${imageId}")
      case _ => InternalServerError(msgFailedToMigrateImage)
    })
  }

  val migrateSingleImageFormReader: Form[MigrateSingleImageForm] = Form(
    mapping(
      "id" -> text
    )(MigrateSingleImageForm.apply)(MigrateSingleImageForm.unapply)
  )
}

