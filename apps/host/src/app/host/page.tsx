import { redirect } from "next/navigation";

// /host is an alias for the root presentation screen.
export default function HostAlias() {
  redirect("/");
}
