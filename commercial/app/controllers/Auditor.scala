package commercial.controllers

import common.ExecutionContexts.executionContext
import contentapi.ContentApiClient
import play.api.libs.json._
import play.api.mvc.{Action, Controller}

import scala.concurrent.Future

class Auditor(capi: ContentApiClient) extends Controller {

  private def lookUp(sectionName: String): Future[JsValue] = {
    val q = capi.item(sectionName)
    capi.getResponse(q) map { response =>
      response.results map { items =>
        JsArray(
          items map { item =>
            JsString(item.webUrl)
          }
        )
      } getOrElse JsNull
    }
  }

  def audit(sectionName: String) = Action.async {
    lookUp(sectionName) map { section =>
      Ok(
        Json.obj(
          "tags"    -> "",
          "content" -> section
        )
      )
    }
  }
}
