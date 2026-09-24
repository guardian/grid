package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.SentryConfig
import com.typesafe.scalalogging.StrictLogging
import io.sentry.{Sentry, SpanStatus, TransactionContext, TransactionOptions}
import io.sentry.protocol.TransactionNameSource
import org.apache.pekko.stream.Materializer
import play.api.libs.typedmap.TypedKey
import play.api.mvc.{Filter, RequestHeader, Result}
import play.api.routing.Router

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try}

object SentryTracingFilter {
  /**
   * Grid is asynchronous throughout, so the transaction is carried on the request rather than on
   * Sentry's thread-local scope: a `Future` continuation can run on any thread, and a bound scope
   * would leak between requests or attach a span to the wrong one.
   */
  val transactionKey: TypedKey[io.sentry.ITransaction] = TypedKey[io.sentry.ITransaction]("sentry-transaction")

  private val excludedPathPrefixes = Seq("/management/", "/assets/")

  def transactionFor(request: RequestHeader): Option[io.sentry.ITransaction] =
    request.attrs.get(transactionKey)
}

class SentryTracingFilter(config: SentryConfig, override val mat: Materializer)(implicit ec: ExecutionContext)
  extends Filter with StrictLogging {

  import SentryTracingFilter._

  override def apply(next: RequestHeader => Future[Result])(request: RequestHeader): Future[Result] = {
    if (!config.tracingEnabled) next(request)
    else startTransaction(request) match {
      case None => next(request)
      case Some(transaction) =>
        val traced = next(request.addAttr(transactionKey, transaction))

        traced.transform {
          case Success(result) =>
            finish(transaction, SpanStatus.fromHttpStatusCode(result.header.status, SpanStatus.UNKNOWN_ERROR), Some(result.header.status))
            Success(result)
          case Failure(error) =>
            finish(transaction, SpanStatus.INTERNAL_ERROR, None)
            Failure(error)
        }
    }
  }

  /** Only routed requests are traced, so transaction names are route patterns and never contain ids. */
  private def routePattern(request: RequestHeader): Option[String] =
    request.attrs.get(Router.Attrs.HandlerDef).map(_.path)

  private def shouldTrace(request: RequestHeader): Boolean =
    !excludedPathPrefixes.exists(request.path.startsWith)

  private def startTransaction(request: RequestHeader): Option[io.sentry.ITransaction] =
    if (!shouldTrace(request)) None
    else routePattern(request).flatMap { pattern =>
      Try {
        val name = s"${request.method} $pattern"

        // Continues an incoming distributed trace when the headers are present and valid,
        // otherwise starts a new one.
        val context = Option(Sentry.continueTrace(
          request.headers.get("sentry-trace").orNull,
          request.headers.getAll("baggage").toList.asJava
        )).map { continued =>
          continued.setName(name)
          continued.setOperation("http.server")
          continued
        }.getOrElse(new TransactionContext(name, "http.server"))

        context.setTransactionNameSource(TransactionNameSource.ROUTE)

        val options = new TransactionOptions()
        // Deliberately not bound to scope; see `transactionKey`.
        options.setBindToScope(false)

        val transaction = Sentry.startTransaction(context, options)
        transaction.setData("http.request.method", request.method)
        transaction.setData("http.route", pattern)
        RequestLoggingFilter.requestIdFor(request).foreach(transaction.setTag("request_id", _))
        transaction
      }.recover {
        // Never let tracing interfere with serving the request.
        case NonFatal(e) =>
          logger.warn("Could not start Sentry transaction", e)
          null
      }.toOption.filter(_ != null)
    }

  private def finish(transaction: io.sentry.ITransaction, status: SpanStatus, httpStatus: Option[Int]): Unit =
    try {
      httpStatus.foreach(code => transaction.setData("http.response.status_code", code))
      transaction.finish(status)
    } catch {
      case NonFatal(e) => logger.warn("Could not finish Sentry transaction", e)
    }
}
