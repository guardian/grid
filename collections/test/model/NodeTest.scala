package model

import org.scalatest.{FunSpec, Matchers, OptionValues}

class NodeTest extends FunSpec with Matchers with OptionValues {
  val getPath = (list: List[String]) => list
  val getPathId = (list: List[String]) => list.mkString("/")
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
    def buildTree = Node.buildTree("motherwillow", collections, getPath, getPathId)

    it("should produce 2 children") {
      val tree = buildTree
      tree.children.length shouldEqual 2
    }

    it("should have g2 as a child") {
      val tree = buildTree
      tree.children.exists(_.name == "g2") shouldEqual true
    }

    it("should have second level children") {
      val tree = buildTree
      val g2 = tree.children.find(_.name == "g2").value
      g2.children.map(_.name).toSet shouldEqual Set("features", "food", "health", "lifestyle")
    }

    it("should attach the content to the Node if available") {
      val tree = buildTree
      val obs = tree.children.find(_.content.contains(List("obs"))).value
      obs.name shouldEqual "obs"
    }

    it("should not attach the content to the Node if not available") {
      val tree = buildTree
      val obs = tree.children.find(_.content.isEmpty).value
      obs.name shouldEqual "g2"
    }

  }
}
