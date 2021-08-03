package controllers

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.config.Services
import lib.OptionalFutureRunner
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.CreateMigrationIndexMessage
import lib.elasticsearch.ElasticSearch
import org.joda.time.{DateTime, DateTimeZone}
import play.api.mvc.ControllerComponents

import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext}

class ThrallController(
  es: ElasticSearch,
  messageSender: ThrallMessageSender,
  actorSystem: ActorSystem,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents
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
        migrationIndex = migrationIndexName,
        migrationIndexCount = migrationIndexCountFormatted
      ))
    }
  }

  implicit val pollingMaterializer:ActorMaterializer = ActorMaterializer()(actorSystem)

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

}
