import { useState, useEffect } from "react";
import {
  Todo,
  subscribeToTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  setTodoCompleted,
  reorderTodos,
} from "../services/todosService";
import { useUser } from "@/context/UserContext";

export const useTodos = () => {
  const { user } = useUser();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setTodos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeToTodos(
      user.id,
      (data) => {
        setTodos(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(err);
        setError("Failed to load todos");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user?.id]);

  const createTodo = async (data: Partial<Todo>) => {
    if (!user?.id) return false;
    try {
      // Newest items sort to the top of their group.
      await addTodo(user.id, { ...data, order: -Date.now() });
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to create todo");
      return false;
    }
  };

  const editTodo = async (id: string, updates: Partial<Todo>) => {
    try {
      await updateTodo(id, updates);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      await setTodoCompleted(id, completed);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const removeTodo = async (id: string) => {
    try {
      await deleteTodo(id);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const reorder = async (orderedIds: string[]) => {
    try {
      await reorderTodos(orderedIds);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return {
    todos,
    loading,
    error,
    createTodo,
    editTodo,
    toggleTodo,
    removeTodo,
    reorder,
  };
};
