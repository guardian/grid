# Reaper

DEV version of reaper. Should not be used in PROD (yet) as we forcefully do not validate the SSL cert before making a request.

## Requirements
```sh
pip install -r requirements.txt
```

## Usage
```sh
cd reaper
./reaper.py --media-api 'foo' --api-key 'bar' [--until '10.days'] [--limit 10] [--dry-run]
```
