
# Scripts execution

## reset dynamo batch index table items state

`sbt "project admin-tools-scripts" "runMain com.gu.mediaservice.ResetImageBatchIndexTable <table name>"`

## get stats

`sbt "project admin-tools-scripts" "runMain com.gu.mediaservice.ImagesGroupByProgressState <table name>"`

## reset known errors state

`sbt "project admin-tools-scripts" "runMain com.gu.mediaservice.ResetKnownErrors <table name>"`
