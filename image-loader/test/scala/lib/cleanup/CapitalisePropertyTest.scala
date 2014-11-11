package scala.lib.cleanup

import lib.cleanup.CapitaliseProperty
import lib.imaging.ImageMetadata
//import org.scalatest.FunSpec
import org.scalatest.{FunSpec, Matchers}

// class IntegrationTest extends FunSpec with TestHarness with Matchers with BeforeAndAfterAll {

class CapitalisePropertyTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a correctly capitalised name") {
    expectUnchanged("James Gorrie")
  }

  it("should not change a correctly capitalised name that includes accents") {
    expectUnchanged("Sébastien Cevey")
  }

  it("should capitalise simple uppercase names") {
    expectCleaned("JAMES GORRIE", "James Gorrie")
  }

  it("should capitalise uppercase names with accents") {
    expectCleaned("SÉBASTIEN CEVEY", "Sébastien Cevey")
  }

  it("should capitalise hyphenated names") {
    expectCleaned("PASCAL POCHARD-CASABIANCA", "Pascal Pochard-Casabianca")
  }

  it("should capitalise names with initials") {
    expectCleaned("DAVID M. BENETT", "David M. Benett")
  }

  // TODO: or should it be "d'Alessandro"?
  it("should capitalise names with apostrophes") {
    expectCleaned("STEFANIA D'ALESSANDRO", "Stefania D'Alessandro")
  }

  it("should not capitalise 'van der' particles") {
    expectCleaned("CATRINUS VAN DER VEEN", "Catrinus van der Veen")
  }

  it("should not capitalise 'de la' particles") {
    expectCleaned("FLEUR DE LA COUR", "Fleur de la Cour")
  }

  // Note: why do we allow these if they are not bylines?
  it("should not capitalise if not a name (contains /)") {
    expectUnchanged("RICHARD WATT / HANDOUT")
  }

  // Note: why do we allow these if they are not bylines?
  it("should not capitalise if not a name (contains numbers)") {
    expectUnchanged("KGC-03")
  }


  // Helpers

  def expectUnchanged(in: String): Unit = {
    expectCleaned(in, in)
  }

  def expectCleaned(in: String, out: String): Unit = {
    val metadata = createImageMetadata("byline" -> in)
    val cleaned = CapitaliseProperty.clean(metadata)

    cleaned.byline should be (Some(out))
  }

}

trait MetadataHelper {
  def createImageMetadata(metadata: (String, String)*): ImageMetadata =
    createImageMetadata(metadata.toMap)

  def createImageMetadata(metadata: Map[String, String]): ImageMetadata =
    ImageMetadata(
      description         = metadata.get("description"),
      credit              = metadata.get("credit"),
      byline              = metadata.get("byline"),
      title               = metadata.get("title"),
      copyrightNotice     = metadata.get("copyrightNotice"),
      copyright           = metadata.get("copyright"),
      suppliersReference  = metadata.get("suppliersReference"),
      source              = metadata.get("source"),
      specialInstructions = metadata.get("specialInstructions"),
      keywords            = List(),
      city                = metadata.get("city"),
      country             = metadata.get("country")
    )
}
