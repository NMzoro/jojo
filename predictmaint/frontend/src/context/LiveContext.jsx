import React, { createContext, useContext } from "react";
import { useLiveStream } from "../hooks/useLiveStream";

const LiveContext = createContext(null);

export function LiveProvider({ children }) {
  const value = useLiveStream();
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const context = useContext(LiveContext);
  if (!context) throw new Error("useLive doit être utilisé dans LiveProvider");
  return context;
}
