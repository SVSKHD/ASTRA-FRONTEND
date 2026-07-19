"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface DialogContextType {
  isAnyDialogOpen: boolean;
  registerOpen: () => void;
  registerClose: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [openCount, setOpenCount] = useState(0);

  const registerOpen = useCallback(() => {
    setOpenCount((prev) => prev + 1);
  }, []);

  const registerClose = useCallback(() => {
    setOpenCount((prev) => Math.max(0, prev - 1));
  }, []);

  const isAnyDialogOpen = openCount > 0;

  return (
    <DialogContext.Provider
      value={{ isAnyDialogOpen, registerOpen, registerClose }}
    >
      {children}
    </DialogContext.Provider>
  );
};

export const useDialogContext = () => {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error("useDialogContext must be used within a DialogProvider");
  }
  return context;
};
