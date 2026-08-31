import type { Metadata } from "next";
import { PresentationController } from "@/components/presentation-controller";

export const metadata: Metadata = {
  title: "PreachSync — Controller",
  description: "Remote presentation controller",
};

export default function ControllerPage() {
  return <PresentationController />;
}
