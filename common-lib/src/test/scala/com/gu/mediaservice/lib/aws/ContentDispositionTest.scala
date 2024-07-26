package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.model.Thumbnail
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

class ContentDispositionTest extends AnyFunSuiteLike with ContentDisposition {

  def useShortenDownloadFilename: Boolean = false

  test("build content disposition header based on filename") {
    val image = MappingTest.testImage

    val header = getContentDisposition(image, Thumbnail)

    header shouldBe """attachment; filename="abcdef1234567890"; filename*=UTF-8''filename%20%28abcdef1234567890%29.jpg"""
  }

  test("only use id for the latin1 fallback filename field") {
    val image = MappingTest.testImage.copy(uploadInfo = MappingTest.testImage.uploadInfo.copy(filename = Some("©House of Commons_240508_MU_PMQs-09_42668.jpg")))

    val header = getContentDisposition(image, Thumbnail)

    header shouldBe """attachment; filename="abcdef1234567890"; filename*=UTF-8''%C2%A9House%20of%20Commons_240508_MU_PMQs-09_42668%20%28abcdef1234567890%29.jpg"""
  }

}
