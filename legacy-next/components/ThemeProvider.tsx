"use client";
import React, { useEffect } from "react";
import { useUser } from "@/context/UserContext";

export default function ThemeProvider() {
  const { user } = useUser();

  useEffect(() => {
    if (user?.theme) {
      document.body.style.background = user.theme;
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.transition = "background 0.5s ease";
    } else {
      document.body.style.background = "#000000";
    }
  }, [user?.theme]);

  // We can also return a fixed div z-[-1] instead if body doesn't behave well, but body generally works fine!
  // We'll return null since it's just dynamically setting body styles based on auth context.
  return null;
}
