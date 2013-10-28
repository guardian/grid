import play.api.{Logger, Application, GlobalSettings}
import controllers.FTPWatchers
import lib.Config


object Global extends GlobalSettings {

  override def onStart(app: Application) {
    Logger.info {
      if (Config.active) "Starting in ACTIVE mode."
      else "Starting in passive mode."
    }

    // force evaluation to start the process
    FTPWatchers.future
  }

  override def onStop(app: Application) {
    FTPWatchers.shutdown()
  }

}
