#/bin/bash

# Usage: ./swap_alias.sh newIndexName localhost

NEW_INDEX_NAME=$1
ES_URL=$2

cat << EOF > add_alias.json
{
    "actions" : [
        { "add" : { "index" : "$NEW_INDEX_NAME", "alias" : "newImagesAlias" } }
    ]
}
EOF

curl -XPOST $ES_URL:9200/_aliases -d @add_alias.json
