type BookDropZoneProps = {
  onFiles: (files: FileList | File[]) => void;
};

export function BookDropZone({ onFiles }: BookDropZoneProps) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(event.dataTransfer.files);
      }}
      className="flex min-h-[360px] flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center"
    >
      <div className="max-w-md">
        <p className="mb-2 text-2xl font-semibold tracking-tight">Drop an EPUB to read</p>
        <p className="mb-5 text-sm leading-6 text-zinc-500">Nothing is uploaded. The book stays in your browser.</p>
        <label className="inline-flex cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Choose a book
          <input className="sr-only" type="file" accept=".epub,application/epub+zip" onChange={(event) => event.target.files && onFiles(event.target.files)} />
        </label>
      </div>
    </div>
  );
}
