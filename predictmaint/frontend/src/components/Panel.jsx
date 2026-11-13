import React from "react";
import { cls } from "../lib/format";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
  flush = false,
}) {
  return (
    <section className={cls("panel flex flex-col", className)}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="min-w-0">
            {title && <h2 className="panel-title truncate">{title}</h2>}
            {subtitle && <p className="panel-subtitle truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cls(flush ? "" : "panel-body", "flex-1", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
