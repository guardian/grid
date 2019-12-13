
# This folder contain sample stress test on grid

# dependencies

- grid-cli https://github.com/guardian/grid-cli
- exiftool
- jq

### how to run the test
- include test image in `/grid/stress-test/test-files` directory
- start ```./stress-test/ping-grid-search.sh``` script AND ```./stress-test/stress-upload.shz``` in parallel
- watch how grid behaves, very useful for monitoring ES cluster that will be cerebro https://github.com/lmenezes/cerebro


