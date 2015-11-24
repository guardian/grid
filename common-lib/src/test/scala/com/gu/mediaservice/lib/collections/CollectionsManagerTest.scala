package com.gu.mediaservice.model

import com.gu.mediaservice.lib.collections.CollectionsManager
import org.scalatest.{FunSpec, Matchers}

class CollectionsManagerTest extends FunSpec with Matchers {

  describe("CollectionManager") {

    it ("should convert path to string with /") {
      CollectionsManager.pathToString(List("g2", "art", "film")) should be ("g2/art/film")
    }

    it ("should URL encode / in path bit in a string") {
      CollectionsManager.pathToString(List("g2", "art", "24/7")) should be ("g2/art/24%2F7")
    }

    it ("should convert a string to a path") {
      CollectionsManager.stringToPath("g2/art/film") should be (List("g2", "art", "film"))
    }

    it ("should convert a URL encoded string to a valid path") {
      CollectionsManager.stringToPath("g2/art/24%2F7") should be (List("g2", "art", "24/7"))
    }

  }
}
