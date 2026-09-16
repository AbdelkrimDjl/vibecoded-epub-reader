"use client";

import { useState } from "react";
import { BookDropZone } from "@/components/book-drop-zone";
import { BookViewer } from "@/components/book-viewer";

type BookFile = { name: string; file: File };
type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
type DirectoryEntry = { kind: "file" | "directory"; name: string; getFile: () => Promise<File> };

export default function EpubReader() {
  const [selected, setSelected] = useState<BookFile | null>(null);
  const [status, setStatus] = useState("Drop an EPUB here or choose a book to begin.");

  const addFiles = (files: FileList | File[]) => {
    const epubFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".epub")).map((file) => ({ name: file.name, file }));
    if (!epubFiles.length) { setStatus("Please choose an .epub file."); return; }
    setSelected(epubFiles[0]);
    setStatus("Opening book…");
  };

  const scanFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) { setStatus("Folder scanning is not supported here. Use Choose EPUB instead."); return; }
    try {
      const directory = await picker();
      const entries = (directory as unknown as { values: () => AsyncIterable<DirectoryEntry> }).values();
      const found: BookFile[] = [];
      for await (const entry of entries) if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".epub")) found.push({ name: entry.name, file: await entry.getFile() });
      if (found[0]) setSelected(found[0]);
      setStatus(found.length ? `${found.length} EPUB${found.length === 1 ? "" : "s"} found.` : "No EPUB files found in that folder.");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setStatus("Could not read that folder.");
    }
  };

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-zinc-50 text-zinc-950">
      {selected ? <BookViewer book={selected} onFiles={addFiles} /> : <section className="flex min-h-screen flex-col p-4 sm:p-8"><BookDropZone onFiles={addFiles} /><div className="mt-3 flex justify-center gap-3"><button onClick={() => void scanFolder()} className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline">Choose a books folder</button><span className="text-sm text-zinc-300">{status}</span></div></section>}
    </main>
  );
}
