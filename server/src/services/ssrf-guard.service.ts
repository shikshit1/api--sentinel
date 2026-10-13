import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export interface SsrfValidationOptions {
  allowLoopbackForTesting?: boolean;
}

export class SsrfSecurityError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'SSRF_BLOCKED', details?: unknown) {
    super(message);
    this.name = 'SsrfSecurityError';
    this.code = code;
    this.details = details;
  }
}

export class SsrfGuardService {
  /**
   * Checks if an IP address string belongs to a blocked/private/special-use network.
   */
  public static isBlockedIp(ipString: string, allowLoopback = false): boolean {
    if (!ipString) return true;

    // Handle ipv6 enclosing brackets if present
    const cleanIp = ipString.replace(/^\[|\]$/g, '').trim();

    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      parsed = ipaddr.parse(cleanIp);
    } catch {
      // Unparseable IP is considered blocked / dangerous
      return true;
    }

    // Convert IPv4-mapped IPv6 address (e.g., ::ffff:127.0.0.1) to IPv4
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }

    if (parsed.kind() === 'ipv4') {
      const ipv4 = parsed as ipaddr.IPv4;
      const range = ipv4.range();

      if (allowLoopback && range === 'loopback') {
        return false;
      }

      const blockedRanges = [
        'loopback', // 127.0.0.0/8
        'private', // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
        'linkLocal', // 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
        'unspecified', // 0.0.0.0/8
        'broadcast', // 255.255.255.255
        'multicast', // 224.0.0.0/4
        'carrierGradeNat', // 100.64.0.0/10
        'reserved', // 240.0.0.0/4
      ];

      if (blockedRanges.includes(range)) {
        return true;
      }

      // Explicit check for cloud metadata address
      if (ipv4.toString() === '169.254.169.254') {
        return true;
      }

      return false;
    }

    if (parsed.kind() === 'ipv6') {
      const ipv6 = parsed as ipaddr.IPv6;
      const range = ipv6.range();

      if (allowLoopback && range === 'loopback') {
        return false;
      }

      // In IPv6, only global unicast addresses are permitted
      if (range !== 'unicast') {
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Validates target URL scheme, format, and destination hostname.
   */
  public async validateTargetUrl(
    targetUrl: string,
    authorizedBaseUrls: string[] = [],
    options: SsrfValidationOptions = {}
  ): Promise<URL> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      throw new SsrfSecurityError(
        `Invalid target URL format: "${targetUrl}"`,
        'INVALID_TARGET_URL'
      );
    }

    // 1. Strict Protocol Enforcement (HTTP and HTTPS only)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new SsrfSecurityError(
        `Forbidden protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are permitted.`,
        'FORBIDDEN_PROTOCOL'
      );
    }

    // 2. Target Authorization Enforcement
    if (authorizedBaseUrls.length > 0) {
      const isAuthorized = authorizedBaseUrls.some((authBase) => {
        try {
          const authUrl = new URL(authBase);
          return (
            parsedUrl.protocol === authUrl.protocol &&
            parsedUrl.host.toLowerCase() === authUrl.host.toLowerCase()
          );
        } catch {
          return false;
        }
      });

      if (!isAuthorized) {
        throw new SsrfSecurityError(
          `Target host "${parsedUrl.host}" is not in the list of authorized project targets.`,
          'UNAUTHORIZED_TARGET'
        );
      }
    }

    // 3. Reject immediate literal IP if blocked
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(hostname)) {
      if (SsrfGuardService.isBlockedIp(hostname, options.allowLoopbackForTesting)) {
        throw new SsrfSecurityError(
          `Direct connection to forbidden IP address "${hostname}" is blocked.`,
          'SSRF_BLOCKED_IP',
          { ip: hostname }
        );
      }
      return parsedUrl;
    }

    // 4. Preflight DNS Lookup
    try {
      const resolvedAddresses = await dns.promises.lookup(hostname, { all: true });
      if (!resolvedAddresses || resolvedAddresses.length === 0) {
        throw new SsrfSecurityError(
          `DNS resolution failed for host "${hostname}": No records found.`,
          'DNS_RESOLUTION_FAILED'
        );
      }

      for (const rec of resolvedAddresses) {
        if (SsrfGuardService.isBlockedIp(rec.address, options.allowLoopbackForTesting)) {
          throw new SsrfSecurityError(
            `DNS preflight security check failed: Host "${hostname}" resolved to forbidden address "${rec.address}".`,
            'SSRF_BLOCKED_IP',
            { hostname, address: rec.address }
          );
        }
      }
    } catch (dnsErr) {
      if (dnsErr instanceof SsrfSecurityError) {
        throw dnsErr;
      }
      const err = dnsErr as Error;
      throw new SsrfSecurityError(
        `DNS preflight error resolving host "${hostname}": ${err.message}`,
        'DNS_RESOLUTION_ERROR'
      );
    }

    return parsedUrl;
  }

  /**
   * Creates custom HTTP and HTTPS agents with connection-level DNS rebinding and TOCTOU defense.
   */
  public createSafeAgents(options: SsrfValidationOptions = {}): {
    httpAgent: http.Agent;
    httpsAgent: https.Agent;
  } {
    const allowLoopback = Boolean(options.allowLoopbackForTesting);

    const safeLookup = (
      hostname: string,
      lookupOptions: dns.LookupOptions,
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
      dns.lookup(hostname, lookupOptions, (err, address, family) => {
        if (err) {
          return callback(err, address as any, family as any);
        }

        const ipToCheck = Array.isArray(address) ? address[0]?.address : address;
        if (ipToCheck && SsrfGuardService.isBlockedIp(ipToCheck, allowLoopback)) {
          const securityErr: NodeJS.ErrnoException = new Error(
            `SSRF defense blocked connection to address "${ipToCheck}" for host "${hostname}".`
          );
          securityErr.code = 'ERR_SSRF_BLOCKED';
          return callback(securityErr, ipToCheck, family as any);
        }

        callback(null, address as any, family as any);
      });
    };

    const httpAgent = new http.Agent({
      keepAlive: false,
      maxSockets: 5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lookup: safeLookup as any,
    });

    // Hook socket creation to verify remote address at connection time
    const originalCreateHttpConnection = httpAgent.createConnection.bind(httpAgent);
    httpAgent.createConnection = (opts, oncreate) => {
      const socket = originalCreateHttpConnection(opts, oncreate);
      if (socket) {
        const netSocket = socket as net.Socket;
        netSocket.once('connect', () => {
          const remoteIp = netSocket.remoteAddress;
          if (remoteIp && SsrfGuardService.isBlockedIp(remoteIp, allowLoopback)) {
            netSocket.destroy(
              new Error(`SSRF connection-level defense: Socket connected to forbidden IP "${remoteIp}".`)
            );
          }
        });
      }
      return socket;
    };

    const httpsAgent = new https.Agent({
      keepAlive: false,
      maxSockets: 5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lookup: safeLookup as any,
    });

    const originalCreateHttpsConnection = httpsAgent.createConnection.bind(httpsAgent);
    httpsAgent.createConnection = (opts, oncreate) => {
      const socket = originalCreateHttpsConnection(opts, oncreate);
      if (socket) {
        const netSocket = socket as net.Socket;
        netSocket.once('connect', () => {
          const remoteIp = netSocket.remoteAddress;
          if (remoteIp && SsrfGuardService.isBlockedIp(remoteIp, allowLoopback)) {
            netSocket.destroy(
              new Error(`SSRF connection-level defense: Socket connected to forbidden IP "${remoteIp}".`)
            );
          }
        });
      }
      return socket;
    };

    return { httpAgent, httpsAgent };
  }
}
