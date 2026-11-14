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

/**
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips/),
 * enabled by the `cloudflare` keyword in TRUSTED_PROXY_IPS.
 */
export const CLOUDFLARE_IP_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/** TRUSTED_PROXY_IPS entries plus loopback, with `cloudflare` expanded. */
function getTrustedProxyEntries(): string[] {
  return [
    ...LOOPBACK_ADDRESSES,
    ...(process.env.TRUSTED_PROXY_IPS ?? '').split(','),
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) =>
      entry.toLowerCase() === 'cloudflare' ? CLOUDFLARE_IP_RANGES : [entry],
    );
}

/**
 * Exact proxy addresses (not ranges). A request that still resolves to one of
 * these carries no client identity, so abuse signals must not group by it.
 */
export function getTrustedProxyAddresses(): string[] {
  return getTrustedProxyEntries()
    .filter((entry) => !entry.includes('/') && isIP(normalizeIp(entry)))
    .map(normalizeIp);
}

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
 * comma-separated TRUSTED_PROXY_IPS env var, which takes exact addresses,
 * CIDR ranges (e.g. "10.0.0.5, 172.16.0.0/12, 2001:db8::/32") and the
 * `cloudflare` keyword for Cloudflare's edge ranges.
 */
function getTrustedProxyMatcher(): TrustedProxyMatcher {
  const matchers = getTrustedProxyEntries()
    .map(parseTrustedEntry)
    .filter((matcher): matcher is TrustedProxyMatcher => matcher !== null);
  return (address) => matchers.some((matches) => matches(address));
}

const firstHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * True inside Cloudflare Workers (workerd). There every request arrives
 * through Cloudflare's edge, which sets `CF-Connecting-IP` itself, and there
 * is no TCP peer: workerd's `node:http` `IncomingMessage` ignores the socket
 * OpenNext passes in, so `req.socket.remoteAddress` is always undefined.
 */
export function isCloudflareWorkersRuntime(): boolean {
  return globalThis.navigator?.userAgent === 'Cloudflare-Workers';
}

/**
 * Client IP for rate limits and audit logs. Forwarded headers are read only
 * when the TCP peer is a trusted proxy, so clients cannot pick their bucket:
 *
 * 1. `X-Forwarded-For`, walked from the right: trusted proxy hops are skipped
 *    and the first untrusted hop is the client. Entries left of it are
 *    client-supplied and ignored. Each proxy appends the peer it saw, so a
 *    request that bypasses Cloudflare to reach our proxy directly resolves
 *    to its real sender.
 * 2. `cf-connecting-ip`, only when the chain is absent or every hop is a
 *    trusted proxy (for example cloudflared on loopback). It is never used
 *    to override a chain, since a client can send it to a proxy directly.
 * 3. Otherwise the leftmost trusted hop or the socket peer address.
 *
 * On Cloudflare Workers `cf-connecting-ip` is used first: the edge sets it
 * and no client can reach the Worker any other way.
 */
export function resolveClientIp(req: ClientIpRequest): string | undefined {
  if (isCloudflareWorkersRuntime()) {
    const edgeIp = firstHeaderValue(req.headers?.['cf-connecting-ip']);
    if (edgeIp && isIP(normalizeIp(edgeIp))) return normalizeIp(edgeIp);
  }
  const rawSocket = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (!rawSocket) return undefined;
  const socketAddress = normalizeIp(rawSocket);
  const isTrusted = getTrustedProxyMatcher();
  if (!isTrusted(socketAddress)) return socketAddress;

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
    if (!isIP(hop)) return leftmostTrusted ?? socketAddress;
    if (!isTrusted(hop)) return hop;
    leftmostTrusted = hop;
  }

  const cfIp = firstHeaderValue(req.headers?.['cf-connecting-ip']);
  if (cfIp && isIP(normalizeIp(cfIp))) return normalizeIp(cfIp);

  return leftmostTrusted ?? socketAddress;
}

/** Returns ip address for callers that need normalized game data. */
export function getIpAddress(req: ClientIpRequest): string {
  return resolveClientIp(req) ?? 'No IP address detected.';
}

/**
 * The IPv4 /24 or IPv6 /64 network prefix of an address, as canonical text
 * ("203.0.113.0/24", "2001:db8:a:b::/64"). Shared by households, campuses,
 * VPN exits and carrier-grade NAT, so it is weaker evidence than a full
 * address. Null for anything that is not a parseable IP address.
 */
export function ipNetworkPrefix(address: string): string | null {
  const bits = toBits(address);
  if (!bits) return null;
  if (bits.width === 32) {
    // Clear the low 8 bits; bigint division/modulo avoids bit twiddling.
    const prefix = (bits.value / 256n) * 256n;
    const octet = (shift: bigint) => Number((prefix / shift) % 256n);
    return `${octet(16777216n)}.${octet(65536n)}.${octet(256n)}.0/24`;
  }
  // The value is 128 bits wide; the first four groups sit at bits 127..64.
  const group = (index: number) =>
    ((bits.value / 2n ** BigInt(112 - index * 16)) % 65536n).toString(16);
  return `${group(0)}:${group(1)}:${group(2)}:${group(3)}::/64`;
}
