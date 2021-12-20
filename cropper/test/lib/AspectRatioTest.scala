package lib

import org.scalatest.{ FunSpec, Matchers }

class AspectRatioTest extends FunSpec with Matchers {

  val fiveThreeExamples = List(
    AspectRatio.Ratio("5:3", 5466, 3280),
    AspectRatio.Ratio("5:3", 3367, 2020),
    AspectRatio.Ratio("5:3", 652, 391)
  )

  val twoThreeExamples = List(
    AspectRatio.Ratio("2:3", 1834, 2752),
    AspectRatio.Ratio("2:3", 416, 624),
    AspectRatio.Ratio("2:3", 2186, 3280)
  )

  val sixteenNineExamples = List(
    AspectRatio.Ratio("16:9", 5180, 2914),
    AspectRatio.Ratio("16:9", 3456, 1944),
    AspectRatio.Ratio("16:9", 1292, 727)
  )

  val squareExamples = List(
    AspectRatio.Ratio("1:1", 5000, 5010),
    AspectRatio.Ratio("1:1", 52, 50),
    AspectRatio.Ratio("1:1", 1000, 1005)
  )

  val unknownRatios = List(
    (3421, 1234),
    (1, 1234),
    (9001, 1337)
  )

  val allExamples = fiveThreeExamples ++ twoThreeExamples ++ sixteenNineExamples ++ squareExamples

  describe("calculate") {
    allExamples.foreach( r =>
      it(s"should correctly identify ${r.width} / ${r.height} as ${r.friendly}"){
        AspectRatio.calculate(r.width, r.height, 6).map(_.friendly) shouldEqual Some(r.friendly)
     }
    )

    it("should return None for unknown ratios"){
      unknownRatios.foreach( r =>
        AspectRatio.calculate(r._1, r._2, 6) shouldEqual None
      )
    }

 }
}
