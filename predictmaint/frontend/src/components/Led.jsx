import React from "react";
import { cls } from "../lib/format";

export function Led({ tone = "normal", pulse = false, size = "md", className = "" }) {
  const palette = {
    normal: "bg-normal",
    alarm: "bg-brand",
    watch: "bg-watch",
    info: "bg-gray-400",
    offline: "bg-gray-300",
  };
  const ring = {
    normal: "led-ring",
    alarm: "led-ring-alarm",
    watch: "led-ring-watch",
  };
  const sizes = { sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-4 w-4" };
  return (
    <span
      className={cls(
        "led shrink-0",
        palette[tone] || palette.info,
        ring[tone] || "",
        sizes[size],
        (pulse || tone === "alarm") && "animate-blink",
        className
      )}
    />
  );
}
