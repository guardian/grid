package lib

import org.scalatest.{ FunSpec, Matchers }

class AspectRatioTest extends FunSpec with Matchers {

  val fiveThreeExamples = List(
    AspectRatio.Ratio(Some("5:3"), 5466, 3280),
    AspectRatio.Ratio(Some("5:3"), 3367, 2020),
    AspectRatio.Ratio(Some("5:3"), 652, 391)
  )

  val twoThreeExamples = List(
    AspectRatio.Ratio(Some("2:3"), 1834, 2752),
    AspectRatio.Ratio(Some("2:3"), 416, 624),
    AspectRatio.Ratio(Some("2:3"), 2186, 3280)
  )

  val sixteenNineExamples = List(
    AspectRatio.Ratio(Some("16:9"), 5180, 2914),
    AspectRatio.Ratio(Some("16:9"), 3434, 1932),
    AspectRatio.Ratio(Some("16:9"), 1292, 727)
  )

  val unknownRatios = List(
    AspectRatio.Ratio(None, 3421, 1234),
    AspectRatio.Ratio(None, 1, 1234),
    AspectRatio.Ratio(None, 9001, 1337)
  )

  val allExamples = fiveThreeExamples ++ twoThreeExamples ++ sixteenNineExamples ++ unknownRatios

  describe("calculate") {
   allExamples.foreach( r =>
     it(s"should correctly identify ${r.width} / ${r.height} as ${r.friendly}"){
        AspectRatio.calculate(r.width, r.height).flatMap(_.friendly) shouldEqual r.friendly
     }
   )

 }
}
