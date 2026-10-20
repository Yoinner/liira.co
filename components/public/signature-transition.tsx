import { ViewTransition } from "react";

export function SignatureTransition({ children }: { children: React.ReactNode }) {
  return <ViewTransition enter={{ "liira-signature": "liira-route-reveal", default: "none" }} exit={{ "liira-signature": "liira-route-reveal", default: "none" }} default="none">{children}</ViewTransition>;
}
