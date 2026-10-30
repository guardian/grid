package lib

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.time.LocalDate
import scala.concurrent.ExecutionContext.Implicits.global

class UsageReportSchedulerTest extends AnyFunSpec with Matchers {
  // periodDueOn doesn't use the service or the scheduler
  private val scheduler = new UsageReportScheduler(null, null)

  describe("UsageReportScheduler.periodDueOn") {
    it("reports Getty weekly, on Mondays, for the previous 7 days") {
      scheduler.periodDueOn("getty", LocalDate.parse("2026-11-02")) shouldBe
        Some(ReportPeriod(LocalDate.parse("2026-10-26"), LocalDate.parse("2026-11-01")))
      scheduler.periodDueOn("getty", LocalDate.parse("2026-11-03")) shouldBe None
    }

    it("reports other agencies monthly, on the 1st, for the previous month") {
      scheduler.periodDueOn("aap", LocalDate.parse("2026-11-01")) shouldBe
        Some(ReportPeriod(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31")))
      scheduler.periodDueOn("aap", LocalDate.parse("2026-11-02")) shouldBe None
    }

    it("doesn't report Getty monthly, or other agencies weekly") {
      scheduler.periodDueOn("getty", LocalDate.parse("2026-12-01")) shouldBe None // a Tuesday
      scheduler.periodDueOn("aap", LocalDate.parse("2026-11-02")) shouldBe None // a Monday
    }
  }
}
