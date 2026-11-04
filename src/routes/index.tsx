import { createFileRoute, redirect } from "@tanstack/react-router";

// Plus de connexion : l'application s'ouvre directement sur l'accueil.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/accueil", replace: true });
  },
});
