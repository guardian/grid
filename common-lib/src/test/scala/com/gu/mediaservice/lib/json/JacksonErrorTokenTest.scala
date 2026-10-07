package com.gu.mediaservice.lib.json

import com.fasterxml.jackson.core.{ErrorReportConfiguration, JsonFactory, JsonParseException}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers

import java.io.{ByteArrayInputStream, DataInput, DataInputStream}
import java.nio.charset.StandardCharsets.UTF_8

class JacksonErrorTokenTest extends AnyFunSuite with Matchers {
  Seq(32, ErrorReportConfiguration.DEFAULT_MAX_ERROR_TOKEN_LENGTH).foreach { maxErrorTokenLength =>
    test(s"DataInput parser bounds malformed tokens to $maxErrorTokenLength characters") {
      val factory = JsonFactory.builder()
        .errorReportConfiguration(ErrorReportConfiguration.builder()
          .maxErrorTokenLength(maxErrorTokenLength)
          .build())
        .build()
      val input = new DataInputStream(new ByteArrayInputStream(("t" + ("x" * 10000) + " ").getBytes(UTF_8)))
      val parser = factory.createParser(input: DataInput)

      try {
        val error = intercept[JsonParseException](parser.nextToken())
        error.getOriginalMessage should include ("...")
        error.getOriginalMessage.length should be <= (maxErrorTokenLength + 150)
      } finally {
        parser.close()
        input.close()
      }
    }
  }
}
