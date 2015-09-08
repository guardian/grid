
import play.api.{Application, GlobalSettings}
import lib.{ElasticSearch, ThrallMessageConsumer}
import lib.{ElasticSearch, MessageConsumer, Config, LogConfig}


object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    LogConfig.init(Config)
    ElasticSearch.ensureAliasAssigned()
    ThrallMessageConsumer.startSchedule()
  }

  override def onStop(app: Application) {
    ThrallMessageConsumer.actorSystem.shutdown()
  }

}
