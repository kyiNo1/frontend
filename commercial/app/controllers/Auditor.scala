package commercial.controllers

import com.gu.contentapi.client.model.v1.{Content, Tag}
import common.ExecutionContexts.executionContext
import contentapi.ContentApiClient
import play.api.libs.json._
import play.api.mvc.{Action, Controller}

import scala.concurrent.Future

class Auditor(capi: ContentApiClient) extends Controller {

  private val batchSize = 100

  private case class Section(id: String, tags: Seq[Tag], items: Seq[Content])

  private def lookUp(sectionId: String): Future[Option[Section]] = {
    val q = capi.item(sectionId).pageSize(batchSize).showTags("all")
    capi.getResponse(q) map { response =>
      response.results map { items =>
        Section(
          id = sectionId,
          tags = items.flatMap(_.tags),
          items = items
        )
      }
    }
  }

  private def tagsToJson(section: Section): JsValue =
    JsArray(section.tags.filter(_.sectionId == section.id).distinct.map(_.id).sorted.map(JsString(_)))

  def audit(sectionName: String) = Action.async {
    lookUp(sectionName) map {
      _ map { section =>
        Ok(
          Json.obj(
            "tags"    -> tagsToJson(section),
            "content" -> JsArray(section.items.map(item => JsString(item.webUrl)))
          )
        )
      } getOrElse InternalServerError("No section")
    }
  }
}
