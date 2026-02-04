"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, FileText, Calendar } from "lucide-react";

import { Note } from "@/services/notesService";

export default function NotePage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We allow fetching even if !user, to check for public notes
    const fetchNote = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra_notes", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Note, "id">;
          console.log("data", data);
          const isOwner =
            user && (data.userId === user.id || user.role === "admin");

          if (data.isShared === true || isOwner) {
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

  // if (!user) return null; // Removed to allow public access

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
        {/* Background Elements */}
        <div className="fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>

        <p className="opacity-50 mb-4 z-10">Note not found</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline z-10"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-6 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] bg-orange-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-4xl relative z-10">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="w-full bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10 min-h-[60vh]">
          {/* Header matching NoteDialog */}
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <div>
              <h1 className="text-2xl font-bold text-white">{note.title}</h1>
              <div className="flex items-center gap-2 text-xs text-white/30 mt-1">
                <Calendar size={12} />
                <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            {/* You could add a read-only badge or similar here if desired */}
          </div>

          <div className="p-6 bg-transparent">
            <div
              className="prose prose-invert max-w-none text-white/80"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
