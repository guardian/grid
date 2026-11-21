package lib

import model.{StatusType, UploadStatusRecord}
import org.scalatest.OptionValues
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scanamo.DynamoFormat
import org.scanamo.generic.auto._
import org.scanamo.query.UniqueKey

class UploadStatusTableTest extends AnyFunSpec with Matchers with OptionValues {
  it("compares the queued transition against the status stored by prepare") {
    val record = UploadStatusRecord("image", None, "uploader", "2026-01-01T00:00:00Z", None, StatusType.Prepared, None, 0L)
    val storedStatus = DynamoFormat[UploadStatusRecord].write(record).asObject.value("status").value

    UniqueKey(UploadStatusTable.isPrepared).toDynamoObject("status") shouldBe Some(storedStatus)
  }
}