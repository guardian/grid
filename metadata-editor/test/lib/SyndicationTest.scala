package lib

import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{FunSpec, Matchers}

import scala.util.Random
import scala.collection.Map

class SyndicationTest extends FunSpec with Matchers with Syndication with MockitoSugar {

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
