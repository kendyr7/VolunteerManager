import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "material-symbols/outlined.css";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Volunteer Manager",
  description: "Gestión de voluntarios para Puertas Abiertas del Templo",
  openGraph: {
    title: "Volunteer Manager",
    description: "Gestión de voluntarios para Puertas Abiertas del Templo",
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
      className={`${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-dark text-text tracking-[-0.01em]">{children}</body>
    </html>
  );
}
