"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { getDoc, setDoc, doc } from "firebase/firestore";
import { auth, db } from "@/utils/firebase";
import { isEmailAllowed } from "@/config/auth";

export type UserRole = "admin" | "user";

export interface UserProfile {
  id: string;
  username: string;
  title: string;
  avatarUrl: string;
  role: UserRole;
  email: string;
  pin: string;
  theme?: string;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  accessError: string | null;
  updateUser: (data: Partial<UserProfile>) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Sync with Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Access control: only allow-listed emails may use the app. Anyone
        // else is signed out immediately after authenticating.
        if (!isEmailAllowed(firebaseUser.email)) {
          setUser(null);
          setAccessError("This account is not authorized to access this app.");
          await signOut(auth);
          setLoading(false);
          return;
        }
        setAccessError(null);
        try {
          const userDocRef = doc(db, "Astra-users", firebaseUser.uid);

          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            // User exists, load from Firestore
            const existingUser = userDoc.data() as UserProfile;

            // Allow-listed users are the sole users of the app and get full
            // (admin) access.
            if (
              isEmailAllowed(existingUser.email) &&
              existingUser.role !== "admin"
            ) {
              existingUser.role = "admin";
              await setDoc(userDocRef, { role: "admin" }, { merge: true });
            }

            setUser(existingUser);
          } else {
            // New user, create in Firestore. Allow-listed users get admin.
            const isAdmin = isEmailAllowed(firebaseUser.email);

            const newUser: UserProfile = {
              id: firebaseUser.uid,
              username: firebaseUser.displayName || "User",
              title: "Member",
              avatarUrl: firebaseUser.photoURL || "",
              role: isAdmin ? "admin" : "user",
              email: firebaseUser.email || "",
              pin: "",
              theme: "#000000",
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
            theme: "#000000",
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
    <UserContext.Provider value={{ user, loading, accessError, updateUser }}>
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
