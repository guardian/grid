
import play.api.{Application, GlobalSettings}
import lib.MessageConsumer


object Global extends GlobalSettings {

  override def beforeStart(app: Application): Unit =
    MessageConsumer.startSchedule()

  override def onStop(app: Application): Unit =
    MessageConsumer.actorSystem.shutdown()

}
