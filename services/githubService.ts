export interface GithubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

import { auth, db, githubProvider } from "@/utils/firebase";
import { signInWithPopup, GithubAuthProvider, User } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

export interface GithubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

const GITHUB_API_BASE = "https://api.github.com";

// --- Authentication & Token Management ---

export const connectGitHub = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    const credential = GithubAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    const user = result.user;

    // Check for username in providerData (usually the first one for GitHub)
    // GitHub providerId is 'github.com'
    const githubProfile = user.providerData.find(
      (p) => p.providerId === "github.com",
    );
    // If displayName is available, or we might need to fetch user profile to get 'login' (username)
    // But let's try to save what we have.
    const username =
      githubProfile?.displayName || user.displayName || "unknown";

    if (user && token) {
      await saveToken(user.uid, token, username);
      return user;
    }
    return null;
  } catch (error) {
    console.error("GitHub Login Error:", error);
    throw error;
  }
};

const saveToken = async (userId: string, token: string, username: string) => {
  try {
    await setDoc(
      doc(db, "astra-user-tokens", userId),
      {
        userId,
        githubAccessToken: token,
        githubUsername: username,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Error saving GitHub token:", error);
    throw error;
  }
};

export const getStoredToken = async (
  userId: string,
): Promise<string | null> => {
  try {
    const docRef = doc(db, "astra-user-tokens", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().githubAccessToken;
    }
    return null;
  } catch (error) {
    console.error("Error fetching GitHub token:", error);
    return null;
  }
};

// --- API Functions ---

export const fetchRepos = async (userId: string) => {
  try {
    const token = await getStoredToken(userId);
    if (!token)
      throw new Error("No GitHub token found. Please connect your account.");

    const response = await fetch(
      `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401)
        throw new Error("Unauthorized: Invalid token");
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Fetch Repos Error:", error);
    throw error;
  }
};

export const fetchBranches = async (
  repo: string,
  userId: string,
): Promise<GithubBranch[]> => {
  try {
    const token = await getStoredToken(userId);
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/branches`, {
      headers,
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error("Repository not found");
      throw new Error("Failed to fetch branches");
    }
    return await response.json();
  } catch (error) {
    console.error("GitHub API Error:", error);
    throw error;
  }
};

export const fetchTree = async (
  repo: string,
  sha: string,
  userId: string,
): Promise<GithubTreeItem[]> => {
  try {
    const token = await getStoredToken(userId);
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    // recursive=1 to get full tree
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${repo}/git/trees/${sha}?recursive=1`,
      { headers },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch tree");
    }
    const data = await response.json();
    return data.tree;
  } catch (error) {
    console.error("GitHub API Error:", error);
    throw error;
  }
};
