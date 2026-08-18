# Instructions on quota counting for usages

## How to count image usages

Every time we use an image for a different story we should count towards the quota. However if the same image in Composer is used on a front to promote the story and used in print to illustrated the story that still counts as one quota count.

The Grid's usage details don't make it easy to explicitly tied print, front and composer stories together, so for now we're going to make some assumptions. An image that has a usage added in the last 30 days should be counted as follows:

- Each digital usage for Composer content is 1 quota count.
- If an image contain a Fronts usage(s) we don't count it additionally if there is a composer usage.
- If an image contains a Print usage we don't count it additionally if there is a composer usage.

- If an image contains a usage for a Front and no Composer usage we count it once.
- If the image contains a usage for Print and no composer usage we count it once.

- We count multiple fronts usages as one, since typically they are all promoting the same story.
- We count multiple print usages separately as these are extremely uncommon and represent typically different stories.

- We don't count towards quota if the usage status is not "published", "removed", or "unknown".

## Count usages with a given CSV input

With the given CSV input, and following the above business logic, please:

1. Do a total image usage quota count.
2. Return a JSON file in the below format. Please note the comment I wrote for each example, which explains how the count was derived.

```json
{
  "quotaCount": 5,
  "images": [
    {
      "id": "image-id-1",
      "count": 1, // Used in both composer and print, so only counted once
      "usages": [
        {
          "dateAdded": "2024-05-01T12:00:00Z",
          "platform": "digital",
          "status": "published",
          "type": "composer"
        },
        {
          "dateAdded": "2024-05-02T12:00:00Z",
          "platform": "print",
          "type": "indesign",
          "name": "The Guardian article name"
        }
      ]
    },
    {
      "id": "image-id-2",
      "count": 1, // Used in more than one front, but still only counted once
      "usages": [
        {
          "dateAdded": "2024-05-03T12:00:00Z",
          "platform": "digital",
          "status": "unknown",
          "type": "front",
          "name": "eu"
        },
        {
          "dateAdded": "2024-05-04T12:00:00Z",
          "platform": "digital",
          "status": "unknown",
          "type": "front",
          "name": "uk"
        }
      ]
    },
    {
      "id": "image-id-3",
      "count": 1, // Used in both composer and front, but still only counted once
      "usages": [
        {
          "dateAdded": "2024-05-03T12:00:00Z",
          "platform": "digital",
          "status": "unknown",
          "type": "front",
          "name": "eu"
        },
        {
          "dateAdded": "2024-05-01T12:00:00Z",
          "platform": "digital",
          "status": "published",
          "type": "composer"
        }
      ]
    },
    {
      "id": "image-id-4",
      "count": 2, // Used in print twice, so counted twice
      "usages": [
        {
          "dateAdded": "2024-05-02T12:00:00Z",
          "platform": "print",
          "type": "indesign",
          "name": "The Guardian article name 1"
        },
        {
          "dateAdded": "2024-05-10T12:00:00Z",
          "platform": "print",
          "type": "indesign",
          "name": "The Guardian article name 2"
        }
      ]
    }
  ]
}
```
