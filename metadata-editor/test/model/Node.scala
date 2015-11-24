package model

import org.scalatest.{FunSpec, Matchers, OptionValues}

class NodeTest extends FunSpec with Matchers with OptionValues {
  val identifyBy = (list: List[String]) => list
  val collections = List(
    List("g2", "features"),
    List("g2", "food"),
    List("g2", "health"),
    List("g2", "lifestyle"),
    List("obs"),
    List("obs", "lifestyle"),
    List("obs", "comment"),
    List("obs", "focus"),
    List("obs", "foodfeat"),
    List("obs", "foodfeat", "shnitzel")
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
