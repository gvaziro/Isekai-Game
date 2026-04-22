import { notFound } from "next/navigation";
import RecipesAdminGate from "./RecipesAdminGate";

export default function DevRecipesPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <RecipesAdminGate />;
}
