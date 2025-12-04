package store

import org.scanamo.DynamoReadError

import scala.concurrent.Future

trait DynamoHelpers {
  val tableName: String
  def handleResponse[T, U](result: Either[DynamoReadError, T])(f: T => U): Future[U] = {
    result.fold(
      error => Future.failed(StoreDynamoError(error, tableName)),
      success => Future.successful(f(success))
    )
  }
}

case class StoreDynamoError(err: DynamoReadError, tableName: String) extends Throwable {
  val message: String = s"Error accessing ${tableName} store: ${err.toString}"
}
