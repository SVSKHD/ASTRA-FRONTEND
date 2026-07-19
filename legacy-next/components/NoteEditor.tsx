import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List as ListIcon,
  ListOrdered,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Heading3,
  Type,
} from "lucide-react";

interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
}

const ToolbarButton = ({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded-lg transition-colors ${
      active
        ? "bg-white/20 text-white"
        : "text-white/50 hover:text-white hover:bg-white/10"
    }`}
  >
    {children}
  </button>
);

export const NoteEditor = ({
  content,
  onChange,
  editable = true,
}: NoteEditorProps) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content,
    editable: editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[300px] text-white/80",
      },
    },
  });

  // Sync content updates from parent
  React.useEffect(() => {
    if (editor && content && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-white/5 rounded-xl border border-white/5 overflow-hidden">
      {editable && (
        <div className="flex items-center gap-1 p-2 border-b border-white/5 bg-white/5 flex-wrap">
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            active={editor.isActive("heading", { level: 1 })}
          >
            <Heading1 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor.isActive("heading", { level: 2 })}
          >
            <Heading2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            active={editor.isActive("heading", { level: 3 })}
          >
            <Heading3 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive("paragraph")}
          >
            <Type size={16} />
          </ToolbarButton>
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
          >
            <Italic size={16} />
          </ToolbarButton>
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
          >
            <ListIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
          >
            <ListOrdered size={16} />
          </ToolbarButton>
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            active={false}
          >
            <Undo size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            active={false}
          >
            <Redo size={16} />
          </ToolbarButton>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
