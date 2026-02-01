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

export const fetchBranches = async (repo: string): Promise<GithubBranch[]> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/branches`);
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
): Promise<GithubTreeItem[]> => {
  try {
    // recursive=1 to get full tree
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${repo}/git/trees/${sha}?recursive=1`,
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
