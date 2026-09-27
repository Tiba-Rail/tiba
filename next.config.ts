import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Terminal 3 SDK ships a WASM component. Leave it to Node at runtime instead
  // of letting the bundler try to inline it; it is imported dynamically and only
  // when IDENTITY_PROVIDER=terminal3, so a default build never loads it at all.
  serverExternalPackages: ["@terminal3/t3n-sdk"],
  // /deck is the live pitch deck (public/deck), kept current during Colosseum. /deck.pdf is the same deck as a file.
  async redirects() {
    return [
      { source: "/deck", destination: "/deck/index.html", permanent: false },
      { source: "/deck.pdf", destination: "/deck/Tiba_Deck.pdf", permanent: false },
    ];
  },
};

export default nextConfig;
