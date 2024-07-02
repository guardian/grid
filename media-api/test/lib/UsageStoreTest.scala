package lib

import com.gu.mediaservice.model.Agency
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class UsageStoreTest extends AnyFunSpec with Matchers {
  describe("Usage Store") {
    it("should parse RCS usage emails") {
      val stream = getClass.getResourceAsStream("/example.mail")

      val lines = UsageStore.extractEmail(stream)

      lines.head should be ("\"Cpro Name\",\"Id\"")
      lines.tail.head should be ("\"Australian Associated Press Pty Limited (Stacey Shipton)\",\"397\"")

      val list = UsageStore.csvParser(lines)

      list.head should be (SupplierUsageSummary(Agency("Australian Associated Press Pty Limited (Stacey Shipton)"), 397))
    }

    it("should parse non-ASCII RCS usage emails") {
      val stream = getClass.getResourceAsStream("/nonascii.mail")

      val lines = UsageStore.extractEmail(stream)

      noException should be thrownBy {  UsageStore.csvParser(lines) }
    }
  }
}
