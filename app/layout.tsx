import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const metadataBaseUrl = configuredAppUrl
  ? configuredAppUrl.startsWith("http://") || configuredAppUrl.startsWith("https://")
    ? configuredAppUrl
    : `https://${configuredAppUrl}`
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export const viewport: Viewport = {
  themeColor: "#4d7cfe",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "Gestión de Voluntarios • Puertas Abiertas",
  description: "Sistema de administración y organización de turnos de voluntariado para el Templo de Managua.",
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
    title: "Gestión de Voluntarios • Puertas Abiertas",
    description: "Sistema de administración y organización de turnos de voluntariado para el Templo de Managua.",
    siteName: "Volunteer Manager",
    locale: "es_NI",
    type: "website",
    images: [
      {
        url: "/app-icon-512.png",
        width: 512,
        height: 512,
        alt: "Gestión de Voluntarios • Templo de Managua",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Gestión de Voluntarios • Puertas Abiertas",
    description: "Sistema de administración y organización de turnos de voluntariado para el Templo de Managua.",
    images: ["/app-icon-512.png"],
  },
};

import { SpeedInsights } from "@vercel/speed-insights/next";
import { AutoLogout } from "@/components/AutoLogout";
import { TokenProvider } from "@/components/TokenProvider";
import { UnofficialSiteBanner } from "@/components/UnofficialSiteBanner";
import { cookies } from "next/headers";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value || null;
  const hasAcknowledgedUnofficialSite = cookieStore.get('unofficial_site_ack')?.value === '1';

  return (
    <html
      lang="es"
      className={`${outfit.variable} h-full antialiased dark`}
      style={{ colorScheme: 'dark', backgroundColor: '#050505' }}
    >
      <head>
        <meta name="facebook-domain-verification" content="p85nbgrccc871olpq4fug39saag8if" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="shortcut icon" href="/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preload" href="/material-symbols-outlined.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-dark text-text tracking-[-0.01em]">
        <TokenProvider token={sessionToken} />
        <AutoLogout />
        <UnofficialSiteBanner initialAcknowledged={hasAcknowledgedUnofficialSite} />
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
