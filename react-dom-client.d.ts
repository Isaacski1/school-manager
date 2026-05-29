declare module "react-dom/client" {
  import type { ReactElement } from "react";

  export interface Root {
    render(children: ReactElement | null): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}
