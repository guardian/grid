
import play.api.{Application, GlobalSettings}
import lib.{ElasticSearch, MessageConsumer}


object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    ElasticSearch.ensureIndexExists()
    MessageConsumer.startSchedule()
  }

  override def onStop(app: Application) {
    MessageConsumer.actorSystem.shutdown()
  }

}
