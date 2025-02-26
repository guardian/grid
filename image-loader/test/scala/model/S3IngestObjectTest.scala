package scala.model

import model.S3IngestObject
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

class S3IngestObjectTest extends AnyFlatSpec {

  it should "infer uploader from folder after feeds" in {
    val keyParts = "fingerpost/feeds/20250226/PA/205350.SOCCER-Kilmarnock--20514432_PICTURES_PRI13.jpg".split("/")
    S3IngestObject.uploadedFromPath(keyParts) shouldBe "20250226"
  }

}
