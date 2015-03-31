package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}


class CapitalisationFixerTest extends FunSpec with Matchers with MetadataHelper with CapitalisationFixer {

  it("should capitalise single words") {
    fixCapitalisation("NIGERIA") should be ("Nigeria")
  }

  it("should capitalise multiple words") {
    fixCapitalisation("united states") should be ("United States")
  }

  it("should capitalise hyphenated words") {
    fixCapitalisation("JOUXTENS-MÉZERY") should be ("Jouxtens-Mézery")
  }

}
