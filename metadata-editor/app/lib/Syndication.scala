package lib

import com.gu.mediaservice.lib.aws.{DynamoDB, NoItemFound, UpdateMessage}
import com.gu.mediaservice.model.{Edits, Photoshoot, SyndicationRights}
import com.gu.mediaservice.syntax.MessageSubjects
import play.api.libs.json.{JsNull, JsString}

import scala.concurrent.{ExecutionContext, Future}

trait Syndication extends Edit with MessageSubjects {

  def syndicationStore: SyndicationStore

  private val syndicationRightsFieldName = "syndicationRights"

  private[lib] def publishChangedSyndicationRightsMessages[T](id: String, unchangedPhotoshoot: Boolean = false, photoshoot: Option[Photoshoot] = None)(f: () => Future[T])
                              (implicit ec: ExecutionContext): Future[(T, Map[String, Option[SyndicationRights]])] =
    for {
      oldPhotoshootMaybe <- getPhotoshootForImage(id)
      newPhotoshootMaybe = if (unchangedPhotoshoot) None else photoshoot  // if None, the get rights calls (below) will return none.
      allImageRightsInOldPhotoshootBefore <- getAllImageRightsInPhotoshoot(oldPhotoshootMaybe)
      allImageRightsInNewPhotoshootBefore <- getAllImageRightsInPhotoshoot(newPhotoshootMaybe)
      result <- f()
      allImageRightsInOldPhotoshootAfter <- getAllImageRightsInPhotoshoot(oldPhotoshootMaybe)
      allImageRightsInNewPhotoshootAfter <- getAllImageRightsInPhotoshoot(newPhotoshootMaybe)
      oldChangedRights = getChangedRights(allImageRightsInOldPhotoshootBefore, allImageRightsInOldPhotoshootAfter)
      newChangedRights = getChangedRights(allImageRightsInNewPhotoshootBefore, allImageRightsInNewPhotoshootAfter)
      _ <- publish(oldChangedRights ++ newChangedRights, UpdateImageSyndicationMetadata)
    } yield (result, oldChangedRights ++ newChangedRights)

  def deletePhotoshootAndPublish(id: String)
                                (implicit ec: ExecutionContext): Future[Unit] =
    publishChangedSyndicationRightsMessages[Unit](id, unchangedPhotoshoot = false) { () =>
      for {
        edits <- editsStore.removeKey(id, Edits.Photoshoot)
        _ = publish(id, UpdateImagePhotoshootMetadata)(edits)
      } yield Unit
    }.map(_._1)

  def setPhotoshootAndPublish(id: String, newPhotoshoot: Photoshoot)
                             (implicit ec: ExecutionContext): Future[Photoshoot] = {
    publishChangedSyndicationRightsMessages[Photoshoot](id, photoshoot = Some(newPhotoshoot)) { () =>
      for {
        editsAsJsonResponse <- editsStore.jsonAdd(id, Edits.Photoshoot, DynamoDB.caseClassToMap(newPhotoshoot))
        _ <- editsStore.stringSet(id, Edits.PhotoshootTitle, JsString(newPhotoshoot.title)) // store - don't care about return
        _ = publish(id, UpdateImagePhotoshootMetadata)(editsAsJsonResponse)
      } yield newPhotoshoot
    }
  }.map(_._1)

  def deleteSyndicationAndPublish(id: String)
                                 (implicit ec: ExecutionContext): Future[Unit] = {
    publishChangedSyndicationRightsMessages[Unit](id, unchangedPhotoshoot = true) { () =>
      syndicationStore.deleteItem(id)
    }
  }.map(_._1)

  def setSyndicationAndPublish(id: String, syndicationRight: SyndicationRights)
                              (implicit ec: ExecutionContext): Future[SyndicationRights] =
    publishChangedSyndicationRightsMessages[SyndicationRights](id, unchangedPhotoshoot = true) {() =>
      syndicationStore.jsonAdd (id, syndicationRightsFieldName, DynamoDB.caseClassToMap (syndicationRight)).map(_=>syndicationRight)
    }.map(_._1)

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

