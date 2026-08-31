/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native module; keep it out of the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    // The database and its migrations are read at runtime through a computed
    // path, so Next's tracer cannot see them. Without this they are missing
    // from the serverless bundle and the deployed page fails at boot.
    outputFileTracingIncludes: { "/": ["./phoenix93.db", "./drizzle/**"] }
  },
  webpack: (config, { dev }) => {
    // The project lives on /mnt/c — a Windows drive mounted into WSL. inotify
    // does not propagate across that mount, so file watching silently never
    // fires and hot reload appears broken. Poll instead.
    if (dev) config.watchOptions = { poll: 1000, aggregateTimeout: 300, ignored: /node_modules/ };
    return config;
  }
};
export default nextConfig;
