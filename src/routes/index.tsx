import { createFileRoute } from "@tanstack/react-router";
import { CinderKeep } from "@/components/CinderKeep";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CinderKeep />;
}
