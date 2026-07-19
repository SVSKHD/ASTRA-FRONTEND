import { db } from "../utils/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { UserProfile } from "../context/UserContext";

export const searchUsers = async (
  emailQuery: string,
): Promise<UserProfile[]> => {
  if (!emailQuery || emailQuery.length < 3) return [];

  // Firestore doesn't support native fuzzy search or 'startsWith' easily without specific structure/third-party.
  // We will use a simple inequality filter for 'startsWith' emulation:
  // where('email', '>=', query), where('email', '<=', query + '\uf8ff')
  // NOTE: This assumes email is stored in a way that allows this (case-sensitive?).
  // UserProfile email is usually from auth, so lowercase is safer?
  // Let's assume exact match or close enough for now, or just client side filter if list is small (it's not).
  // Actually, for "Invite", exact email is often best to avoid leaking users.
  // But user asked for "search". Let's try the range query.

  try {
    const usersRef = collection(db, "Astra-users");
    const q = query(
      usersRef,
      where("email", ">=", emailQuery),
      where("email", "<=", emailQuery + "\uf8ff"),
      limit(5),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as UserProfile);
  } catch (error) {
    console.error("Error searching users:", error);
    return [];
  }
};
