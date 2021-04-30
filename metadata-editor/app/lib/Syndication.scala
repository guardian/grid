package lib

import com.gu.mediaservice.lib.aws.{DynamoDB, NoItemFound, UpdateMessage}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Edits, Photoshoot, SyndicationRights}
import com.gu.mediaservice.syntax.MessageSubjects
import org.joda.time.DateTime
import play.api.libs.json.{JsNull, JsString, Reads}

import scala.concurrent.{ExecutionContext, Future}

trait Syndication extends Edit with MessageSubjects with GridLogging {

  def syndicationStore: SyndicationStore

  private val syndicationRightsFieldName = "syndicationRights"

  private def timedFuture[T](label: String, f : => Future[T])(implicit ec: ExecutionContext): Future[T] = {
    val timeBefore = DateTime.now().getMillis
    val result = f
      result.onComplete { _ =>
        val timeAfter = DateTime.now().getMillis
        logger.info(s"$label took ${timeAfter - timeBefore} milliseconds")
      }
    result
  }

  private[lib] def publishChangedSyndicationRightsForPhotoshoot[T](id: String, unchangedPhotoshoot: Boolean = false, photoshoot: Option[Photoshoot] = None)(f: () => Future[T])
                                                                  (implicit ec: ExecutionContext): Future[T] =
    for {
      oldPhotoshootMaybe <- getPhotoshootForImage(id)
      newPhotoshootMaybe = if (unchangedPhotoshoot) None else photoshoot  // if None, the get rights calls (below) will return none.
      allImageRightsInOldPhotoshootBefore <- timedFuture("Get old photoshoot rights before", getAllImageRightsInPhotoshoot(oldPhotoshootMaybe))
      allImageRightsInNewPhotoshootBefore <- timedFuture("Get new photoshoot rights before", getAllImageRightsInPhotoshoot(newPhotoshootMaybe))
      result <- f()
      allImageRightsInOldPhotoshootAfter <- timedFuture("Get old photoshoot rights after", getAllImageRightsInPhotoshoot(oldPhotoshootMaybe))
      allImageRightsInNewPhotoshootAfter <- timedFuture("Get new photoshoot rights after", getAllImageRightsInPhotoshoot(newPhotoshootMaybe))
      oldChangedRights = getChangedRights(allImageRightsInOldPhotoshootBefore, allImageRightsInOldPhotoshootAfter)
      newChangedRights = getChangedRights(allImageRightsInNewPhotoshootBefore, allImageRightsInNewPhotoshootAfter)
      _ <- timedFuture("Publish the photoshoot rights updates", publish(oldChangedRights ++ newChangedRights, UpdateImageSyndicationMetadata))
    } yield {
      logger.info(s"Changed rights on old photoshoot ($oldPhotoshootMaybe): ${oldChangedRights.size}")
      logger.info(s"Changed rights on new photoshoot ($newPhotoshootMaybe): ${newChangedRights.size}")
      result
    }

  def deletePhotoshootAndPublish(id: String)
                                (implicit ec: ExecutionContext): Future[Unit] =
    publishChangedSyndicationRightsForPhotoshoot[Unit](id, unchangedPhotoshoot = false) { () =>
      for {
        edits <- editsStore.removeKey(id, Edits.Photoshoot)
        _ <- editsStore.removeKey(id, Edits.PhotoshootTitle)
        _ = publish(id, UpdateImagePhotoshootMetadata)(edits)
      } yield Unit
    }

  def setPhotoshootAndPublish(id: String, newPhotoshoot: Photoshoot)
                             (implicit ec: ExecutionContext): Future[Photoshoot] = {
    publishChangedSyndicationRightsForPhotoshoot[Photoshoot](id, photoshoot = Some(newPhotoshoot)) { () =>
      for {
        editsAsJsonResponse <- editsStore.jsonAdd(id, Edits.Photoshoot, DynamoDB.caseClassToMap(newPhotoshoot))
        _ <- editsStore.stringSet(id, Edits.PhotoshootTitle, JsString(newPhotoshoot.title)) // store - don't care about return
        _ = publish(id, UpdateImagePhotoshootMetadata)(editsAsJsonResponse)
      } yield newPhotoshoot
    }
  }

  def deleteSyndicationAndPublish(id: String)
                                 (implicit ec: ExecutionContext): Future[Unit] = {
    publishChangedSyndicationRightsForPhotoshoot[Unit](id, unchangedPhotoshoot = true) { () =>
      syndicationStore.deleteItem(id)
      // Always publish, in case there is no photoshoot
      publish(Map(id -> None), UpdateImageSyndicationMetadata)
    }
  }

  def setSyndicationAndPublish(id: String, syndicationRight: SyndicationRights)
                              (implicit ec: ExecutionContext): Future[SyndicationRights] =
    publishChangedSyndicationRightsForPhotoshoot[SyndicationRights](id, unchangedPhotoshoot = true) { () =>
      val result = syndicationStore.jsonAdd (id, syndicationRightsFieldName, DynamoDB.caseClassToMap (syndicationRight)).map(_=>syndicationRight)
      // Always publish, in case there is no photoshoot
      publish(Map(id -> Some(syndicationRight)), UpdateImageSyndicationMetadata)
      result
    }

