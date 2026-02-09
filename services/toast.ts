type ToastType = "success" | "error" | "info" | "warning";

export const showToast = (
  message: string,
  options?: { type?: ToastType; duration?: number },
) => {
  const detail = {
    message,
    type: options?.type || "info",
    duration: options?.duration ?? 4000,
  };
  window.dispatchEvent(new CustomEvent("app-toast", { detail }));
};

export default showToast;
