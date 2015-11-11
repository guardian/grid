package model

import org.joda.time.DateTime
import org.scalatest.{Matchers, FunSpec, OptionValues}

class CollectionTest extends FunSpec with Matchers with OptionValues {
  val paradata = Paradata("bang@crash@guardian.co.uk", DateTime.now)
  val identifyBy = (collection: Collection) => collection.path
  val collections = List(
    Collection(List("g2", "features"), paradata),
    Collection(List("g2", "food"), paradata),
    Collection(List("g2", "health"), paradata),
    Collection(List("g2", "lifestyle"), paradata),
    Collection(List("obs"), paradata),
    Collection(List("obs", "lifestyle"), paradata),
    Collection(List("obs", "comment"), paradata),
    Collection(List("obs", "focus"), paradata),
    Collection(List("obs", "foodfeat"), paradata),
    Collection(List("obs", "foodfeat", "shnitzel"), paradata)
  )

  describe("Node") {

    it("should produce 2 children") {
      val tree = Node.buildTree("motherwillow", collections, identifyBy)
      tree.children.length shouldEqual 2
    }

    it("should have g2 as a child") {
      val tree = Node.buildTree("motherwillow", collections, identifyBy)
      tree.children.exists(_.name == "g2") shouldEqual true
    }

    it("should have second level children") {
      val tree = Node.buildTree("motherwillow", collections, identifyBy)
      val g2 = tree.children.find(_.name == "g2").value
      g2.children.map(_.name).toSet shouldEqual Set("features", "food", "health", "lifestyle")
    }

  }
}
