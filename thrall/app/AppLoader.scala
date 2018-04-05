import lib.LogConfig
import play.api.ApplicationLoader.Context
import play.api.{Application, ApplicationLoader}

// TODO MRB: can we avoid copy-pasting this in each project?
class AppLoader extends ApplicationLoader {
  override def load(context: Context): Application = {
    LogConfig.init(context)
    new ThrallComponents(context).application
  }
}