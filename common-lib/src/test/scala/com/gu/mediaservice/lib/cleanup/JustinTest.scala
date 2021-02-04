package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class JustinTest extends FunSpec with Matchers with MetadataHelper {


  describe("Allstar") {

    it("should strip redundant byline but use it as canonical casing for credit") {
      val image = createImageFromMetadata("credit" -> "Allstar/UNIVERSAL PICTURES", "byline" -> "Universal Pictures")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal Pictures")))
      processedImage.metadata.credit should be(Some("Universal Pictures/Allstar"))
      // TODO Check this with Mat.
      processedImage.metadata.byline should be(Some("Universal Pictures"))
    }

  }


  def applyProcessors(image: Image): Image =
    SupplierProcessors.apply(image)


}
