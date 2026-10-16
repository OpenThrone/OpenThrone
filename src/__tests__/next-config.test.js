/* global describe, expect, it */
const nextConfig = require('../../next.config');

describe('Next.js development origin configuration', () => {
  it('allows the proxied alpha origin to keep the HMR websocket connected', () => {
    expect(nextConfig.allowedDevOrigins).toContain('alpha.openthrone.dev');
  });
});
