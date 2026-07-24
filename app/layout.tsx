import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Volunteer Manager",
  description: "Gestión de voluntarios para Puertas Abiertas del Templo",
  manifest: "/manifest.json",
  verification: {
    other: {
      "facebook-domain-verification": ["p85nbgrccc871olpq4fug39saag8if"],
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Voluntarios",
  },
  openGraph: {
    title: "Volunteer Manager",
    description: "Gestión de voluntarios para Puertas Abiertas del Templo",
  },
};

import { SpeedInsights } from "@vercel/speed-insights/next";
import { AutoLogout } from "@/components/AutoLogout";
import { TokenProvider } from "@/components/TokenProvider";
import { cookies } from "next/headers";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value || null;

  return (
    <html
      lang="es"
      className={`${outfit.variable} h-full antialiased dark`}
      style={{ colorScheme: 'dark', backgroundColor: '#050505' }}
    >
      <head>
        <meta name="facebook-domain-verification" content="p85nbgrccc871olpq4fug39saag8if" />
        <link rel="apple-touch-icon" href="/app-icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-dark text-text tracking-[-0.01em]">
        <TokenProvider token={sessionToken} />
        <AutoLogout />
        {children}
        <SpeedInsights />
        <Script
          id="service-worker-registration"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
        <Script
          id="prevent-scroll-lock-shift"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var html = document.documentElement;
                var observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(m) {
                    if (m.type === 'attributes' && m.attributeName === 'style') {
                      if (html.style.overflowY === 'hidden' || html.style.overflow === 'hidden') {
                        html.style.overflowY = '';
                        html.style.overflow = '';
                      }
                    }
                  });
                });
                observer.observe(html, { attributes: true, attributeFilter: ['style'] });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
