import type { Viewport } from "next";
import { LoginPageClient } from "./LoginPageClient";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata = {
  title: "Iniciar Sesión | Volunteer Manager",
  description: "Acceso para voluntarios del Templo de Managua",
};

export default function LoginPage() {
  return <LoginPageClient />;
}
