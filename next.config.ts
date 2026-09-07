import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Terminal 3 SDK ships a WASM component. Leave it to Node at runtime instead
  // of letting the bundler try to inline it; it is imported dynamically and only
  // when IDENTITY_PROVIDER=terminal3, so a default build never loads it at all.
  serverExternalPackages: ["@terminal3/t3n-sdk"],
};

export default nextConfig;
