import { notFound } from "next/navigation";
import EnemiesAdminGate from "./EnemiesAdminGate";

export default function DevEnemiesPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <EnemiesAdminGate />;
}
