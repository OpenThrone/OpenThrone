import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const config = defineCloudflareConfig();

config.cloudflare = {
  ...config.cloudflare,
  // Load-bearing: with the workerd export condition active, packages without
  // a workerd branch (jose, react-textarea-autosize, @panva/hkdf) fail to
  // resolve during the OpenNext esbuild bundle. Keep the default conditions.
  useWorkerdCondition: false,
};

export default config;
