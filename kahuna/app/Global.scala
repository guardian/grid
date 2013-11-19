import lib.ForceHTTPSFilter
import play.api.GlobalSettings
import play.api.mvc.WithFilters

object Global extends WithFilters(ForceHTTPSFilter) with GlobalSettings
