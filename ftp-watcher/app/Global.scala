import play.api.{Logger, Application, GlobalSettings}
import controllers.FTPWatcherTask
import lib.Config


object Global extends GlobalSettings {

  override def onStart(app: Application) {
    Logger.info {
      if (Config.isActive) "Starting in ACTIVE mode."
      else "Starting in passive mode."
    }

    // force evaluation to start the process
    FTPWatcherTask.future
  }

  override def onStop(app: Application) {
    FTPWatcherTask.shutdown()
  }

}
