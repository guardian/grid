package lib

import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.when
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsObject, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.Random
import scala.collection.immutable.Map

class SyndicationTest extends AnyFunSpec with Matchers with Syndication with MockitoSugar with ScalaFutures {
  private implicit val ec: ExecutionContext = ExecutionContext.parasitic

  private class PublishingFixture(photoshoot: Option[Photoshoot] = None) extends Syndication {
    override val syndicationStore: SyndicationStore = mock[SyndicationStore]
    override val config: EditsConfig = mock[EditsConfig]
    override val editsStore: EditsStore = mock[EditsStore]
    override val notifications: Notifications = mock[Notifications]

    val write: Promise[JsObject] = Promise[JsObject]()
    val deletion: Promise[Unit] = Promise[Unit]()
    val publication: Promise[Unit] = Promise[Unit]()
    var published: List[Map[String, Option[SyndicationRights]]] = Nil

    when(syndicationStore.jsonAdd(any[String], any[String], any[Map[String, JsValue]])(any[ExecutionContext]))
      .thenReturn(write.future)
    when(syndicationStore.deleteItem(any[String])(any[ExecutionContext])).thenReturn(deletion.future)

    override def getPhotoshootForImage(id: String)(implicit ec: ExecutionContext): Future[Option[Photoshoot]] =
      Future.successful(photoshoot)

    override def getAllImageRightsInPhotoshoot(photoshootMaybe: Option[Photoshoot])
                                              (implicit ec: ExecutionContext): Future[Map[String, SyndicationRights]] =
      Future.successful(Map.empty)

    override def publish(images: Map[String, Option[SyndicationRights]], subject: String)
                        (implicit ec: ExecutionContext): Future[Unit] =
      if (images.isEmpty) Future.successful(())
      else {
        published = published :+ images
        publication.future
      }
  }

  describe("syndication persistence and publication") {
    val id = "image-id"
    val rights = SyndicationRights(None, Nil, Nil)

    for (photoshoot <- List(None, Some(Photoshoot("test photoshoot")))) {
      val context = if (photoshoot.isDefined) "with a photoshoot" else "without a photoshoot"

      it(s"waits for persistence before publishing and completing a save $context") {
        val f = new PublishingFixture(photoshoot)
        val result = f.setSyndicationAndPublish(id, rights)

        f.published shouldBe empty
        result.isCompleted shouldBe false
        f.write.success(Json.obj())
        f.published shouldBe List(Map(id -> Some(rights)))
        result.isCompleted shouldBe false
        f.publication.success(())
        result.futureValue shouldBe rights
      }

      it(s"waits for persistence before publishing and completing a deletion $context") {
        val f = new PublishingFixture(photoshoot)
        val result = f.deleteSyndicationAndPublish(id)

        f.published shouldBe empty
        result.isCompleted shouldBe false
        f.deletion.success(())
        f.published shouldBe List(Map(id -> None))
        result.isCompleted shouldBe false
        f.publication.success(())
        result.futureValue
      }
    }

    it("propagates save failures without publishing") {
      val f = new PublishingFixture
      val failure = new RuntimeException("save failed")
      val result = f.setSyndicationAndPublish(id, rights)

      f.write.failure(failure)

      result.failed.futureValue shouldBe failure
      f.published shouldBe empty
    }

    it("propagates deletion failures without publishing") {
      val f = new PublishingFixture
      val failure = new RuntimeException("delete failed")
      val result = f.deleteSyndicationAndPublish(id)

      f.deletion.failure(failure)

      result.failed.futureValue shouldBe failure
      f.published shouldBe empty
    }

    it("propagates publication failures after saving") {
      val f = new PublishingFixture
      val failure = new RuntimeException("publish failed")
      val result = f.setSyndicationAndPublish(id, rights)
      f.write.success(Json.obj())

      f.publication.failure(failure)

      result.failed.futureValue shouldBe failure
    }

    it("propagates publication failures after deletion") {
      val f = new PublishingFixture
      val failure = new RuntimeException("publish failed")
      val result = f.deleteSyndicationAndPublish(id)
      f.deletion.success(())

      f.publication.failure(failure)

      result.failed.futureValue shouldBe failure
    }
  }

  describe("Syndication Rights date functions") {

    it ("should find the latest syndication rights when there are none") {
      val rights = List()
      getMostRecentInferrableSyndicationRights(rights) should be (None)
    }

    it ("should find the latest syndication rights when there is only one") {
      val right = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val rights = List(right)
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right.copy(isInferred = true)))
    }

    it ("should find the latest syndication rights when there is more than one") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(None, Nil, Nil)
      val rights = List(right1, right2)
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right1.copy(isInferred = true)))
    }

    it ("should find the latest syndication rights when there is more than one (swapped over)") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(None, Nil, Nil)
      val rights = List(right2, right1)
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right1.copy(isInferred = true)))
    }

    it ("should find the latest syndication rights when there is more than one with a date") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(Some(DateTime.now().minus(100L)), Nil, Nil)
      val rights = List(right1, right2)
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right1.copy(isInferred = true)))
    }

    it ("should find the latest syndication rights when there is more than one with a date (swapped over)") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(Some(DateTime.now().minus(100L)), Nil, Nil)
      val rights = List(right2, right1)
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right1.copy(isInferred = true)))
    }

    it ("should find the latest syndication rights when there are several with a date (swapped over) and a few Nones mixed in too") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val rights = List(
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil),
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil),
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil),
        right1,
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil),
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil),
        SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)
      )
      getMostRecentInferrableSyndicationRights(rights) should be (Some(right1.copy(isInferred = true)))
    }
  }

  describe("Syndication Rights changes functions") {
    it ("Should find the added/removed rights") {
      val before = List("1" -> SyndicationRights(None, Nil, Nil)).toMap
      val after = List("2" -> SyndicationRights(None, Nil, Nil)).toMap
      val difference = Map("1" -> None, "2" -> Some(SyndicationRights(None, Nil, Nil)))
      getChangedRights(before, after) should be (difference)
    }
    it ("Should find the (subtly) changed rights") {
      val before = List(
        "1" -> SyndicationRights(None, Nil, Nil, isInferred = true),
        "2" -> SyndicationRights(None, Nil, Nil)
      ).toMap
      val after = List(
        "1" -> SyndicationRights(None, Nil, Nil),
        "2" -> SyndicationRights(None, Nil, Nil, isInferred = true)
      ).toMap
      val difference = Map("1" -> Some(SyndicationRights(None, Nil, Nil)), "2" -> Some(SyndicationRights(None, Nil, Nil, isInferred = true)))
      getChangedRights(before, after) should be (difference)
    }
  }

  override val syndicationStore:SyndicationStore = mock[SyndicationStore]
  override def config: EditsConfig = mock[EditsConfig]
  override def editsStore: EditsStore = mock[EditsStore]
  override def notifications: Notifications = mock[Notifications]
}
