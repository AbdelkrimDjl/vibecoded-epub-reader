"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BookFile = { name: string; file: File };
type TocItem = { label: string; href: string; index?: number; subitems?: TocItem[]; depth?: number };
type Rendition = {
  display: (target?: string | number) => Promise<unknown>;
  destroy: () => void;
  themes: { default: (styles: Record<string, Record<string, string>>) => void; override: (name: string, value: string, priority?: boolean) => void };
  hooks: { content: { register: (callback: (contents: { document: Document }) => void) => void } };
};
type SpineItem = { id?: string; href: string; index?: number };
type EpubBook = {
  ready: Promise<unknown>;
  spine: { items: SpineItem[]; get: (target: string) => SpineItem | null };
  navigation: { toc: TocItem[] };
  renderTo: (element: HTMLDivElement, options: Record<string, string>) => Rendition;
};

type BookViewerProps = { book: BookFile; onFiles: (files: FileList | File[]) => void };

export function BookViewer({ book, onFiles }: BookViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentIndexRef = useRef(0);
  const firstReadableIndexRef = useRef(0);
  const fontSizeRef = useRef(18);
  const lineHeightRef = useRef(1.6);
  const fontFamilyRef = useRef("times");
  const [status, setStatus] = useState("Opening book…");
  const [error, setError] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.6);
  const [fontFamily, setFontFamily] = useState("times");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fontStack = (font: string) => font === "times"
    ? '"Times New Roman", Times, serif'
    : font === "inter"
      ? "var(--font-inter), Arial, sans-serif"
      : font === "roboto"
        ? '"Roboto", Arial, sans-serif'
        : '"Noto Serif", Georgia, serif';

  const renderSection = useCallback(async (index: number, message = "Ready to read.", target?: string, targetLabel?: string) => {
    const epub = bookRef.current;
    if (!epub || !frameRef.current || !epub.spine.items[index]) return;

    setStatus("Opening section…");
    renditionRef.current?.destroy();
    frameRef.current.replaceChildren();

    const rendition = epub.renderTo(frameRef.current, { width: "100%", height: "100%", flow: "scrolled-doc", manager: "default", overflow: "scroll" });
    rendition.hooks.content.register((contents) => {
      const rootStyles = getComputedStyle(document.documentElement);
      const body = contents.document.body;
      const usesBookFont = fontFamilyRef.current === "book";
      body.classList.toggle("typeset", !usesBookFont);
      body.classList.toggle("typeset-docs", !usesBookFont);
      for (const variable of ["--font-geist", "--font-inter", "--font-geist-mono"]) body.style.setProperty(variable, rootStyles.getPropertyValue(variable));
      body.style.setProperty("--typeset-font-body", usesBookFont ? "inherit" : fontStack(fontFamilyRef.current));
      body.style.setProperty("--typeset-font-heading", usesBookFont ? "inherit" : fontStack(fontFamilyRef.current));
      body.style.setProperty("--typeset-font-mono", "var(--font-geist-mono), monospace");
      const typesetStylesheet = contents.document.createElement("link");
      typesetStylesheet.rel = "stylesheet";
      typesetStylesheet.href = "/typeset.css";
      contents.document.head.append(typesetStylesheet);
      contents.document.documentElement.style.overflowX = "hidden";
      body.style.overflowX = "hidden";
    });
    rendition.themes.default({
      body: {
        "line-height": "var(--typeset-leading) !important",
        color: "#27272a !important",
        background: "transparent !important",
        margin: "0 auto !important",
        "max-width": "37em !important",
        padding: "2rem 1.25rem !important",
      },
      "img, svg, video": { "max-width": "100% !important", height: "auto !important" },
    });
    rendition.themes.override("font-size", `${fontSizeRef.current}px`, true);
    rendition.themes.override("line-height", `${lineHeightRef.current}`, true);
    if (fontFamilyRef.current !== "book") rendition.themes.override("font-family", fontStack(fontFamilyRef.current), true);
    renditionRef.current = rendition;
    currentIndexRef.current = index;

    try {
      const fragment = target?.split("#")[1];
      const displayTarget = fragment ? `${epub.spine.items[index].href}#${fragment}` : index;
      await rendition.display(displayTarget);
      if (fragment && frameRef.current) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const iframe = frameRef.current.querySelector<HTMLIFrameElement>("iframe");
        const contentDocument = iframe?.contentDocument;
        if (contentDocument) {
          let decodedFragment = fragment;
          try { decodedFragment = decodeURIComponent(fragment); } catch { /* Keep the original fragment when it is not URI-encoded. */ }
          let anchor = contentDocument.getElementById(decodedFragment);
          if (!anchor) anchor = contentDocument.getElementsByName(decodedFragment)[0] ?? null;
          if (!anchor && targetLabel) {
            const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
            const expectedLabel = normalizeText(targetLabel);
            anchor = Array.from(contentDocument.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
              .find((heading) => normalizeText(heading.textContent ?? "") === expectedLabel) ?? null;
          }
          const scrollContainer = frameRef.current.querySelector<HTMLElement>(".epub-container") ?? frameRef.current;
          if (anchor && scrollContainer && iframe) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();
            const anchorRect = anchor.getBoundingClientRect();
            const iframeScrollTop = contentDocument.documentElement.scrollTop || contentDocument.body.scrollTop;
            const targetTop = scrollContainer.scrollTop + iframeRect.top - containerRect.top + iframeScrollTop + anchorRect.top - 24;
            const maximumScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            scrollContainer.scrollTo({ top: Math.max(0, Math.min(targetTop, maximumScrollTop)), behavior: "auto" });
          }
        }
      }
      setStatus(message);
    } catch (sectionError) {
      console.error("Unable to open EPUB section", sectionError);
      setError(true);
      setStatus("Could not open this section.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBook = async () => {
      if (!frameRef.current) return;
      setStatus("Opening book…");
      setError(false);
      try {
        const ePubModule = await import("epubjs");
        const epub = ePubModule.default(await book.file.arrayBuffer()) as unknown as EpubBook;
        await epub.ready;
        if (cancelled) return;
        bookRef.current = epub;
        const firstReadable = epub.spine.items.findIndex((item) => !/cover/i.test(`${item.id ?? ""} ${item.href}`));
        firstReadableIndexRef.current = firstReadable >= 0 ? firstReadable : 0;
        const normalizeHref = (href: string) => decodeURIComponent(href.split("#")[0]).replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
        const spineIndexForHref = (href: string) => {
          const direct = epub.spine.get(href);
          if (direct?.index !== undefined) return direct.index;
          const target = normalizeHref(href);
          return epub.spine.items.findIndex((item) => {
            const candidate = normalizeHref(item.href);
            return candidate === target || candidate.endsWith(`/${target}`) || target.endsWith(`/${candidate}`);
          });
        };
        const flattenToc = (items: TocItem[], depth = 0): TocItem[] => items.flatMap((item) => [
          { ...item, index: spineIndexForHref(item.href), subitems: undefined, depth },
          ...flattenToc(item.subitems ?? [], depth + 1),
        ]);
        const navigationToc = flattenToc(epub.navigation.toc ?? []);
        const representedIndices = new Set(navigationToc.map((item) => item.index).filter((index): index is number => index !== undefined && index >= 0));
        const missingSpineItems = epub.spine.items
          .filter((item) => /\.(xhtml?|html?)$/i.test(item.href.split("#")[0]) && !representedIndices.has(item.index ?? -1))
          .map((item) => {
            const filename = decodeURIComponent(item.href.split("#")[0].split("/").pop() ?? item.href).replace(/\.(xhtml?|html?)$/i, "");
            const label = filename.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
            return { label, href: item.href, index: item.index, depth: 0 };
          });
        const orderedToc = [...navigationToc, ...missingSpineItems].sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
        setToc(orderedToc.filter((item, itemIndex, items) => items.findIndex((candidate) => candidate.index === item.index && candidate.label === item.label) === itemIndex));
        await renderSection(firstReadableIndexRef.current);
      } catch (loadError) {
        console.error("Unable to open EPUB", loadError);
        if (!cancelled) { setError(true); setStatus("This EPUB could not be opened."); }
      }
    };

    void loadBook();
    return () => { cancelled = true; renditionRef.current?.destroy(); renditionRef.current = null; bookRef.current = null; };
  }, [book, renderSection]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    lineHeightRef.current = lineHeight;
    fontFamilyRef.current = fontFamily;
    if (!renditionRef.current) return;
    if (fontFamily === "book") {
      void renderSection(currentIndexRef.current);
      return;
    }
    renditionRef.current.themes.override("font-size", `${fontSize}px`, true);
    renditionRef.current.themes.override("line-height", `${lineHeight}`, true);
    renditionRef.current.themes.override("font-family", fontStack(fontFamily), true);
  }, [fontFamily, fontSize, lineHeight, renderSection]);

  const openSection = (item: TocItem) => {
    if (item.index === undefined || item.index < 0) { setStatus(`Could not locate ${item.label}.`); return; }
    void renderSection(item.index, `Reading ${item.label}.`, item.href, item.label);
  };

  const move = (offset: number) => {
    const nextIndex = currentIndexRef.current + offset;
    if (nextIndex >= 0) void renderSection(nextIndex, offset > 0 ? "Moved forward." : "Moved back.");
  };

  return (
    <div className="flex h-screen min-h-0 max-w-full overflow-hidden bg-white">
      {sidebarOpen && <aside className="hidden h-full w-72 min-h-0 shrink-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4 lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Contents</p>
        <nav className="flex flex-col gap-1">{toc.filter((item) => item.index !== undefined && item.index >= 0).map((item) => <button key={`${item.href}-${item.label}`} onClick={() => openSection(item)} style={{ paddingLeft: `${12 + (item.depth ?? 0) * 16}px` }} className="rounded-md px-3 py-2 text-left text-sm leading-5 text-zinc-700 hover:bg-white hover:text-zinc-950">{item.label}</button>)}</nav>
        <div className="my-5 border-t border-zinc-200 pt-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Reading settings</p>
          <div className="flex flex-col gap-4 text-sm">
            <div><div className="mb-2 flex items-center justify-between"><label htmlFor="font-size">Font size</label><span className="text-xs text-zinc-500">{fontSize}px</span></div><input id="font-size" className="w-full accent-zinc-900" type="range" min="12" max="24" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></div>
            <label className="flex items-center justify-between gap-3">Font<select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"><option value="times">Times New Roman</option><option value="book">Book default</option><option value="inter">Inter</option><option value="roboto">Roboto</option><option value="noto-serif">Noto Serif</option></select></label>
            <label className="flex items-center justify-between gap-3">Line spacing<select value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"><option value="1.4">Compact</option><option value="1.6">Comfortable</option><option value="1.9">Relaxed</option></select></label>
          </div>
        </div>
      </aside>}
      <div className="relative flex h-full min-h-0 min-w-0 max-w-full flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-5 py-4">
          <div className="pointer-events-auto min-w-0 text-zinc-900 drop-shadow-sm"><h2 className="truncate font-semibold">{book.name.replace(/\.epub$/i, "")}</h2><p className={`mt-1 text-xs ${error ? "text-red-600" : "text-zinc-500"}`}>{status}</p></div>
          <div className="pointer-events-auto flex gap-2"><button onClick={() => setSidebarOpen((open) => !open)} className="rounded-md border border-zinc-300/80 bg-white/40 px-3 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/70">{sidebarOpen ? "Hide contents" : "Show contents"}</button><label className="cursor-pointer rounded-md border border-zinc-300/80 bg-white/40 px-3 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/70">Open another<input className="sr-only" type="file" accept=".epub,application/epub+zip" onChange={(event) => event.target.files && onFiles(event.target.files)} /></label><button onClick={() => move(-1)} className="rounded-md border border-zinc-300/80 bg-white/40 px-3 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/70">Previous</button><button onClick={() => move(1)} className="rounded-md border border-zinc-300/80 bg-white/40 px-3 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/70">Next</button></div>
        </div>
        <div ref={frameRef} className="epub-frame min-h-0 flex-1 overflow-hidden" />
      </div>
    </div>
  );
}
