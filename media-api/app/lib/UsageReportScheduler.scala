package lib

import com.gu.mediaservice.lib.DateTimeUtils
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Agencies
import org.apache.pekko.actor.{Cancellable, Scheduler}

import java.time.{DayOfWeek, LocalDate}
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._
import scala.util.control.NonFatal
import scala.util.{Failure, Success}

// Only decides which reports are due, UsageReportService does the work and guards against several instances running it
class UsageReportScheduler(service: UsageReportService, scheduler: Scheduler)(implicit ec: ExecutionContext)
  extends GridLogging {

  private val CheckInterval = 1.day
  private var cancellable: Option[Cancellable] = None

  // Getty is reported weekly (on Mondays), everyone else monthly (on the 1st), each covering the period just ended
  private[lib] def periodDueOn(agencyKey: String, today: LocalDate): Option[ReportPeriod] =
    if (agencyKey == "getty" && today.getDayOfWeek == DayOfWeek.MONDAY)
      Some(ReportPeriod(today.minusDays(7), today.minusDays(1)))
    else if (agencyKey != "getty" && today.getDayOfMonth == 1)
      Some(ReportPeriod(today.minusMonths(1), today.minusDays(1)))
    else None

  private def runDueReports(): Unit = {
    val today = LocalDate.now()
    Agencies.all.keys.foreach { agencyKey =>
      periodDueOn(agencyKey, today).foreach { period =>
        service.generate(agencyKey, period).onComplete {
          case Success(outcome) => logger.info(s"Usage report for $agencyKey for $period: $outcome")
          case Failure(e)       => logger.error(s"Usage report for $agencyKey for $period failed", e)
        }
      }
    }
  }

  def scheduleUpdates(): Unit = {
    // Run at a predictable time, skipping a first run that is imminent so that a deploy, when two instances
    // are up at once, doesn't double run
    val delayUntilFirstRun = DateTimeUtils.timeUntilNextInterval(CheckInterval) match {
      case delay if delay < 5.minutes => delay.plus(CheckInterval)
      case delay                      => delay
    }
    cancellable = Some(scheduler.scheduleAtFixedRate(delayUntilFirstRun, CheckInterval) { () =>
      try runDueReports()
      catch { case NonFatal(e) => logger.error("Usage report check failed", e) }
    })
  }

  def stopUpdates(): Unit = cancellable.foreach(_.cancel())
}
