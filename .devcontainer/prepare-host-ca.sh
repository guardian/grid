#!/bin/bash
set -euo pipefail

certificate_name="${1:-}"
if [[ -z "$certificate_name" ]]; then
    printf 'Usage: prepare-host-ca.sh <Keychain certificate name>\n' >&2
    exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    printf 'Host CA preparation requires macOS and its System Keychain.\n' >&2
    exit 1
fi

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
output_directory="$script_directory/.host-certs"
mkdir -p "$output_directory"
temporary_directory="$(mktemp -d "$output_directory/.export.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

if ! security find-certificate -a -c "$certificate_name" -p /Library/Keychains/System.keychain > "$temporary_directory/export.pem"; then
    printf 'Could not export CA "%s" from the System Keychain. Check the configured name and contact IT if it is missing.\n' "$certificate_name" >&2
    exit 1
fi

certificate_count="$(grep -c '^-----BEGIN CERTIFICATE-----$' "$temporary_directory/export.pem" || true)"
if [[ "$certificate_count" != "1" ]]; then
    printf 'Expected one System Keychain certificate matching "%s", found %s. Configure a unique certificate name.\n' "$certificate_name" "$certificate_count" >&2
    exit 1
fi

certificate_file="$temporary_directory/root-ca.crt"
if ! openssl x509 -in "$temporary_directory/export.pem" -out "$certificate_file"; then
    printf 'The selected Keychain entry is not a valid X.509 certificate.\n' >&2
    exit 1
fi

if ! openssl x509 -in "$certificate_file" -noout -purpose | grep -Fx 'SSL server CA : Yes' > /dev/null; then
    printf 'The selected certificate cannot act as a TLS server CA.\n' >&2
    exit 1
fi

if ! openssl verify -check_ss_sig -CAfile "$certificate_file" "$certificate_file" > /dev/null; then
    printf 'The selected root CA failed signature or validity checks.\n' >&2
    exit 1
fi

if ! security verify-cert -c "$certificate_file" -p ssl -L > /dev/null; then
    printf 'macOS does not trust the selected CA for TLS. Contact IT; do not disable verification.\n' >&2
    exit 1
fi

chmod 0644 "$certificate_file"
mv -f "$certificate_file" "$output_directory/root-ca.crt"
printf 'Prepared trusted host CA "%s" for the devcontainer build.\n' "$certificate_name"