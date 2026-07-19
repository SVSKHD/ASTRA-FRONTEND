import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  Star,
  GitFork,
  ExternalLink,
  Search,
  User as UserIcon,
  Loader2,
  LogOut,
  MoreVertical,
  Trash2,
  Eye,
  EyeOff,
  GitBranch,
  PlayCircle,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Folder,
  Code,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  connectGitHub,
  fetchRepos,
  getStoredToken,
  deleteRepo,
  updateRepoVisibility,
  fetchBranches,
  fetchWorkflows,
  GithubRepo,
  GithubBranch,
  GithubWorkflow,
  fetchTree,
  GithubTreeItem,
  getRepoSHA,
} from "@/services/githubService";
import { auth } from "@/utils/firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";

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
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  // Management State
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
  const [viewingBranches, setViewingBranches] = useState<GithubRepo | null>(
    null,
  );
  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [viewingWorkflows, setViewingWorkflows] = useState<GithubRepo | null>(
    null,
  );
  const [workflows, setWorkflows] = useState<GithubWorkflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<GithubRepo | null>(null); // Single delete
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false); // Bulk delete
  const [deleteInput, setDeleteInput] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  // Tree View State
  const [viewingTree, setViewingTree] = useState<{
    repo: string;
    branch: string;
  } | null>(null);
  const [treeItems, setTreeItems] = useState<GithubTreeItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const token = await getStoredToken(currentUser.uid);
        if (token) {
          setIsConnected(true);
          loadRepos(currentUser.uid);
        } else {
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
      setSelectedRepos(new Set());
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

  const toggleRepoSelection = (id: number) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRepos(newSelected);
  };

  const handleDelete = async () => {
    if (!user) return;
    setProcessingAction(true);
    try {
      setError(""); // Clear previous errors
      if (repoToDelete) {
        setError(""); // Clear previous errors
        await deleteRepo(repoToDelete.owner.login, repoToDelete.name, user.uid);
        setRepos((prev) => prev.filter((r) => r.id !== repoToDelete.id));
        setRepoToDelete(null);
      } else if (showBulkDeleteConfirm) {
        const reposToDelete = repos.filter((r) => selectedRepos.has(r.id));
        for (const repo of reposToDelete) {
          await deleteRepo(repo.owner.login, repo.name, user.uid);
        }
        setRepos((prev) => prev.filter((r) => !selectedRepos.has(r.id)));
        setSelectedRepos(new Set());
        setShowBulkDeleteConfirm(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete repository");
    } finally {
      setProcessingAction(false);
      setDeleteInput("");
    }
  };

  const handleToggleVisibility = async (repo: GithubRepo) => {
    if (!user) return;
    try {
      const updatedRepo = await updateRepoVisibility(
        repo.owner.login,
        repo.name,
        !repo.private,
        user.uid,
      );
      setRepos((prev) =>
        prev.map((r) => (r.id === updatedRepo.id ? updatedRepo : r)),
      );
    } catch (err: any) {
      alert(`Failed to update visibility: ${err.message}`);
    }
  };

  const loadBranches = async (repo: GithubRepo) => {
    if (!user) return;
    setViewingBranches(repo);
    setLoadingBranches(true);
    try {
      const data = await fetchBranches(repo.full_name, user.uid);
      setBranches(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadWorkflows = async (repo: GithubRepo) => {
    if (!user) return;
    setViewingWorkflows(repo);
    setLoadingWorkflows(true);
    try {
      const data = await fetchWorkflows(repo.owner.login, repo.name, user.uid);
      setWorkflows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const loadTree = async (
    repoFullName: string,
    ref: string,
    branchName: string,
  ) => {
    if (!user) return;
    setViewingTree({ repo: repoFullName, branch: branchName });
    setLoadingTree(true);
    setTreeItems([]);
    try {
      let sha = ref;
      // If we don't have a SHA (e.g. default branch name), fetch it
      if (!ref.match(/^[0-9a-f]{40}$/)) {
        sha = await getRepoSHA(repoFullName, ref, user.uid);
      }

      const data = await fetchTree(repoFullName, sha, user.uid);
      // Sort: Folders first, then files
      const sorted = data.sort((a, b) => {
        if (a.type === b.type) return a.path.localeCompare(b.path);
        return a.type === "tree" ? -1 : 1;
      });
      setTreeItems(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTree(false);
    }
  };

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getGitHubAvatar = () => {
    // Try to find the user's github avatar from the repos
    // Assuming the user owns most of the repos or at least the first one matches
    if (repos.length > 0) {
      // Find a repo owned by the current user maybe?
      // Or just use the first repo's owner avatar
      return repos[0].owner.avatar_url;
    }
    return null;
  };

  const githubAvatar = getGitHubAvatar();

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
    <div className="pb-20 space-y-6 relative">
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 sticky top-0 z-30 backdrop-blur-xl">
        <div className="flex-1 relative flex items-center gap-3">
          <div className="relative flex-1">
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
          {/* GitHub Avatar beside Search Bar */}
          {githubAvatar && (
            <div
              className="w-10 h-10 rounded-full border border-white/10 overflow-hidden flex-shrink-0"
              title="GitHub Account"
            >
              <img
                src={githubAvatar}
                alt="GitHub Avatar"
                className="w-full h-full object-cover"
              />
            </div>
          )}
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
          <button
            onClick={() => {
              if (user) loadRepos(user.uid);
            }}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"
            title="Refresh Repositories"
            disabled={loading}
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRepos.map((repo, index) => (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`group relative overflow-hidden bg-white/5 border ${selectedRepos.has(repo.id) ? "border-blue-500/50 bg-blue-500/10" : "border-white/10"} rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 flex flex-col h-full`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedRepos.has(repo.id)}
                      onChange={() => toggleRepoSelection(repo.id)}
                      className="w-5 h-5 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                    />
                    <div className="p-3 rounded-2xl bg-white/5 text-white shadow-lg group-hover:bg-white/10 transition-colors">
                      <Github size={24} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleVisibility(repo)}
                      className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                      title={repo.private ? "Make Public" : "Make Private"}
                    >
                      {repo.private ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className="mb-4 flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors break-all">
                      {repo.name}
                    </h3>
                    {repo.private && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-bold border border-yellow-500/20 uppercase">
                        Private
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed line-clamp-2">
                    {repo.description || "No description available"}
                  </p>
                </div>

                {/* Actions Row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    onClick={() => loadBranches(repo)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group/btn"
                  >
                    <GitBranch size={16} className="text-purple-400 mb-1" />
                    <span className="text-[10px] text-white/60 group-hover/btn:text-white">
                      Branches
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      loadTree(
                        repo.full_name,
                        repo.default_branch,
                        repo.default_branch,
                      )
                    }
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group/btn"
                  >
                    <Code size={16} className="text-blue-400 mb-1" />
                    <span className="text-[10px] text-white/60 group-hover/btn:text-white">
                      Code
                    </span>
                  </button>
                  <button
                    onClick={() => loadWorkflows(repo)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group/btn"
                  >
                    <PlayCircle size={16} className="text-green-400 mb-1" />
                    <span className="text-[10px] text-white/60 group-hover/btn:text-white">
                      Actions
                    </span>
                  </button>
                  <button
                    onClick={() => setRepoToDelete(repo)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/5 hover:border-red-500/30 transition-all group/btn"
                  >
                    <Trash2 size={16} className="text-red-400 mb-1" />
                    <span className="text-[10px] text-white/60 group-hover/btn:text-white">
                      Delete
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-white/40 font-medium mt-auto pt-4 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        (repo.language && languageColors[repo.language]) ||
                        "bg-gray-400"
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

          {/* Bulk Action Bar */}
          <AnimatePresence>
            {selectedRepos.size > 0 && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-6 z-40 px-8"
              >
                <span className="text-white font-medium">
                  {selectedRepos.size} selected
                </span>
                <div className="h-6 w-px bg-white/10" />
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={18} />
                  <span className="font-semibold">Bulk Delete</span>
                </button>
                <button
                  onClick={() => setSelectedRepos(new Set())}
                  className="p-1 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors ml-4"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Modals */}
      <AnimatePresence>
        {/* Branches Modal */}
        {viewingBranches && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <GitBranch size={20} className="text-purple-400" />
                  Branches
                </h3>
                <button
                  onClick={() => setViewingBranches(null)}
                  className="text-white/40 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-3">
                {loadingBranches ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-white/40" />
                  </div>
                ) : branches.length === 0 ? (
                  <p className="text-white/40 text-center py-8">
                    No branches found.
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.name}
                      className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center group hover:bg-white/10"
                    >
                      <div className="flex flex-col">
                        <span className="text-white font-mono font-medium">
                          {branch.name}
                        </span>
                        <span className="text-xs text-white/30 truncate max-w-[200px]">
                          {branch.commit.sha.substring(0, 7)}
                        </span>
                      </div>
                      <a
                        href={branch.commit.url}
                        target="_blank"
                        className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:underline"
                      >
                        View
                      </a>
                      <button
                        onClick={() =>
                          loadTree(
                            viewingBranches.full_name,
                            branch.commit.sha,
                            branch.name,
                          )
                        }
                        className="text-white/40 hover:text-white transition-colors"
                        title="View Files"
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Workflows Modal */}
        {viewingWorkflows && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <PlayCircle size={20} className="text-green-400" />
                  GitHub Actions
                </h3>
                <button
                  onClick={() => setViewingWorkflows(null)}
                  className="text-white/40 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-3">
                {loadingWorkflows ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-white/40" />
                  </div>
                ) : workflows.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-white/40">No workflows found.</p>
                    <a
                      href={`${viewingWorkflows.html_url}/actions`}
                      target="_blank"
                      className="text-blue-400 text-sm hover:underline"
                    >
                      Create Action on GitHub
                    </a>
                  </div>
                ) : (
                  workflows.map((wf) => (
                    <div
                      key={wf.id}
                      className="p-4 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center group hover:bg-white/10"
                    >
                      <div className="flex flex-col">
                        <span className="text-white font-medium mb-1">
                          {wf.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${wf.state === "active" ? "bg-green-500/20 text-green-400 border-green-500/20" : "bg-gray-500/20 text-gray-400 border-gray-500/20"}`}
                          >
                            {wf.state}
                          </span>
                          <img
                            src={wf.badge_url}
                            alt="Status"
                            className="h-4"
                          />
                        </div>
                      </div>
                      <a
                        href={wf.html_url}
                        target="_blank"
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/20 text-white/60 hover:text-white"
                      >
                        <ExternalLink size={16} />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {(repoToDelete || showBulkDeleteConfirm) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0a0a0a] border border-red-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />

              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Danger Zone</h3>
                  <p className="text-red-400 text-sm">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-white/70 text-sm leading-relaxed">
                  You are about to delete
                  <strong className="text-white">
                    {repoToDelete
                      ? ` ${repoToDelete.name}`
                      : ` ${selectedRepos.size} repositories`}
                  </strong>
                  . This will permanently delete the repositories and all
                  language statistics, branches, and associated data.
                </p>

                <div className="space-y-2">
                  <label className="text-xs text-white/40 uppercase font-bold tracking-wider">
                    Type{" "}
                    <span className="text-red-400 select-all">
                      {repoToDelete ? repoToDelete.name : "confirm delete"}
                    </span>{" "}
                    to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:border-red-500/50 focus:outline-none transition-colors font-mono text-sm"
                    placeholder={`Type to confirm...`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setRepoToDelete(null);
                    setShowBulkDeleteConfirm(false);
                    setDeleteInput("");
                  }}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={
                    deleteInput.trim() !==
                      (repoToDelete ? repoToDelete.name : "confirm delete") ||
                    processingAction
                  }
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2"
                >
                  {processingAction ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* File Tree Modal */}
        {viewingTree && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Code size={20} className="text-blue-400" />
                    {viewingTree.repo.split("/")[1]}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-white/40 font-mono mt-1">
                    <GitBranch size={12} />
                    {viewingTree.branch}
                  </div>
                </div>
                <button
                  onClick={() => setViewingTree(null)}
                  className="text-white/40 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                {loadingTree ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-white/40" size={32} />
                  </div>
                ) : treeItems.length === 0 ? (
                  <p className="text-white/40 text-center py-20">
                    No files found.
                  </p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {treeItems.map((item) => (
                      <div
                        key={item.path}
                        className="px-6 py-3 hover:bg-white/5 flex items-center gap-3 group transition-colors"
                      >
                        {item.type === "tree" ? (
                          <Folder
                            size={18}
                            className="text-blue-400 flex-shrink-0"
                          />
                        ) : (
                          <FileText
                            size={18}
                            className="text-white/30 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <span
                            className={`font-mono text-sm ${item.type === "tree" ? "text-white font-medium" : "text-white/70"}`}
                          >
                            {item.path}
                          </span>
                        </div>
                        {item.size !== undefined && (
                          <span className="text-xs text-white/20 font-mono">
                            {(item.size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
