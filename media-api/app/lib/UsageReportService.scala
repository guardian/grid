package lib

import com.gu.mediaservice.lib.logging.GridLogging

import java.time.LocalDate
import scala.concurrent.{ExecutionContext, Future}

sealed trait ReportOutcome
object ReportOutcome {
  case class Generated(key: String) extends ReportOutcome
  // The CSV for this period is already in S3
  case object AlreadyExists extends ReportOutcome
  // Another instance holds a valid lease for this report
  case object RunningElsewhere extends ReportOutcome
}

// Both ends are inclusive, and the end date is used in the report's S3 key
case class ReportPeriod(start: LocalDate, end: LocalDate)

class UsageReportService(config: MediaApiConfig)(implicit ec: ExecutionContext) extends GridLogging {

  // Placeholder: should claim a lease in S3, skip if the CSV exists (unless forced),
  // fetch usages and CAPI articles, write the CSV to S3, then release the lease.
  def generate(agencyKey: String, period: ReportPeriod, force: Boolean = false): Future[ReportOutcome] = {
    logger.info(s"Generating usage report for $agencyKey for $period (force = $force)")
    Future.failed(new NotImplementedError("UsageReportService.generate is not implemented yet"))
  }
}
