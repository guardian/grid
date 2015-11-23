package lib.collections

import org.scalatest.{FunSpec, Matchers}

class CollectionsManagerTest extends FunSpec with Matchers {

  describe("CollectionsManager") {

    it ("should convert path to string with /") {
      CollectionsManager.pathToString(List("g2", "art", "film")) should be ("g2/art/film")
    }

    it ("should convert / in path to // in string") {
      CollectionsManager.pathToString(List("g2", "art", "24/7")) should be ("g2/art/24//7")
    }

    it ("should convert a string to a path") {
      CollectionsManager.stringToPath("g2/art/film") should be (List("g2", "art", "film"))
    }

    it ("should convert a string with // to a path") {
      CollectionsManager.stringToPath("g2/art/24//7") should be (List("g2", "art", "24/7"))
    }

  }
}
