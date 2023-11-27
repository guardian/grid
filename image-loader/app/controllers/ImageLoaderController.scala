package controllers

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.util.IOUtils
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import akka.stream.scaladsl.Source

import java.io.{File, FileOutputStream}
import java.net.{URI, URL}
import com.drew.imaging.ImageProcessingException
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.aws.SqsHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.net.URI.{decode => uriDecode}
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.{FALLBACK, LogMarker, MarkerMap}
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.model.{UnsupportedMimeTypeException, UploadInfo}
import com.gu.scanamo.error.ConditionNotMet
import lib.FailureResponse.Response
import lib.{FailureResponse, _}
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3, UserImageLoaderException}
import lib.storage.ImageLoaderStore
import model.{Projector, QuarantineUploader, S3FileExtractedMetadata, StatusType, UploadStatus, UploadStatusRecord, Uploader, UploadStatusUri}
import play.api.libs.json.Json
import play.api.mvc._
import model.upload.UploadRequest

import java.time.Instant
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.ImageIngestOperations.fileKeyFromId
import com.gu.mediaservice.lib.auth.Authentication.OnBehalfOfPrincipal
import com.gu.mediaservice.lib.aws.{S3Ops, SimpleSqsMessageConsumer}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import play.api.data.Form
import play.api.data.Forms._

import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success, Try}
import scala.util.control.NonFatal
import akka.stream.scaladsl.Sink
import akka.stream.Materializer
import com.gu.scanamo.error.ScanamoError
import com.gu.mediaservice.lib.ImageStorageProps
import scala.collection.JavaConverters._
import org.joda.time.DateTime

