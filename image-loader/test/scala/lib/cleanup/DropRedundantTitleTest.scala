package scala.lib.cleanup

import org.scalatest.{Matchers, FunSpec}
import lib.cleanup.DropRedundantTitle

class DropRedundantTitleTest extends FunSpec with Matchers with MetadataHelper {

  it("should be None if no title") {
    val imageMetadata = createImageMetadata("description" -> "Brief description")
    DropRedundantTitle.clean(imageMetadata).title should be (None)
  }

  it("should be the title if no description") {
    val imageMetadata = createImageMetadata("title" -> "Brief title")
    DropRedundantTitle.clean(imageMetadata).title should be (Some("Brief title"))
  }

  it("should be the title if not a prefix of the description") {
    val imageMetadata = createImageMetadata("title" -> "Brief title", "description" -> "Brief description")
    DropRedundantTitle.clean(imageMetadata).title should be (Some("Brief title"))
  }

  it("should be None if exactly the description") {
    val imageMetadata = createImageMetadata("title" -> "Brief title", "description" -> "Brief title")
    DropRedundantTitle.clean(imageMetadata).title should be (None)
  }

  it("should be None if a prefix of the description") {
    val imageMetadata = createImageMetadata("title" -> "Brief title", "description" -> "Brief title. Also more description.")
    DropRedundantTitle.clean(imageMetadata).title should be (None)
  }

}
