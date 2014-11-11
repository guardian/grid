# Scripts

## Updating a CloudFormation stack

    $ AWS_CREDENTIAL_FILE=~/.aws-credentials sbt
    > scripts/run <CreateStack|UpdateStack> <STAGE> [PANDA_ACCESS_KEY PANDA_ACCESS_SECRET]
    
    
## Reindexing Elasticsearch
    $ sbt
    > scripts/run Reindex <ES_HOST>