class ImageLoaderController(auth: Authentication,
                            downloader: Downloader,
                            store: ImageLoaderStore,
                            maybeIngestQueue: Option[SimpleSqsMessageConsumer],
                            uploadStatusTable: UploadStatusTable,
                            notifications: Notifications,
                            config: ImageLoaderConfig,
                            uploader: Uploader,
                            quarantineUploader: Option[QuarantineUploader],
                            projector: Projector,
                            override val controllerComponents: ControllerComponents,
                            gridClient: GridClient,
                            authorisation: Authorisation)
                           (implicit val ec: ExecutionContext, materializer: Materializer)
  extends BaseController with ArgoHelpers with SqsHelpers {

  private val AuthenticatedAndAuthorised = auth andThen authorisation.CommonActionFilters.authorisedForUpload

  maybeIngestQueue.foreach{ingestQueue =>
    Source.repeat(())
      .mapAsync(parallelism=1)(_ =>
        ingestQueue.getNextMessage() match {
          case None => Future.successful(println(s"No message at ${DateTimeUtils.now()}"))
          case Some(message) => handleMessageFromIngestBucket(message).map(_ => ingestQueue.deleteMessage(message))
        }
      )
      .run()
  }


  private lazy val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("prepare", s"${config.rootUri}/prepare"),
      Link("load", s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index: Action[AnyContent] = AuthenticatedAndAuthorised { indexResponse }

  def quarantineOrStoreImage(uploadRequest: UploadRequest)(implicit logMarker: LogMarker) = {
    quarantineUploader.map(_.quarantineFile(uploadRequest)).getOrElse(for { uploadStatusUri <- uploader.storeFile(uploadRequest)} yield{uploadStatusUri.toJsObject})
  }

  def handleMessageFromIngestBucket(message:SQSMessage): Future[Unit] = {
    println(message)

    val approximateReceiveCount = getApproximateReceiveCount(message)

    if (approximateReceiveCount > 2) { // retry ingesting once before send to fail bucket - this is to allow for uncaught exception, EG box ran out fo memory and crashed while ingesting, or instances cycled before ingest was finished.
      println(s"File processing has been attempted $approximateReceiveCount times. Moving to fail bucket.")
      transferIngestedFileToFailBucket(message)
    } else {

      attemptToProcessIngestedFile(message).transformWith {
        case Failure(exception) => {
          println(s"Failed to process file: ${exception.toString()}. Moving to fail bucket")
          transferIngestedFileToFailBucket(message)
        }
        case Success(outcome) => {
          outcome match {
            case Left(exception) => {
              println(s"Failed to process file: ${exception.toString()}. Moving to fail bucket")
              transferIngestedFileToFailBucket(message)
            }
            case Right(digestedFile) => {
             println(s"Succesfully processed image ${digestedFile.file.getName()}")
             Future.unit
            }
          }
        }
      }
    }
  }

  def transferIngestedFileToFailBucket(message: SQSMessage):Future[Unit] = Future{
    parseS3DataFromMessage(message) match {
      case Left(failString) => {
        // TO DO - delete message from Queue if cannont parse. Should only happen if we get malformed message payloads - not expected.
        logger.warn("Failed to parse s3 data from SQS message", message)
        println("transferIngestedFileToFailBucket - could not parse")
      }
      case Right(s3data) => {
        println(s"Attempting to transfer file saved from ingest bucket to fail bucket. KEY: ${s3data.`object`.key}, SIZE: ${s3data.`object`.size}")
        // TO DO - implement
        println("transferIngestedFileToFailBucket - not implemented")
      }
    }
  }

  def attemptToProcessIngestedFile(message:SQSMessage): Future[Either[Exception, DigestedFile]] = {
     parseS3DataFromMessage(message) match {
      case Left(failString) => {
        // TO DO - delete message from Queue if cannot parse. Should only happen if we get malformed message payloads - not expected.
        logger.warn("Failed to parse s3 data from SQS message", message)
        Future( Left(new Exception(s"Failed to parse s3 data from message ${message.getMessageId()}: $failString")))
      }
      case Right(s3data) => {
        val key = s3data.`object`.key
        val loggingContext = MarkerMap() //TODO pass implicit LogMarker around

        println(s"Attempting to process file saved to ingest bucket. KEY: $key, SIZE: ${s3data.`object`.size}")
        val tempFile = createTempFile("s3IngestBucketFile")(loggingContext)
        val s3IngestObject = store.getIngestObject(key)
        val metadata = s3IngestObject.getObjectMetadata
        val digestedFile = downloader.download(
          inputStream = s3IngestObject.getObjectContent,
          tempFile,
          expectedSize = metadata.getContentLength
        )
        println(s"SHA-1: ${digestedFile.digest}")

        val futuredFile = Future(digestedFile)

        val futureUploadStatusUri = uploadDigestedFileToStore(
            digestedFileFuture = futuredFile,
            uploadedBy = uriDecode(key.split("/").head), // first segment of the key is the uploader id
            identifiers =  None,
            uploadTime = Some(metadata.getLastModified().toString()) , // upload time as iso string - uploader uses DateTimeUtils.fromValueOrNow
            filename = metadata.getUserMetadata().asScala.get(ImageStorageProps.filenameMetadataKey), // set on the upload metadata by the client when uploading to ingest bucket
        )(loggingContext)

        // under all circumstances, remove the temp files
        futureUploadStatusUri.onComplete { _ =>
          Try { deleteTempFile(tempFile)(loggingContext) }
        }

        handleUploadCompletionAndUpdateUploadStatusTable(futureUploadStatusUri, digestedFile)(loggingContext)
          .recover {
            case e:Exception => Left(e)
            case _ => Left(new Exception)
          }
          .map {
            case _ => Right(digestedFile)
          }

      }
    }
  }

  def getPreSignedUploadUrlsAndTrack: Action[AnyContent] = AuthenticatedAndAuthorised { request =>
    val expiration = DateTimeUtils.now().plusHours(1)

    val mediaIds: List[String] = request.body.asJson.get.as[List[String]]

    val uploadedBy = Authentication.getIdentity(request.user) //FIXME URL decode the username from the folder when read from ingest bucket

    Ok(Json.toJson(
      mediaIds.map(mediaId => {

        val preSignedUrl = store.generatePreSignedUploadUrl(filename = mediaId, expiration, uploadedBy)

        // TODO track in upload status table with 'prepared' status and one hour TTL

        mediaId -> preSignedUrl
      }).toMap
    ))
  }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]): Action[DigestedFile] =  {
    val uploadTimeToRecord = DateTimeUtils.fromValueOrNow(uploadTime)

    val initialContext = MarkerMap(
        "requestType" -> "load-image",
        "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
        "identifiers" -> identifiers.getOrElse(FALLBACK),
        "uploadTime" -> uploadTimeToRecord.toString,
        "filename" -> filename.getOrElse(FALLBACK)
    )
    logger.info(initialContext, "loadImage request start")

    // synchronous write to file
    val tempFile = createTempFile("requestBody")(initialContext)
    logger.info(initialContext, "body parsed")
    val parsedBody = DigestBodyParser.create(tempFile)

    AuthenticatedAndAuthorised.async(parsedBody) { req =>
      val uploadedByToRecord = uploadedBy.getOrElse(Authentication.getIdentity(req.user))

      implicit val context: LogMarker =
        initialContext ++ Map(
          "uploadedBy" -> uploadedByToRecord,
          "requestId" -> RequestLoggingFilter.getRequestId(req)
        )

      val uploadStatus = if(config.uploadToQuarantineEnabled) StatusType.Pending else StatusType.Completed
      val uploadExpiry = Instant.now.getEpochSecond + config.uploadStatusExpiry.toSeconds
      val record = UploadStatusRecord(req.body.digest, filename, uploadedByToRecord, printDateTime(uploadTimeToRecord), identifiers, uploadStatus, None, uploadExpiry)
      val result = for {
        uploadRequest <- uploader.loadFile(
          req.body,
          uploadedByToRecord,
          identifiers,
          uploadTimeToRecord,
          filename.flatMap(_.trim.nonEmptyOpt)
        )
        _ <- uploadStatusTable.setStatus(record)
        result <- quarantineOrStoreImage(uploadRequest)
      } yield result
      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result map { r =>
        val result = Accepted(r).as(ArgoMediaType)
        logger.info(context, "loadImage request end")
        result
      } recover {
        case NonFatal(e) =>
          logger.error(context, "loadImage request ended with a failure", e)
          val response = e match {
            case e: UnsupportedMimeTypeException => FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes)
            case e: ImageProcessingException => FailureResponse.notAnImage(e, config.supportedMimeTypes)
            case e: java.io.IOException => FailureResponse.badImage(e)
            case other => FailureResponse.internalError(other)
          }
          FailureResponse.responseToResult(response)
      }
    }
  }

  // Fetch
  def projectImageBy(imageId: String): Action[AnyContent] = {
    val initialContext = MarkerMap(
      "imageId" -> imageId,
      "requestType" -> "image-projection"
    )
    val tempFile = createTempFile(s"projection-$imageId")(initialContext)
    auth.async { req =>
      implicit val context: LogMarker = initialContext ++ Map(
        "requestId" -> RequestLoggingFilter.getRequestId(req)
      )
      val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(req.user)
      val result = projector.projectS3ImageById(imageId, tempFile, gridClient, onBehalfOfFn)

      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result.map {
        case Some(img) =>
          logger.info(context, "image found")
          Ok(Json.toJson(img)).as(ArgoMediaType)
        case None =>
          val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId)
          logger.info(context, "image not found")
          respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
      } recover {
        case _: NoSuchImageExistsInS3 => NotFound(Json.obj("imageId" -> imageId))
        case e =>
          logger.error(context, s"projectImageBy request for id $imageId ended with a failure", e)
          InternalServerError(Json.obj("imageId" -> imageId, "exception" -> e.getMessage))
      }
    }
  }

  def importImage(
                   uri: String,
                   uploadedBy: Option[String],
                   identifiers: Option[String],
                   uploadTime: Option[String],
                   filename: Option[String]
                 ): Action[AnyContent] = {
    AuthenticatedAndAuthorised.async { request =>
      implicit val context = MarkerMap(
        "requestType" -> "import-image",
        "key-tier" -> request.user.accessor.tier.toString,
        "key-name" -> request.user.accessor.identity,
        "requestId" -> RequestLoggingFilter.getRequestId(request)
      )

      logger.info(context, "importImage request start")

      val tempFile = createTempFile("download")
      val digestedFileFuture = for {
        validUri <- Future { URI.create(uri) }
        digestedFile <- downloader.download(validUri, tempFile)
      } yield digestedFile

      val importResult: Future[Result] = for {
        uploadStatusUri <- uploadDigestedFileToStore(
          digestedFileFuture,
          uploadedBy.getOrElse(Authentication.getIdentity(request.user)),
          identifiers,
          uploadTime,
          filename
        )
      } yield {
        // NB This return code (202) is explicitly required by s3-watcher
        // Anything else (eg 200) will be logged as an error. DAMHIKIJKOK.
        Accepted(uploadStatusUri.toJsObject).as(ArgoMediaType)
      }

      // under all circumstances, remove the temp files
      importResult.onComplete { _ =>
        Try { deleteTempFile(tempFile) }
      }

      getImportResultOutcomeAndUpdateUploadStatusTable(importResult,digestedFileFuture).transform {
        // create a play result out of what has happened
        case Success(Right(result)) => Success(result)
        case Success(Left(failure)) => Success(FailureResponse.responseToResult(failure))
        case Failure(NonFatal(e)) => Success(FailureResponse.responseToResult(FailureResponse.internalError(e)))
        case Failure(other) => Failure(other)
      }
    }
  }

  private def uploadDigestedFileToStore (
    digestedFileFuture: Future[DigestedFile],
    uploadedBy: String,
    identifiers: Option[String],
    uploadTime: Option[String],
    filename: Option[String]
  )(implicit context:MarkerMap): Future[UploadStatusUri] = {

    for {
        digestedFile <- digestedFileFuture
        uploadStatusResult <- uploadStatusTable.getStatus(digestedFile.digest)
        maybeStatus = uploadStatusResult.flatMap(_.toOption)
        uploadRequest <- uploader.loadFile(
          digestedFile,
          uploadedBy =  maybeStatus.map(_.uploadedBy).getOrElse(uploadedBy),
          identifiers =  maybeStatus.flatMap(_.identifiers).orElse(identifiers),
          uploadTime =  DateTimeUtils.fromValueOrNow(maybeStatus.map(_.uploadTime).orElse(uploadTime)),
          filename =  maybeStatus.flatMap(_.fileName).orElse(filename).flatMap(_.trim.nonEmptyOpt),
        )
        result <- uploader.storeFile(uploadRequest)
      } yield {
        logger.info(context, "importImage request end")
        result
      }
  }

  private def getImportResultOutcomeAndUpdateUploadStatusTable (
    importResult: Future[Result],
    digestedFileFuture: Future[DigestedFile],
  )(implicit context:MarkerMap):Future[Either[Response,Result]] = {
      /* combine the import result and digest file together into a single future
       * note that we use transformWith instead of zip here as we are still interested in value of
       * digestedFile even if the import fails */
      val fileAndMaybeResult: Future[(DigestedFile, Try[Result])] = importResult.transformWith{ result =>
        digestedFileFuture.map(file => file -> result)
      }

      fileAndMaybeResult.flatMap { case (digestedFile, importResult) =>
        // convert exceptions to failure responses
        val res = importResult match {
          case Failure(e: UnsupportedMimeTypeException) => Left(FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes))
          case Failure(_: IllegalArgumentException) => Left(FailureResponse.invalidUri)
          case Failure(e: UserImageLoaderException) => Left(FailureResponse.badUserInput(e))
          case Failure(NonFatal(_)) => Left(FailureResponse.failedUriDownload)
          case Success(result) => Right(result)
        }
        // update the upload status with the error or completion
        val status = res match {
          case Left(Response(_, response)) => UploadStatus(StatusType.Failed, Some(s"${response.errorKey}: ${response.errorMessage}"))
          case Right(_) => UploadStatus(StatusType.Completed, None)
        }
        uploadStatusTable.updateStatus(digestedFile.digest, status).flatMap{status =>
          status match {
            case Left(_: ConditionNotMet) => logger.info(context, s"no image upload status to update for image ${digestedFile.digest}")
            case Left(error) => logger.error(context, s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:${error}")
            case Right(_) => logger.info(context, s"image upload status updated successfully, image-id: ${digestedFile.digest}")
          }
          Future.successful(res)
        }
      }
  }



  private def handleUploadCompletionAndUpdateUploadStatusTable (
    uploadAttempt: Future[UploadStatusUri],
    digestedFile: DigestedFile,
  )(implicit context:MarkerMap): Future[Unit] = {

    def reportFailure (error:Throwable) {
      val errorMessage = s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:${error}"
      logger.error(context, errorMessage)
      Future.failed(new Exception(errorMessage))
    }
    def reportScanamoError (error:ScanamoError) {
      var errorMessage = s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:${error}"
      if (error.isInstanceOf[ConditionNotMet]) {
        errorMessage = s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:${error}"
      }
      logger.error(context, errorMessage)
      Future.failed(new Exception(errorMessage))
    }

    uploadAttempt
      .recover {
        case uploadFailure => {
          uploadStatusTable.updateStatus(
            digestedFile.digest,
            UploadStatus(StatusType.Failed, Some(s"${uploadFailure.getClass().getName()}: ${uploadFailure.getMessage()}"))
          )
            .recover {
              case error => reportFailure(error)
            }
            .map {
              case Left(error:ScanamoError) => reportScanamoError(error)
              case Right => uploadFailure
            }
        }
      }
      .map {
        case uploadStatusUri:UploadStatusUri => {
          uploadStatusTable.updateStatus(
            digestedFile.digest,
            UploadStatus(StatusType.Completed, None)
          )
            .recover {
              case error => reportFailure(error)
            }
            .map {
              case Left(error:ScanamoError) => reportScanamoError(error)
              case Right => uploadStatusUri
            }
        }
      }
  }

  lazy val replicaS3: AmazonS3 = S3Ops.buildS3Client(config, maybeRegionOverride = Some("us-west-1"))

  private case class RestoreFromReplicaForm(imageId: String)
  def restoreFromReplica: Action[AnyContent] = AuthenticatedAndAuthorised.async { implicit request =>

    val imageId = Form(
      mapping(
        "imageId" -> text
      )(RestoreFromReplicaForm.apply)(RestoreFromReplicaForm.unapply)
    ).bindFromRequest.get.imageId

    implicit val logMarker: LogMarker = MarkerMap(
      "imageId" -> imageId,
      "requestType" -> "restore-from-replica",
      "requestId" -> RequestLoggingFilter.getRequestId(request)
    )

    Future {
      config.maybeImageReplicaBucket match {
        case _ if store.doesOriginalExist(imageId) =>
          Future.successful(Conflict("Image already exists in main bucket"))
        case None =>
          Future.successful(NotImplemented("No replica bucket configured"))
        case Some(replicaBucket) if replicaS3.doesObjectExist(replicaBucket, fileKeyFromId(imageId)) =>
          val s3Key = fileKeyFromId(imageId)

          logger.info(logMarker, s"Restoring image $imageId from replica bucket $replicaBucket (key: $s3Key)")

          val replicaObject = replicaS3.getObject(replicaBucket, s3Key)
          val metadata = S3FileExtractedMetadata(replicaObject.getObjectMetadata)
          val stream = replicaObject.getObjectContent
          val tempFile = createTempFile(s"restoringReplica-$imageId")
          val fos = new FileOutputStream(tempFile)
          try {
            IOUtils.copy(stream, fos)
          } finally {
            stream.close()
          }

          val future = uploader.restoreFile(
            UploadRequest(
              imageId,
              tempFile, // would be nice to stream directly from S3, but followed the existing pattern of temp file
              mimeType = MimeTypeDetection.guessMimeType(tempFile) match {
                case Left(unsupported) => throw unsupported
                case right => right.toOption
              },
              metadata.uploadTime,
              metadata.uploadedBy,
              metadata.identifiers,
              UploadInfo(metadata.uploadFileName)
            ),
            gridClient,
            auth.getOnBehalfOfPrincipal(request.user)
          )

          future.onComplete(_ => Try {
            deleteTempFile(tempFile)
          })

          future.map { _ =>
            logger.info(logMarker, s"Restored image $imageId from replica bucket $replicaBucket (key: $s3Key)")
            Redirect(s"${config.kahunaUri}/images/$imageId")
          }
        case _ =>
          Future.successful(NotFound("Image not found in replica bucket"))
      }
    }.flatten
  }

  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

  // To avoid Future _madness_, it is better to make temp files at the controller and pass them down,
  // then clear them up again at the end.  This avoids leaks.
  def createTempFile(prefix: String)(implicit logMarker: LogMarker): File = {
    val tempFile = File.createTempFile(prefix, "", config.tempDir)
    logger.info(logMarker, s"Created temp file ${tempFile.getName} in ${config.tempDir}")
    tempFile
  }

  def deleteTempFile(tempFile: File)(implicit logMarker: LogMarker): Future[Unit] = Future {
    if (tempFile.delete()) {
      logger.info(logMarker, s"Deleted temp file $tempFile")
    } else {
      logger.warn(logMarker, s"Unable to delete temp file $tempFile in ${config.tempDir}")
    }
  }

}
