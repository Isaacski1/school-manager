import { getFriendlyErrorMessage } from "./errorMessages";

type ToastType = "success" | "error" | "info" | "warning";

export const showToast = (
  message: string,
  options?: { type?: ToastType; duration?: number },
) => {
  const type = options?.type || "info";
  const detail = {
    message:
      type === "error" || type === "warning"
        ? getFriendlyErrorMessage(message, message)
        : message,
    type,
    duration: options?.duration ?? 4000,
  };
  window.dispatchEvent(new CustomEvent("app-toast", { detail }));
};

export default showToast;
