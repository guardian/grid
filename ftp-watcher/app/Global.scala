import lib.FTPWatcher
import play.api.{Application, GlobalSettings}


object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    FTPWatcher.watcher
  }

}
