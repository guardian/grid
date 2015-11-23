package com.gu.mediaservice.lib.collections

import com.gu.mediaservice.model.Collection

object CollectionsManager {
  def onlyLatest(collections: List[Collection]): List[Collection] = {
    collections filter { collection =>
      // if there isn't a collection with the same path created after itself.
      !collections.exists { col => {
        col.path == collection.path && col.actionData.date.isAfter(collection.actionData.date)
      }}
    }
  }
}
