package com.gu.mediaservice.lib.collections

import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}

import com.gu.mediaservice.model.{ActionData, Collection}

class CollectionsManagerTest extends FunSpec with Matchers {

  describe("CollectionManager") {

    describe("serialisation") {
      it ("should convert path to string with /") {
        CollectionsManager.pathToString(List("g2", "art", "film")) shouldBe "g2/art/film"
      }

      it ("should convert a string to a path") {
        CollectionsManager.stringToPath("g2/art/film") shouldBe List("g2", "art", "film")
      }

      it ("should convert a URI to a path") {
        CollectionsManager.uriToPath("g2/art/rhythm+blues") shouldBe List("g2", "art", "rhythm blues")
      }

      it ("should convert a path to a URI") {
        CollectionsManager.pathToUri(List("g2", "art", "rhythm&blues")) shouldBe "g2/art/rhythm%26blues"
      }
    }

    describe("validation") {

      it ("should allow strings") {
        CollectionsManager.isValidPathBit("{something&nothing}") shouldBe true
      }

      it ("should not allow /") {
        CollectionsManager.isValidPathBit("this/that") shouldBe false
      }

    }

    it ("should only show the latest collection with same ID") {
      val date = DateTime.now()
      val laterDate = date.minusDays(5)
      val evenLaterDate = laterDate.minusDays(5)

      val collection1 = Collection(List("g2"), ActionData("me@you.com", date))
      val collection2 = Collection(List("g2"), ActionData("you@me.com", laterDate))
      val collection3 = Collection(List("g2"), ActionData("them@they.com", evenLaterDate))

      val duped = List(collection2, collection1, collection3)

      val deduped = CollectionsManager.onlyLatest(duped)

      deduped.length shouldBe 1
      deduped.head shouldBe collection1

    }

    it ("should find the index of a collection in a list") {
      val actionData = ActionData("me@you.com", DateTime.now())
      val collections = List(
        Collection(List("g2"), actionData),
        Collection(List("g2", "art"), actionData),
        Collection(List("g2", "art", "paintings"), actionData)
      )

      val index = CollectionsManager.findIndex(List("g2", "art"), collections)
      val noIndex = CollectionsManager.findIndex(List("not", "there"), collections)

      index shouldBe Some(1)
      noIndex shouldBe None
    }

  }
}
