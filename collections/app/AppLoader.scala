import lib.LogConfig
import play.api.{Application, ApplicationLoader}
import play.api.ApplicationLoader.Context

// TODO MRB: can we avoid copy-pasting this in each project?
class AppLoader extends ApplicationLoader {
  override def load(context: Context): Application = {
    LogConfig.init(context)
    new CollectionsComponents(context).application
  }
}