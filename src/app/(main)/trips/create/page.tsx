// src/app/(main)/trips/create/page.tsx
import type { Metadata } from "next";
import { CreateTripForm } from "./CreateTripForm";

export const metadata: Metadata = {
  title: "Proposer un trajet — AlbaDrive",
};

export default function CreateTripPage() {
  return <CreateTripForm />;
}
