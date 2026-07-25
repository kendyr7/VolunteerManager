import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Allow both production domain and localhost for API routes.
    // Security is enforced by session token verification inside each route handler.
    const allowedOrigin =
      process.env.NODE_ENV === 'production'
        ? 'https://volunteermanager.org'
        : 'http://localhost:3000';

    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: allowedOrigin,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
