import { motion } from "framer-motion";
import {
  Github,
  Star,
  GitFork,
  ExternalLink,
  Search,
  User as UserIcon,
  Loader2,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  connectGitHub,
  fetchRepos,
  getStoredToken,
} from "@/services/githubService";
import { auth } from "@/utils/firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";

interface RepoData {
  id: number;
  name: string;
  description: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  updated_at: string;
}

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-400",
  Python: "bg-yellow-400",
  Rust: "bg-orange-400",
  Go: "bg-cyan-400",
  JavaScript: "bg-yellow-300",
  HTML: "bg-orange-600",
  CSS: "bg-blue-500",
  Java: "bg-red-400",
  Swift: "bg-orange-500",
  Kotlin: "bg-purple-400",
  PHP: "bg-indigo-400",
  Ruby: "bg-red-500",
};

export function GithubReposView() {
  const [repos, setRepos] = useState<RepoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if we have a token stored
        const token = await getStoredToken(currentUser.uid);
        if (token) {
          setIsConnected(true);
          loadRepos(currentUser.uid);
        } else {
          // User is signed in but maybe not via GitHub or token missing?
          // For now, if signed in, assume connected or ask to connect.
          // If they signed in via connectGitHub, token is saved.
          // If they are already signed in via other means, we might need a "Link GitHub" flow.
          // But requirement said "login from github username".
          // Implementation of connectGitHub handles sign in.
          setIsConnected(false);
          setLoading(false);
        }
      } else {
        setIsConnected(false);
        setRepos([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleConnect = async () => {
    try {
      setError("");
      setLoading(true);
      const user = await connectGitHub();
      if (user) {
        setIsConnected(true);
        // Token is saved in connectGitHub
        loadRepos(user.uid);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect GitHub");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await signOut(auth);
      setIsConnected(false);
      setRepos([]);
    } catch (err) {
      console.error("Sign out error", err);
    }
  };

  const loadRepos = async (userId: string) => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchRepos(userId);
      setRepos(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch repositories");
      if (
        err.message.includes("Unauthorized") ||
        err.message.includes("No GitHub token")
      ) {
        setIsConnected(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!isConnected && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-white/5 rounded-full border border-white/10">
          <Github size={64} className="text-white" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Connect GitHub</h2>
          <p className="text-white/50 max-w-md">
            Connect your GitHub account to view and manage your repositories
            directly from Astra.
          </p>
        </div>
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        <button
          onClick={handleConnect}
          className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all flex items-center gap-2"
        >
          <Github size={20} />
          Connect with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="pb-20 space-y-6">
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            size={18}
          />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/20 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-white/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-black/20 rounded-xl border border-white/5">
            <UserIcon size={16} className="text-white/40" />
            <span className="text-sm text-white/70">
              {user?.displayName || "Connected"}
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white"
            title="Disconnect"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-white/40" size={40} />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-white/50 bg-white/5 rounded-3xl border border-white/10 border-dashed">
          <Github className="mx-auto mb-4 opacity-50" size={48} />
          <p>{error}</p>
          <button
            onClick={() => user && loadRepos(user.uid)}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepos.map((repo, index) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-2xl bg-white/5 text-white shadow-lg group-hover:bg-white/10 transition-colors">
                  <Github size={24} />
                </div>
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <ExternalLink size={16} />
                </a>
              </div>

              <div className="mb-4 flex-grow">
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors break-all">
                  {repo.name}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed line-clamp-2">
                  {repo.description || "No description available"}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-white/40 font-medium mt-auto pt-4 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      languageColors[repo.language] || "bg-gray-400"
                    }`}
                  />
                  {repo.language || "Unknown"}
                </div>
                <div className="flex items-center gap-1 hover:text-yellow-400 transition-colors">
                  <Star size={14} />
                  {repo.stargazers_count}
                </div>
                <div className="flex items-center gap-1 hover:text-blue-400 transition-colors">
                  <GitFork size={14} />
                  {repo.forks_count}
                </div>
                <div className="ml-auto text-[10px] opacity-60">
                  {new Date(repo.updated_at).toLocaleDateString()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
