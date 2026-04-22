import { notFound } from "next/navigation";
import ItemsAdminGate from "./ItemsAdminGate";

export default function DevItemsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <ItemsAdminGate />;
}
