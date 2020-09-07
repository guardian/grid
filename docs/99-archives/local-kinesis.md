# Local kinesis
## Running app locally with local kinesis

by running

     ./dev-start.sh

command you will run app with local mode, it will use local instance of kinesis provided by [localstack](https://github.com/localstack/localstack) on http://localhost:4566

it is setup in `docker-compose.yml` file

if you want to cleanup your local docker environment run

     docker-compose down -v --remove-orphans

if you want to do a lookup what local kinesis contains run the following command:

    ./get-local-kinesis-records.sh

