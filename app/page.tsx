// app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login"); // or "/dashboard" if you prefer
}
