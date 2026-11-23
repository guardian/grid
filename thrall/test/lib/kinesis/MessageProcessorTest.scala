package lib.kinesis

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.{DeleteImageMessage, NoRights, SyndicationRights, UpdateImageSyndicationMetadataMessage}
import helpers.Fixtures
import lib.{MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearch, ElasticSearchDeleteResponse, ElasticSearchUpdateResponse, ImageNotDeletable}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, verify, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.concurrent.{ExecutionContext, Future, Promise}

class MessageProcessorTest extends AnyFunSpec with Matchers with ScalaFutures with MockitoSugar with Fixtures {
  private implicit val ec: ExecutionContext = ExecutionContext.parasitic
  private val marker: LogMarker = MarkerMap()
  private val image = createImage("image-id", NoRights)

  private class Fixture {
    val es: ElasticSearch = mock[ElasticSearch]
    val store: ThrallStore = mock[ThrallStore]
    val processor = new MessageProcessor(es, store, mock[MetadataEditorNotifications])
  }

  describe("syndication updates") {
    it("waits for the Elasticsearch update to complete") {
      val f = new Fixture
      val update = Promise[ElasticSearchUpdateResponse]()
      when(f.es.getImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(Some(image)))
      when(f.es.updateImageSyndicationRights(any[String], any[Option[SyndicationRights]], any[DateTime])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(update.future)

      val result = f.processor.process(UpdateImageSyndicationMetadataMessage(image.id, DateTime.now, None), marker)

      result.isCompleted shouldBe false
      update.success(ElasticSearchUpdateResponse())
      result.futureValue
    }

    it("succeeds without writing when the image is missing") {
      val f = new Fixture
      when(f.es.getImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(None))

      f.processor.process(UpdateImageSyndicationMetadataMessage(image.id, DateTime.now, None), marker).futureValue

      verify(f.es, never()).updateImageSyndicationRights(any[String], any[Option[SyndicationRights]], any[DateTime])(any[ExecutionContext], any[LogMarker])
    }
  }

  describe("image deletion") {
    it("deletes S3 objects only after checking deletability, and deletes from Elasticsearch only after S3 succeeds") {
      val f = new Fixture
      val deletable = Promise[Unit]()
      val original = Promise[Unit]()
      val thumbnail = Promise[Unit]()
      val png = Promise[Unit]()
      val esDelete = Promise[ElasticSearchDeleteResponse]()
      when(f.es.ensureImageDeletable(any[String])(any[ExecutionContext], any[LogMarker])).thenReturn(deletable.future)
      when(f.store.deleteOriginal(any[String])(any[LogMarker])).thenReturn(original.future)
      when(f.store.deleteThumbnail(any[String])(any[LogMarker])).thenReturn(thumbnail.future)
      when(f.store.deletePNG(any[String])(any[LogMarker])).thenReturn(png.future)
      when(f.es.forceDeleteImage(any[String])(any[ExecutionContext], any[LogMarker])).thenReturn(esDelete.future)

      val result = f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker)

      verify(f.store, never()).deleteOriginal(any[String])(any[LogMarker])
      deletable.success(())
      original.success(())
      thumbnail.success(())
      verify(f.es, never()).forceDeleteImage(any[String])(any[ExecutionContext], any[LogMarker])
      png.success(())
      result.isCompleted shouldBe false
      esDelete.success(ElasticSearchDeleteResponse())
      result.futureValue
    }

    it("keeps the Elasticsearch document intact for retry if an S3 deletion fails") {
      val f = new Fixture
      val failure = new RuntimeException("s3 delete failed")
      when(f.es.ensureImageDeletable(any[String])(any[ExecutionContext], any[LogMarker])).thenReturn(Future.successful(()))
      when(f.store.deleteOriginal(any[String])(any[LogMarker])).thenReturn(Future.failed(failure))
      when(f.store.deleteThumbnail(any[String])(any[LogMarker])).thenReturn(Future.successful(()))
      when(f.store.deletePNG(any[String])(any[LogMarker])).thenReturn(Future.successful(()))

      f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker).failed.futureValue shouldBe failure
      verify(f.es, never()).forceDeleteImage(any[String])(any[ExecutionContext], any[LogMarker])
    }

    it("succeeds without deleting S3 objects or Elasticsearch documents when the image is protected") {
      val f = new Fixture
      when(f.es.ensureImageDeletable(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.failed(ImageNotDeletable))

      f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker).futureValue

      verify(f.store, never()).deleteOriginal(any[String])(any[LogMarker])
      verify(f.store, never()).deleteThumbnail(any[String])(any[LogMarker])
      verify(f.store, never()).deletePNG(any[String])(any[LogMarker])
      verify(f.es, never()).forceDeleteImage(any[String])(any[ExecutionContext], any[LogMarker])
    }
  }
}
