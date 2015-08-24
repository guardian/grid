
import play.api.{Application, GlobalSettings}
import lib.{ElasticSearch, MessageConsumer, Config, LogConfig}


object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    LogConfig.init(Config)
    ElasticSearch.ensureAliasAssigned()
    MessageConsumer.startSchedule()
  }

  override def onStop(app: Application) {
    MessageConsumer.actorSystem.shutdown()
  }

}
