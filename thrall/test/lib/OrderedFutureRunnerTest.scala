package lib

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Success

class OrderedFutureRunnerTest extends AnyFlatSpec with Matchers {
  private val order = (0 to 10).toList
  private var current = 0
  implicit val executionContext = ExecutionContext.Implicits.global


  "OrderedFutureRunner.run" should "execute the futures in order" in {
    def runner(n: Int) = {
      val x = current
      assert(x == n)
      current += 1
      Future {
        x
      }
    }

    val results = OrderedFutureRunner.run(runner, Duration(1, SECONDS))(order)

    (results zip order) map { case (result, expected) =>
      assert(result == Success(expected))
    }
  }

  "OrderedFutureRunner.run" should "not throw exceptions" in {
    val list = List(0, 1, 2, 3)

    def runner(n: Int): Future[Int] = {
      n match {
        case 1 => Future.failed(new Exception("whoops 🍌"))
        case n => Future.successful(n)
      }
    }

    noException should be thrownBy OrderedFutureRunner.run(runner, Duration(1, SECONDS))(list)


  }
}
