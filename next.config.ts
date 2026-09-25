import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly opt into Next 16's default bundler; keep the existing Webpack
  // configuration for platforms that run `next build --webpack`.
  turbopack: {},
  // Emit a self-contained server bundle for a small Docker image / VPS deploy.
  output: "standalone",
  // Runtime identities, SQLite data and VAPID keys belong on the deployment's
  // persistent volume. Never copy local data or env files into a server bundle.
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.env*"],
  },
  // web-push (via https-proxy-agent) requires Node's net/http/https at runtime.
  // Turbopack externalises it automatically, but the Webpack builder — which we
  // must use on platforms Turbopack can't target, e.g. Android/arm64 in Termux —
  // tries to bundle it and fails to resolve those built-ins. Marking it external
  // keeps it a runtime require, so the Node build works on both bundlers.
  serverExternalPackages: ["web-push"],
  // The `webpack` builder additionally produces an Edge compilation (because
  // middleware runs on Edge). instrumentation.ts dynamically imports the alert
  // scheduler, and that whole graph is node-only: it reaches node:sqlite (the
  // database), yahoo-finance2's node:url, and web-push's net/http/https. None of
  // it ever executes on Edge — instrumentation returns early unless
  // NEXT_RUNTIME==='nodejs' — but Webpack still tries to compile it for Edge and
  // fails on those built-ins. So for every non-Node build, ignore that dynamic
  // import entirely; the whole node-only subtree drops out of the Edge/client
  // bundles. The Node server build is untouched and runs the scheduler normally.
  // (Turbopack handles all this itself and ignores this block.)
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime !== "nodejs") {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^\.\/lib\/scheduler$/ }),
      );
    }
    return config;
  },
};

export default nextConfig;
