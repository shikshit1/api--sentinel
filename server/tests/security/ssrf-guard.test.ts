import { describe, it, expect } from 'vitest';
import { SsrfGuardService, SsrfSecurityError } from '../../src/services/ssrf-guard.service.js';

describe('SsrfGuardService - Security & Defense Suite', () => {
  const ssrfGuard = new SsrfGuardService();

  describe('IP Range Blocklist Verification (isBlockedIp)', () => {
    it('should block IPv4 loopback addresses (127.0.0.0/8)', () => {
      expect(SsrfGuardService.isBlockedIp('127.0.0.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('127.0.1.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('127.255.255.255')).toBe(true);
    });

    it('should block IPv6 loopback address (::1)', () => {
      expect(SsrfGuardService.isBlockedIp('::1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('[::1]')).toBe(true);
    });

    it('should block AWS / cloud metadata address (169.254.169.254)', () => {
      expect(SsrfGuardService.isBlockedIp('169.254.169.254')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('169.254.1.1')).toBe(true); // whole 169.254.0.0/16 link-local
    });

    it('should block RFC 1918 private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(SsrfGuardService.isBlockedIp('10.0.0.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('10.255.255.255')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('172.16.0.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('172.31.255.255')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('192.168.1.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('192.168.0.254')).toBe(true);
    });

    it('should block Carrier Grade NAT (100.64.0.0/10) and Multicast / Broadcast', () => {
      expect(SsrfGuardService.isBlockedIp('100.64.0.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('224.0.0.1')).toBe(true); // multicast
      expect(SsrfGuardService.isBlockedIp('255.255.255.255')).toBe(true); // broadcast
      expect(SsrfGuardService.isBlockedIp('0.0.0.0')).toBe(true); // unspecified
    });

    it('should block IPv4-mapped IPv6 representations of private or loopback addresses', () => {
      expect(SsrfGuardService.isBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('::ffff:169.254.169.254')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('::ffff:192.168.1.1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    });

    it('should block IPv6 Unique Local (fc00::/7) and Link-Local (fe80::/10)', () => {
      expect(SsrfGuardService.isBlockedIp('fc00::1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('fd12:3456:789a::1')).toBe(true);
      expect(SsrfGuardService.isBlockedIp('fe80::1')).toBe(true);
    });

    it('should allow legitimate public unicast IPv4 and IPv6 addresses', () => {
      expect(SsrfGuardService.isBlockedIp('93.184.216.34')).toBe(false); // example.com
      expect(SsrfGuardService.isBlockedIp('8.8.8.8')).toBe(false); // Google DNS
      expect(SsrfGuardService.isBlockedIp('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS IPv6
    });

    it('should allow loopback only when allowLoopbackForTesting is explicitly true', () => {
      expect(SsrfGuardService.isBlockedIp('127.0.0.1', false)).toBe(true);
      expect(SsrfGuardService.isBlockedIp('127.0.0.1', true)).toBe(false);
      expect(SsrfGuardService.isBlockedIp('::1', true)).toBe(false);
      // But cloud metadata must still be blocked even if allowLoopback is true!
      expect(SsrfGuardService.isBlockedIp('169.254.169.254', true)).toBe(true);
    });
  });

  describe('Target URL Validation (validateTargetUrl)', () => {
    it('should reject dangerous non-HTTP/HTTPS protocols', async () => {
      await expect(ssrfGuard.validateTargetUrl('file:///etc/passwd')).rejects.toThrow(
        /Only HTTP and HTTPS are permitted/
      );
      await expect(ssrfGuard.validateTargetUrl('gopher://127.0.0.1:6379')).rejects.toThrow(
        /Only HTTP and HTTPS are permitted/
      );
      await expect(ssrfGuard.validateTargetUrl('ftp://example.com/test')).rejects.toThrow(
        /Only HTTP and HTTPS are permitted/
      );
      await expect(ssrfGuard.validateTargetUrl('data:text/plain,hello')).rejects.toThrow(
        /Only HTTP and HTTPS are permitted/
      );
    });

    it('should reject unauthorized target base URLs', async () => {
      const authorized = ['https://api.sentinel.example.com'];
      await expect(
        ssrfGuard.validateTargetUrl('https://evil-api.example.com/endpoint', authorized)
      ).rejects.toThrow(/not in the list of authorized project targets/);
    });

    it('should reject direct connection attempts to cloud metadata IP', async () => {
      await expect(
        ssrfGuard.validateTargetUrl('http://169.254.169.254/latest/meta-data')
      ).rejects.toThrow(/forbidden IP address/);
    });

    it('should reject direct connection attempts to localhost and loopbacks', async () => {
      await expect(
        ssrfGuard.validateTargetUrl('http://127.0.0.1:8080/admin')
      ).rejects.toThrow(/forbidden IP address/);

      await expect(
        ssrfGuard.validateTargetUrl('http://localhost:8080/admin')
      ).rejects.toThrow(/resolved to forbidden address/);
    });

    it('should pass validation for authorized public HTTPS target', async () => {
      const target = 'https://example.com/api/v1';
      const authorized = ['https://example.com'];
      const result = await ssrfGuard.validateTargetUrl(target, authorized);

      expect(result).toBeDefined();
      expect(result.hostname).toBe('example.com');
    });
  });

  describe('Connection-Level DNS Rebinding Defense', () => {
    it('safe agent lookup should reject forbidden IPs dynamically at connection lookup', async () => {
      const { httpAgent } = ssrfGuard.createSafeAgents({ allowLoopbackForTesting: false });
      const lookupFn = (httpAgent as any).options.lookup;

      expect(lookupFn).toBeDefined();

      await new Promise<void>((resolve, reject) => {
        lookupFn('localhost', {}, (err: any) => {
          if (err && err.code === 'ERR_SSRF_BLOCKED') {
            resolve();
          } else if (err) {
            // DNS resolution error also blocks
            resolve();
          } else {
            reject(new Error('Expected lookup to block forbidden localhost address.'));
          }
        });
      });
    });
  });
});
