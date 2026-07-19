import { useState, useCallback, useEffect } from "react";
import { Idea, ideasService } from "../services/ideasService";
import { useUser } from "@/context/UserContext";

export const useIdeas = () => {
  const { user } = useUser();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    if (!user?.id) {
      setIdeas([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await ideasService.fetchIdeas(user.id);
      setIdeas(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load ideas");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const createIdea = async (idea: Pick<Idea, "title" | "description">) => {
    if (!user?.id) return false;

    try {
      const newIdea = {
        ...idea,
        userId: user.id,
        noteIds: [],
        timeline: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ideasService.addIdea(newIdea);
      await loadIdeas(); // Refresh list
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to create idea");
      return false;
    }
  };

  const updateIdea = async (id: string, ideaUpdates: Partial<Idea>) => {
    try {
      await ideasService.updateIdea(id, {
        ...ideaUpdates,
        updatedAt: Date.now(),
      });
      await loadIdeas(); // Refresh list
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to update idea");
      return false;
    }
  };

  const deleteIdea = async (id: string) => {
    try {
      await ideasService.deleteIdea(id);
      await loadIdeas(); // Refresh list
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to delete idea");
      return false;
    }
  };

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  return {
    ideas,
    loading,
    error,
    createIdea,
    updateIdea,
    deleteIdea,
    refreshIdeas: loadIdeas,
  };
};
