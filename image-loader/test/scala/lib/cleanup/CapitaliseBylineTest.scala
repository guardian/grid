package scala.lib.cleanup

import lib.cleanup.CapitaliseByline
import org.scalatest.{FunSpec, Matchers}


class CapitaliseBylineTest extends FunSpec with Matchers with MetadataHelper {

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
    val cleaned = CapitaliseByline.clean(createImageMetadata("byline" -> in)).byline

    cleaned should be (Some(out))
  }

}


