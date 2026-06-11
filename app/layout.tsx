import type { Metadata } from "next";
import { Public_Sans, JetBrains_Mono } from "next/font/google";
import "material-symbols/outlined.css";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Volunteer Manager",
  description: "Gestión de voluntarios para Puertas Abiertas del Templo",
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "Volunteer Manager",
    description: "Gestión de voluntarios para Puertas Abiertas del Templo",
    images: [
      {
        url: "/icon-192.png",
        width: 192,
        height: 192,
        alt: "Volunteer Manager Icon",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${publicSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-dark text-text tracking-[-0.01em]">{children}</body>
    </html>
  );
}
