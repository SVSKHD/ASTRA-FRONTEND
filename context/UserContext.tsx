"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { getDoc, setDoc, doc } from "firebase/firestore";
import { auth, db } from "@/utils/firebase";

export type UserRole = "admin" | "user";

export interface UserProfile {
  id: string;
  username: string;
  title: string;
  avatarUrl: string;
  role: UserRole;
  email: string;
  pin: string;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  updateUser: (data: Partial<UserProfile>) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync with Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "Astra-users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            // User exists, load from Firestore
            const existingUser = userDoc.data() as UserProfile;

            if (
              (existingUser.email === "rishivarma9090@gmail.com" ||
                existingUser.email === "hitheshsvsk@gmail.com") &&
              existingUser.role !== "admin"
            ) {
              existingUser.role = "admin";
              await setDoc(userDocRef, { role: "admin" }, { merge: true });
            }

            setUser(existingUser);
          } else {
            // New user, create in Firestore
            const isAdmin =
              firebaseUser.email?.includes("admin") ||
              firebaseUser.email === "hitheshsvsk@gmail.com" ||
              firebaseUser.email === "rishivarma9090@gmail.com";

            const newUser: UserProfile = {
              id: firebaseUser.uid,
              username: firebaseUser.displayName || "User",
              title: "Member",
              avatarUrl: firebaseUser.photoURL || "",
              role: isAdmin ? "admin" : "user",
              email: firebaseUser.email || "",
              pin: "",
            };

            await setDoc(userDocRef, newUser);
            setUser(newUser);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUser({
            id: firebaseUser.uid,
            username: firebaseUser.displayName || "User",
            title: "Member",
            avatarUrl: firebaseUser.photoURL || "",
            role: "user",
            email: firebaseUser.email || "",
            pin: "",
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateUser = async (data: Partial<UserProfile>) => {
    if (user) {
      const updatedUser = { ...user, ...data };
      setUser(updatedUser);

      try {
        const userDocRef = doc(db, "Astra-users", user.id);
        await setDoc(userDocRef, updatedUser, { merge: true });
      } catch (error) {
        console.error("Error updating user data:", error);
        // Optionally revert state here
      }
    }
  };

  return (
    <UserContext.Provider value={{ user, loading, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
