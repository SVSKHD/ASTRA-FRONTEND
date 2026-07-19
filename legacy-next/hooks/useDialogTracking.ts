import { useEffect } from "react";
import { useDialogContext } from "@/context/DialogContext";

export const useDialogTracking = (isOpen: boolean) => {
  const { registerOpen, registerClose } = useDialogContext();

  useEffect(() => {
    if (isOpen) {
      registerOpen();
      return () => {
        registerClose();
      };
    }
  }, [isOpen, registerOpen, registerClose]);
};
