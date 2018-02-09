# Generate .properties

Generate the configuration files for the various Grid services.

## Requirements
- Node 8
- Write access to `/etc/gu/`

NB you can run this to create and give yourself write access to `/etc/gu`:

```sh
mkdir /etc/gu
sudo chown -R $(whoami) /etc/gu
```

## Usage
- `npm install`
- Fill in [`config.json5`](./config.json5)
- `npm run generate-properties`
