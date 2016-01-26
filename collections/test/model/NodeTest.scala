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
    List("obs", "foodfeat", "shnitzel"),
    List("guide"),
    List("guide", "feature 1"),
    List("guide", "feature 2"),
    List("guide", "feature 2", "feature 3")
  )

  describe("Node") {
    def buildTree = Node.fromList(collections, getPath, (l: List[String]) => "")

    it("should produce 3 children") {
      val tree = buildTree
      tree.children.length shouldEqual 3
    }

    it("should have g2 as a child") {
      val tree = buildTree
      tree.children.exists(_.basename == "g2") shouldEqual true
    }

    it("should have second level children") {
      val tree = buildTree
      val g2 = tree.children.find(_.basename == "g2").value
      g2.children.map(_.basename).toSet shouldEqual Set("features", "food", "health", "lifestyle")
    }

    it("should attach the content to the Node if available") {
      val tree = buildTree
      val obs = tree.children.find(_.data.contains(List("obs"))).value
      obs.basename shouldEqual "obs"
    }

    it("should not attach the content to the Node if not available") {
      val tree = buildTree
      val obs = tree.children.find(_.data.isEmpty).value
      obs.basename shouldEqual "g2"
    }

  }


  describe("hackmap") {
    val wrongList = List(
      TestNodeData(List("all"), "All"),
      TestNodeData(List("all", "lower"), "LOWER"),
      TestNodeData(List("all", "lower", "case"), "CaSe")
    )

    val wrongTree = Node.fromList[TestNodeData](wrongList, (d) => d.path, (d) => d.right)

    val rightTree = wrongTree hackmap { node =>
      val correctedData = node.data.map(d => d.copy(path = node.correctPath))
      Node(node.basename, node.children, node.fullPath, node.correctPath, correctedData)
    }

    val rightTreeList = rightTree.toList(Nil)


    rightTreeList(0) shouldEqual TestNodeData(List("All"), "All")
    rightTreeList(1) shouldEqual TestNodeData(List("All", "LOWER"), "LOWER")
    rightTreeList(2) shouldEqual TestNodeData(List("All", "LOWER", "CaSe"), "CaSe")

  }


}


case class TestNodeData(path: List[String], right: String)
