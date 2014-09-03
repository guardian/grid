if [ $# != 1 ]
then
    echo "usage: dev-ingest.sh <PROD_API_KEY>"
    echo
    echo "Pro tip: you can get an ingestion API key by running"
    echo
    echo "   $ aws s3 ls media-service-prod-keybucket-6ufulkzj8rxr | grep dev-ingest"
    echo
    exit 1
fi

DEV_INGEST_KEY=$1

curl -H "X-Gu-Media-Key: $DEV_INGEST_KEY" https://api.media.gutools.co.uk/images?length=40 \
    | jq '.data[].data.secureUrl' \
    | cut -d '"' -f2 \
    | while read url
do
    echo Ingest...
    curl -s -o /tmp/img.jpg "$url"
    curl --data-binary @/tmp/img.jpg http://localhost:9003/images
done
