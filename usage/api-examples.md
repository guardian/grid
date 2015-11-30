#API Response examples

##Usage (by media id)

`GET https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060330`

```json
{
  "uri": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060330",
  "length": 1,
  "data": [
    {
      "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
      "data": {
        "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
        "references": [
          {
            "type": "frontend",
            "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
          },
          {
            "type": "composer",
            "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
          }
        ],
        "platform": "digital",
        "media": "image",
        "status": "pending",
        "dateAdded": "2015-11-27T15:56:51Z",
        "lastModified": "2015-11-30T12:07:14Z"
      }
    }
  ],
  "links": [
    {
      "rel": "media",
      "href": "https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060330"
    }
  ]
}
```

##Usage (by usage id)

`GET https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735`

```json
{
  "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
  "data": {
    "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
    "references": [
      {
        "type": "frontend",
        "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
      },
      {
        "type": "composer",
        "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
      }
    ],
    "platform": "digital",
    "media": "image",
    "status": "pending",
    "dateAdded": "2015-11-27T15:56:51Z",
    "lastModified": "2015-11-30T12:07:14Z"
  },
  "links": [
    {
      "rel": "media",
      "href": "https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060330"
    },
    {
      "rel": "media-usage",
      "href": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060330"
    }
  ]
}
```

##Elasticsearch

`GET http://localhost:9200/images/image/53b2098571e4e9f1d22e98b74db9a8bc5d060330 `

```json
{
  "_source": {
    "usages": [
      {
        "isRemoved": false,
        "references": [
          {
            "type": "frontend",
            "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
          },
          {
            "type": "composer",
            "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
          }
        ],
        "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
        "lastModified": "2015-11-30T12:07:11Z",
        "media": "image",
        "dateAdded": "2015-11-27T15:56:51Z",
        "platform": "digital",
        "status": "pending"
      }
    ]
  }
}
```

##Media Api

`GET https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060330`

```json
{
  "data": {
    "usages": {
      "uri": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060330",
      "data": [
        {
          "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
          "data": {
            "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
            "references": [
              {
                "type": "frontend",
                "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
              },
              {
                "type": "composer",
                "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
              }
            ],
            "platform": "digital",
            "media": "image",
            "status": "pending",
            "dateAdded": "2015-11-27T15:56:51Z",
            "lastModified": "2015-11-30T12:07:11Z"
          }
        }
      ]
    },
    "...": "..."
  },
  "...": "..."
}
```
