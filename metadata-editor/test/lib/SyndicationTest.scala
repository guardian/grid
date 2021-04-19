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
      getMostRecentSyndicationRights(rights) should be (None)
    }

    it ("should find the latest syndication rights when there is only one") {
      val right = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val rights = List(Some(right))
      getMostRecentSyndicationRights(rights) should be (Some(right))
    }

    it ("should find the latest syndication rights when there is more than one") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(None, Nil, Nil)
      val rights = List(Some(right1), Some(right2))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there is more than one (swapped over)") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(None, Nil, Nil)
      val rights = List(Some(right2), Some(right1))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there is more than one (swapped over) and a None mixed in too") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(None, Nil, Nil)
      val rights = List(Some(right2), None, Some(right1))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there is more than one with a date") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(Some(DateTime.now().minus(100l)), Nil, Nil)
      val rights = List(Some(right1), Some(right2))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there is more than one with a date (swapped over)") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(Some(DateTime.now().minus(100l)), Nil, Nil)
      val rights = List(Some(right2), Some(right1))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there is more than one with a date (swapped over) and a None mixed in too") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val right2 = SyndicationRights(Some(DateTime.now().minus(100l)), Nil, Nil)
      val rights = List(Some(right2), None, Some(right1))
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }

    it ("should find the latest syndication rights when there are several with a date (swapped over) and a few Nones mixed in too") {
      val right1 = SyndicationRights(Some(DateTime.now()), Nil, Nil)
      val rights = List(
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)),
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)),
        None,
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)),
        Some(right1),
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)),
        None,
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil)),
        Some(SyndicationRights(Some(DateTime.now().minus(Math.max(5, Random.nextLong() % 100))), Nil, Nil))
      )
      getMostRecentSyndicationRights(rights) should be (Some(right1))
    }
  }

  describe("Syndication Rights changes functions") {
    it ("Should find the added/removed rights") {
      val before = List("1" -> Some(SyndicationRights(None, Nil, Nil, false))).toMap
      val after = List("2" -> Some(SyndicationRights(None, Nil, Nil, false))).toMap
      val difference = Map("1" -> None, "2" -> Some(SyndicationRights(None, Nil, Nil, false)))
      getChangedRights(before, after) should be (difference)
    }
    it ("Should find the (subtly) changed rights") {
      val before = List(
        "1" -> Some(SyndicationRights(None, Nil, Nil, true)),
        "2" -> Some(SyndicationRights(None, Nil, Nil, false))
      ).toMap
      val after = List(
        "1" -> Some(SyndicationRights(None, Nil, Nil, false)),
        "2" -> Some(SyndicationRights(None, Nil, Nil, true))
      ).toMap
      val difference = Map("1" -> Some(SyndicationRights(None, Nil, Nil, false)), "2" -> Some(SyndicationRights(None, Nil, Nil, true)))
      getChangedRights(before, after) should be (difference)
    }
  }

  override val syndicationStore:SyndicationStore = mock[SyndicationStore]
  override def config: EditsConfig = mock[EditsConfig]
  override def editsStore: EditsStore = mock[EditsStore]
  override def notifications: Notifications = mock[Notifications]
}
