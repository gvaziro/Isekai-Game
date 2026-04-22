import { notFound } from "next/navigation";
import BuffsAdminGate from "./BuffsAdminGate";

export default function DevBuffsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <BuffsAdminGate />;
}
