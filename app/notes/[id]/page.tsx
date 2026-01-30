"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, FileText, Calendar } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Since we don't have a shared type exported for Note yet (it's in notesService but verify), locally defining or importing
import { Note } from "@/services/notesService";

export default function NotePage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchNote = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra_notes", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Note;
          if (data.userId === user.id) {
            setNote({ id: docSnap.id, ...data });
          } else {
            console.error("Unauthorized");
          }
        }
      } catch (error) {
        console.error("Error fetching note:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, [id, user]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Note not found</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="bg-[#111] border border-white/10 rounded-3xl p-8 min-h-[400px]">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-1">{note.title}</h1>
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Calendar size={12} />
                <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="prose prose-invert prose-sm max-w-none text-white/70">
            <ReactMarkdown>{note.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
