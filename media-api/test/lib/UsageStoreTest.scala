package lib

import com.gu.mediaservice.model.Agency
import org.scalatest.{FunSpec, Matchers}

class UsageStoreTest extends FunSpec with Matchers {
  describe("Usage Store") {
    it("should parse RCS usage emails") {
      val stream = getClass.getResourceAsStream("/example.mail")

      val lines = UsageStore.extractEmail(stream)

      lines.head should be ("\"Cpro Name\",\"Id\"")
      lines.tail.head should be ("\"Australian Associated Press Pty Limited (Stacey Shipton)\",\"397\"")

      val list = UsageStore.csvParser(lines)

      list.head should be (SupplierUsageSummary(Agency("Australian Associated Press Pty Limited (Stacey Shipton)"), 397))
    }
  }
}
