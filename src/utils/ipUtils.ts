import type { IncomingMessage } from 'http';
import { isIP as netIsIp } from 'net';

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];

/** Minimal request shape: Next API requests and plain Node requests both fit. */
type ClientIpRequest = Pick<IncomingMessage, 'headers'> & {
  socket?: { remoteAddress?: string } | null;
  connection?: { remoteAddress?: string } | null;
};

/** Trim, lowercase and unwrap IPv4-mapped IPv6 so addresses compare equal. */
function normalizeIp(address: string): string {
  const value = address.trim().toLowerCase();
  return value.startsWith('::ffff:') && value.includes('.')
    ? value.slice('::ffff:'.length)
    : value;
}

/** Strips an optional port ("1.2.3.4:5678", "[2001:db8::1]:443") from a forwarded hop. */
function stripPort(hop: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(hop);
  if (bracketed) return bracketed[1];
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(hop);
  return ipv4WithPort ? ipv4WithPort[1] : hop;
}

function isIP(address: string): boolean {
  return netIsIp(address) !== 0;
}

/** Address as a big integer plus its bit width, for CIDR matching. */
function toBits(address: string): { value: bigint; width: number } | null {
  const ip = normalizeIp(address);
  if (netIsIp(ip) === 4) {
    const value = ip
      .split('.')
      .reduce((acc, part) => acc * 256n + BigInt(Number(part)), 0n);
    return { value, width: 32 };
  }
  if (netIsIp(ip) !== 6) return null;

  // Rewrite an embedded IPv4 tail (e.g. 64:ff9b::192.0.2.1) as two hex groups.
  let hex = ip;
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (embedded) {
    const v4 = toBits(embedded[1]);
    if (!v4) return null;
    hex = `${ip.slice(0, embedded.index)}${(v4.value / 65536n).toString(16)}:${(v4.value % 65536n).toString(16)}`;
  }

  const parse = (part: string | undefined) =>
    part ? part.split(':').filter(Boolean) : [];
  const [head, tail] = hex.split('::');
  const left = parse(head);
  const right = parse(tail);
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const value = groups.reduce(
    (acc, group) => acc * 65536n + BigInt(parseInt(group, 16)),
    0n,
  );
  return { value, width: 128 };
}

type TrustedProxyMatcher = (address: string) => boolean;

/** Parses one TRUSTED_PROXY_IPS entry: an exact address or a CIDR range. */
function parseTrustedEntry(entry: string): TrustedProxyMatcher | null {
  const [rawAddress, rawPrefix] = entry.split('/');
  const network = toBits(rawAddress);
  if (!network) return null;
  if (rawPrefix === undefined) {
    const exact = normalizeIp(rawAddress);
    return (address) => address === exact;
  }
  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > network.width) {
    return null;
  }
  const divisor = 2n ** BigInt(network.width - prefix);
  const networkPrefix = network.value / divisor;
  return (address) => {
    const candidate = toBits(address);
    return (
      !!candidate &&
      candidate.width === network.width &&
      candidate.value / divisor === networkPrefix
    );
  };
}

/**
 * Proxies whose forwarded client headers we accept: loopback (a same-host
 * tunnel or reverse proxy such as cloudflared or nginx) plus the
 * comma-separated TRUSTED_PROXY_IPS env var, which takes exact addresses or
 * CIDR ranges (e.g. "10.0.0.5, 172.16.0.0/12, 2001:db8::/32").
 */
function getTrustedProxyMatcher(): TrustedProxyMatcher {
  const matchers = [
    ...LOOPBACK_ADDRESSES,
    ...(process.env.TRUSTED_PROXY_IPS ?? '').split(','),
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseTrustedEntry)
    .filter((matcher): matcher is TrustedProxyMatcher => matcher !== null);
  return (address) => matchers.some((matches) => matches(address));
}

const firstHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Client IP for rate limits and audit logs. Forwarded headers are read only
 * when the TCP peer is a trusted proxy, so clients cannot pick their bucket:
 *
 * 1. `cf-connecting-ip` (set by Cloudflare / cloudflared).
 * 2. `X-Forwarded-For`, walked from the right: trusted proxy hops are skipped
 *    and the first untrusted hop is the client. Entries left of it are
 *    client-supplied and ignored.
 * 3. Otherwise the socket peer address.
 *
 * A trusted proxy that is not Cloudflare must overwrite or strip any
 * client-sent `cf-connecting-ip` header, because it takes precedence.
 */
export function resolveClientIp(req: ClientIpRequest): string | undefined {
  const rawSocket = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (!rawSocket) return undefined;
  const socketAddress = normalizeIp(rawSocket);
  const isTrusted = getTrustedProxyMatcher();
  if (!isTrusted(socketAddress)) return socketAddress;

  const cfIp = firstHeaderValue(req.headers?.['cf-connecting-ip']);
  if (cfIp && isIP(normalizeIp(cfIp))) {
    return normalizeIp(cfIp);
  }

  const forwardedHeader = req.headers?.['x-forwarded-for'];
  const forwarded = (
    Array.isArray(forwardedHeader)
      ? forwardedHeader.join(',')
      : (forwardedHeader ?? '')
  )
    .split(',')
    .map((hop) => normalizeIp(stripPort(hop.trim())))
    .filter(Boolean);

  let leftmostTrusted: string | undefined;
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const hop = forwarded[index];
    // A malformed hop means the chain cannot be trusted past this point.
    if (!isIP(hop)) break;
    if (!isTrusted(hop)) return hop;
    leftmostTrusted = hop;
  }

  return leftmostTrusted ?? socketAddress;
}

/** Returns ip address for callers that need normalized game data. */
export function getIpAddress(req: ClientIpRequest): string {
  return resolveClientIp(req) ?? 'No IP address detected.';
}
