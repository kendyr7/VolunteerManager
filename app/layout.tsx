import type { Metadata, Viewport } from "next";
import { Dela_Gothic_One, Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const delaGothic = Dela_Gothic_One({
  weight: "400",
  variable: "--font-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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

import { AutoLogout } from "@/components/AutoLogout";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${delaGothic.variable} ${inter.variable} h-full antialiased dark`}
      style={{ colorScheme: 'dark', backgroundColor: '#050505' }}
    >
      <head>
        <link rel="apple-touch-icon" href="/app-icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-dark text-text tracking-[-0.01em]">
        <AutoLogout />
        {children}
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
