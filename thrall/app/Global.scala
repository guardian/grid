
import lib.{Config, ElasticSearch, LogConfig, ThrallMessageConsumer}
import play.api.{Application, GlobalSettings}


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
