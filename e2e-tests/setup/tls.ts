/**
 * Generates a throwaway CA and a single leaf certificate for the e2e stack.
 *
 * The Caddy reverse proxy serves every `*.media.<domain>` site with the leaf cert (SAN-covering
 * all proxied hosts), and the Grid container trusts the CA (see entrypoint.common.sh). This lets
 * the Grid services make server-to-server HTTPS calls to each other through the proxy — e.g. the
 * cropper fetching the source image from `api.media.<domain>` and downloading the presigned S3
 * URL from `localstack.media.<domain>` — which a per-site self-signed cert (`tls internal`) could
 * not, because the JVM (Play WS and `java.net.URL`) would reject the untrusted certificate.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface GridTls {
  /** PEM-encoded CA certificate; installed into the Grid container's trust stores. */
  caCertPem: string;
  /** PEM-encoded leaf certificate served by the proxy. */
  certPem: string;
  /** PEM-encoded private key for the leaf certificate. */
  keyPem: string;
}

const openssl = (args: string[], cwd: string): void => {
  execFileSync('openssl', args, { cwd, stdio: 'pipe' });
};

/**
 * Generate a CA and a leaf certificate whose SAN covers every given host. Work happens in a
 * temporary directory that is removed before returning; only the PEM strings are kept.
 */
export function generateTls(hosts: string[]): GridTls {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-e2e-tls-'));
  try {
    openssl(
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '3650',
        '-subj', '/CN=Grid E2E Local CA',
        '-addext', 'basicConstraints=critical,CA:TRUE',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      ],
      dir,
    );

    openssl(
      [
        'req', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', 'tls.key', '-out', 'tls.csr',
        '-subj', '/CN=grid-e2e-proxy',
      ],
      dir,
    );

    const san = hosts.map((host) => `DNS:${host}`).join(',');
    fs.writeFileSync(
      path.join(dir, 'ext.cnf'),
      [
        `subjectAltName=${san}`,
        'basicConstraints=CA:FALSE',
        'keyUsage=digitalSignature,keyEncipherment',
        'extendedKeyUsage=serverAuth',
        '',
      ].join('\n'),
    );

    openssl(
      [
        'x509', '-req', '-in', 'tls.csr',
        '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
        '-out', 'tls.crt', '-days', '3650',
        '-extfile', 'ext.cnf',
      ],
      dir,
    );

    return {
      caCertPem: fs.readFileSync(path.join(dir, 'ca.crt'), 'utf8'),
      certPem: fs.readFileSync(path.join(dir, 'tls.crt'), 'utf8'),
      keyPem: fs.readFileSync(path.join(dir, 'tls.key'), 'utf8'),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
