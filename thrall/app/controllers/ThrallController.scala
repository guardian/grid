package controllers

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.elasticsearch.Running
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{CreateMigrationIndexMessage, MigrateImageMessage, MigrationMessage}
import lib.OptionalFutureRunner
import lib.elasticsearch.ElasticSearch
import org.joda.time.{DateTime, DateTimeZone}
import play.api.data.Form
import play.api.data.Forms._
import play.api.mvc.{Action, AnyContent, ControllerComponents}

import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}

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

      currentIndexCountFormatted = currentIndexCount.map(_.catCount.toString).getOrElse("!")
      migrationIndexCountFormatted = migrationIndexCount.map(_.catCount.toString).getOrElse("-")
    } yield {
      Ok(views.html.index(
        currentAlias = es.imagesCurrentAlias,
        currentIndex = currentIndexName.getOrElse("ERROR - No index found! Please investigate this!"),
        currentIndexCount = currentIndexCountFormatted,
        migrationAlias = es.imagesMigrationAlias,
        migrationIndexCount = migrationIndexCountFormatted,
        migrationStatus = es.migrationStatus
      ))
    }
  }

  def migrationFailures(maybePage: Option[Int]): Action[AnyContent] = withLoginRedirectAsync {
    val pageSize = 250
    // pages are indexed from 1
    val page = maybePage.getOrElse(1)
    val from = (page - 1) * pageSize
    if (page < 1) {
      Future.successful(BadRequest(s"Value for page parameter should be >= 1"))
    } else {
      es.migrationStatus match {
        case running: Running =>
          es.getMigrationFailures(es.imagesCurrentAlias, running.migrationIndexName, from, pageSize).map(failures =>
            Ok(views.html.migrationFailures(
              apiBaseUrl = services.apiBaseUri,
              uiBaseUrl = services.kahunaBaseUri,
              page = page,
              failures = failures
            ))
          )
        case _ => Future.successful(Ok("No current migration"))
      }
    }
  }

  implicit val pollingMaterializer: ActorMaterializer = ActorMaterializer()(actorSystem)

  def startMigration = withLoginRedirectAsync {
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
            }{ _ =>
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

