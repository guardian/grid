package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.model.{Image, Thumbnail}
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

class ContentDispositionTest extends AnyFunSuiteLike with ContentDisposition {

  test("build content disposition header based on filename") {
    val image = withFilename(MappingTest.testImage, "imagefilename.jpg")

    val header = getContentDisposition(image, Thumbnail, shortenDownloadFilename = false)

    header shouldBe """attachment; filename="abcdef1234567890"; filename*=UTF-8''imagefilename%20%28abcdef1234567890%29.jpg"""
  }

  test("only use id for the latin1 fallback filename field") {
    val image = withFilename(MappingTest.testImage, "©House of Commons_240508_MU_PMQs-09_42668.jpg")

    val header = getContentDisposition(image, Thumbnail, shortenDownloadFilename = false)

    header shouldBe """attachment; filename="abcdef1234567890"; filename*=UTF-8''%C2%A9House%20of%20Commons_240508_MU_PMQs-09_42668%20%28abcdef1234567890%29.jpg"""
  }

  test("use just the generated filename suffix as filename if short filenames are requested") {
    val image = withFilename(MappingTest.testImage, "SOCCER_England_124275.jpg")

    val header = getContentDisposition(image, Thumbnail, shortenDownloadFilename = true)

    header shouldBe """attachment; filename="abcdef1234567890"; filename*=UTF-8''abcdef1234567890.jpg"""
  }

  private def withFilename(image: Image, filename: String) = {
    image.copy(uploadInfo = MappingTest.testImage.uploadInfo.copy(filename = Some(filename)))
  }
}
