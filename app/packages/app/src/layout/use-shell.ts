import { useController } from "../ui/context";
import { shellOf, type ShellFeatures } from "../settings/install";
import { useStore } from "../store";
import type { ShellUi } from "./ui-store";

export function useShell(): ShellFeatures {
  return shellOf(useController());
}

export function useShellUi<S>(select: (s: ShellUi) => S): S {
  return useStore(useShell().ui, select);
}
