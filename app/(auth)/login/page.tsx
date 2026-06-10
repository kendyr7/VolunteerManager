import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Iniciar Sesión | Volunteer Manager",
  description: "Acceso para voluntarios del Templo de Managua",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4 relative overflow-hidden">
      {/* Sky-blue atmospheric wash behind hero only */}
      <div className="absolute top-0 left-0 right-0 h-[60vh] bg-gradient-to-b from-gradient-sky-light to-canvas opacity-70 pointer-events-none" />
      <div className="absolute top-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gradient-sky-mid blur-[100px] opacity-30 pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <h1 className="text-display-lg text-ink mb-3">
            Templo de Managua
          </h1>
          <p className="text-caption-uppercase text-muted tracking-widest">
            Gestión de Voluntarios
          </p>
        </div>
        
        <LoginForm />
        
        <div className="mt-8 text-center">
          <p className="text-body-sm text-muted">
            Si tienes problemas para ingresar, contacta a tu coordinador.
          </p>
        </div>
      </div>
    </div>
  );
}
