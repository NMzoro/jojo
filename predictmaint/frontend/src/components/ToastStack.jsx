import React from "react";
import { cls } from "../lib/format";
import { IconAlert, IconBell, IconCheck, IconClose } from "./Icons";

const TONES = {
  alarm: {
    border: "border-l-brand",
    icon: "bg-brand-50 text-brand",
    Icon: IconAlert,
  },
  watch: {
    border: "border-l-watch",
    icon: "bg-amber-50 text-amber-600",
    Icon: IconBell,
  },
  info: {
    border: "border-l-gray-400",
    icon: "bg-gray-100 text-gray-600",
    Icon: IconCheck,
  },
};

export function ToastStack({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-[400px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((toast) => {
        const tone = TONES[toast.tone] || TONES.info;
        const Icon = tone.Icon;
        return (
          <div
            key={toast.id}
            className={cls(
              "pointer-events-auto flex items-start gap-3 rounded-sm border border-line border-l-4 bg-white p-4 shadow-toast animate-toast-in",
              tone.border
            )}
            role="status"
          >
            <span className={cls("rounded-sm p-2", tone.icon)}>
              <Icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold text-ink">{toast.title}</p>
                {toast.meta && (
                  <span className="num text-sm font-semibold text-brand">{toast.meta}</span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-body">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              className="text-gray-400 transition-colors hover:text-ink"
              aria-label="Fermer"
            >
              <IconClose size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
