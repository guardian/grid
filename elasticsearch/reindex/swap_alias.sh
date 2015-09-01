#/bin/bash

# Usage: ./swap_alias.sh oldIndexName newIndexName localhost

OLD_INDEX_NAME=$1
NEW_INDEX_NAME=$2
ES_URL=$3

cat << EOF > swap_alias.json
{
    "actions" : [
        { "remove" : { "index" : "$NEW_INDEX_NAME", "alias" : "newImagesAlias" } },
        { "remove" : { "index" : "$OLD_INDEX_NAME", "alias" : "imagesAlias" } },
        { "add" : { "index" : "$NEW_INDEX_NAME", "alias" : "imagesAlias" } },
        { "add" : { "index" : "$OLD_INDEX_NAME", "alias" : "newImagesAlias" } }
    ]
}
EOF

curl -XPOST $ES_URL:9200/_aliases -d @swap_alias.json