  def getSyndicationForImage(id: String)
                            (implicit ec: ExecutionContext): Future[Option[SyndicationRights]] = {
    syndicationStore.jsonGet(id, syndicationRightsFieldName)
      // It's OK for the image to _not_ exist in the syndication store, so this needs to be recovered
      .recover { case NoItemFound => JsNull }
      .flatMap(dynamoEntry => (dynamoEntry \ syndicationRightsFieldName).toOption match {
        // If image has its own rights, return those rights, with isInferred false
        case Some(rights) => Future.successful(Some(rights.as[SyndicationRights].copy(isInferred = false)))
        // If the image does not have it's own rights, get rights for the photoshoot
        case None => getRightsByPhotoshoot(id)
      })
  }

  private def getRightsByPhotoshoot(id: String)
                           (implicit ec: ExecutionContext): Future[Option[SyndicationRights]] =
    getPhotoshootForImage(id)
      // It's ok for the image to _not_ exist in the edits store - it may have no photoshoot (or any other edit)
      .recover { case NoItemFound => None }
      .flatMap { photoshootMaybe: Option[Photoshoot] =>
        photoshootMaybe match {
          //  If image is not in a photoshoot, return no rights
          case None => Future.successful(None)
          //  If image is in a photo shoot, find the most recently published image and return those rights, with isInferred true
          case Some(photoshoot) =>
            getAllImageRightsInPhotoshoot(photoshoot)
              .map ( m => getMostRecentInferrableSyndicationRights(m.values.toList))
        }
      }

  private def getRightsForImages(ids: List[String], nonInferredRights: Map[String, SyndicationRights], inferrableRights: Option[SyndicationRights])
                                (implicit ec: ExecutionContext, rjs: Reads[SyndicationRights]): Map[String, SyndicationRights] = {
    inferrableRights match {
      case Some(rights) =>
        val inferredRights = (ids.toSet -- nonInferredRights.keySet)
          .map(id => id -> rights)
          .toMap
        inferredRights ++ nonInferredRights
      case None => nonInferredRights
    }
  }

  def getMostRecentInferrableSyndicationRights(list: List[SyndicationRights]): Option[SyndicationRights] = list
    .filter(_.published.nonEmpty).sortBy(_.published.map(-_.getMillis)).headOption.map(r => r.copy(isInferred = true))

  def getAllImageRightsInPhotoshoot(photoshootMaybe: Option[Photoshoot])
                                   (implicit ec: ExecutionContext): Future[Map[String, SyndicationRights]] =
    photoshootMaybe.map(photoshoot => getAllImageRightsInPhotoshoot(photoshoot))
      .getOrElse(Future.successful(Map.empty[String, SyndicationRights]))

  def getAllImageRightsInPhotoshoot(photoshoot: Photoshoot)
                                   (implicit ec: ExecutionContext): Future[Map[String, SyndicationRights]] = for {
    imageIds <- getImagesInPhotoshoot(photoshoot)
    allNonInferredRights <- syndicationStore.batchGet(imageIds, syndicationRightsFieldName)
  } yield {
    logger.info(s"Found non-inferred rights for ${allNonInferredRights.size} of ${imageIds.size} images in photoshoot ${photoshoot.title}")
    val mostRecentInferrableRightsMaybe = getMostRecentInferrableSyndicationRights(allNonInferredRights.values.toList)
    getRightsForImages(imageIds, allNonInferredRights, mostRecentInferrableRightsMaybe)
  }

  def getImagesInPhotoshoot(photoshoot: Photoshoot)
                           (implicit ec: ExecutionContext): Future[List[String]] =
      editsStore.scanForId(config.editsTablePhotoshootIndex, Edits.PhotoshootTitle, photoshoot.title)
        .recover { case NoItemFound => Nil }

  def getChangedRights(before: Map[String, SyndicationRights], after: Map[String, SyndicationRights]): Map[String, Option[SyndicationRights]] = {
    // Rights in 'after' which do not have an exact equal in 'before'
    // Rights in 'before' which are not present at all in 'after', so have no inferred rights now
    (after.toSet -- before.toSet).toMap.map(kv => kv._1 -> Some(kv._2)) ++
      (before.keySet -- after.keySet).map(id => id -> None)
  }

  def getPhotoshootForImage(id: String)
                           (implicit ec: ExecutionContext): Future[Option[Photoshoot]] =
    editsStore.jsonGet(id, Edits.Photoshoot)
      .map(dynamoEntry => (dynamoEntry \ Edits.Photoshoot).toOption map {
        photoshootJson => photoshootJson.as[Photoshoot]
      })
      .recover { case NoItemFound => None }

  def publish(imagesInPhotoshoot: Map[String, Option[SyndicationRights]], subject: String)
             (implicit ec: ExecutionContext): Future[Unit] = Future {
    for (kv <- imagesInPhotoshoot) {
      val (k, v) = kv
      val updateMessage = UpdateMessage(subject = subject, id = Some(k), syndicationRights = v)
      notifications.publish(updateMessage)
    }
  }

}