  def getRightsByPhotoshoot(id: String)
                           (implicit ec: ExecutionContext): Future[Option[SyndicationRights]] =
    getPhotoshootForImage(id)
      // It's ok for the image to _not_ exist in the edits store - it may have no photoshoot (or any other edit)
      .recover { case NoItemFound => None }
      .flatMap { photoshootMaybe: Option[Photoshoot] =>
        photoshootMaybe match {
          //  If image is not in a photoshoot, return no rights
          case None => Future.successful(None)
          //  If image is in a photo shoot, find the most recently published image and return those rights, with isInferred true
          case Some(photoshoot) => getMostRecentInferredSyndicationRights(photoshoot)
        }
      }

  private def getMostRecentInferredSyndicationRights(ids: List[String])
                                                    (implicit ec: ExecutionContext): Future[Option[SyndicationRights]] =
    getRightsForImages(ids, None)
      .map(list => getMostRecentSyndicationRights(list.values.toList))
      .map(rightsMaybe => rightsMaybe.map(rights => rights.copy(isInferred = true)))

  private def getMostRecentInferredSyndicationRights(photoshoot: Photoshoot)
                                                    (implicit ec: ExecutionContext): Future[Option[SyndicationRights]] =
    getImagesInPhotoshoot(photoshoot) flatMap {
      ids => getMostRecentInferredSyndicationRights(ids)
    }

  private def getRightsForImages(ids: List[String], inferredRights: Option[SyndicationRights])
                                (implicit ec: ExecutionContext): Future[Map[String, Option[SyndicationRights]]] = {
    Future.traverse(ids)(id => {
      syndicationStore.jsonGet(id, syndicationRightsFieldName)
        // Any/all of the images in this photoshoot may have no rights, so recover
        .recover { case NoItemFound => JsNull }
        .map(dynamoEntry => {
          (dynamoEntry \ syndicationRightsFieldName).toOption map (x => x.as[SyndicationRights].copy(isInferred = false))
        })
        .map(rightMaybe => id -> rightMaybe.orElse(inferredRights))
    }).map(list => list.toMap)
  }

  def getMostRecentSyndicationRights(list: List[Option[SyndicationRights]]): Option[SyndicationRights] = list
    .collect {case Some(sr) => sr}.filter(_.published.nonEmpty).sortBy(_.published.map(-_.getMillis)).headOption

  def getAllImageRightsInPhotoshoot(photoshootMaybe: Option[Photoshoot])
                                   (implicit ec: ExecutionContext): Future[Map[String, Option[SyndicationRights]]] =
    photoshootMaybe.map(photoshoot => getAllImageRightsInPhotoshoot(photoshoot))
      .getOrElse(Future.successful(Map.empty[String, Option[SyndicationRights]]))

  def getAllImageRightsInPhotoshoot(photoshoot: Photoshoot)
                                   (implicit ec: ExecutionContext): Future[Map[String, Option[SyndicationRights]]] = for {
    imageIds <- getImagesInPhotoshoot(photoshoot)
    mostRecentInferredRightsMaybe <- getMostRecentInferredSyndicationRights(imageIds)
    rights <- getRightsForImages(imageIds, mostRecentInferredRightsMaybe)
  } yield rights

  def getImagesInPhotoshoot(photoshoot: Photoshoot)
                           (implicit ec: ExecutionContext): Future[List[String]] =
      editsStore.scanForId(config.editsTablePhotoshootIndex, Edits.PhotoshootTitle, photoshoot.title)
        .recover { case NoItemFound => Nil }

  def getChangedRights(before: Map[String, Option[SyndicationRights]], after: Map[String, Option[SyndicationRights]]): Map[String, Option[SyndicationRights]] = {
    // Rights in 'after' which do not have an exact equal in 'before'
    // Rights in 'before' which are not present at all in 'after', so have no inferred rights now
    (after.toSet -- before.toSet).toMap ++
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
