import { redirect } from "next/navigation";

export const metadata = { title: "Welcome — Golf Lessons" };

export default function OnboardingPage() {
  redirect("/register");
}
