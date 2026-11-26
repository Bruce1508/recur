import { Importer } from "./ui/Importer";
import { ThemeToggle } from "./ui/ThemeToggle";

export function App() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="flex justify-end print:hidden">
        <ThemeToggle />
      </div>
      <h1 className="font-display text-5xl font-black tracking-tight">
        <span className="bg-linear-135 from-blurple to-rose-deep bg-clip-text text-transparent">
          Recur
        </span>
      </h1>
      <p className="mt-3 max-w-xl text-lg">
        Add the PDF statements your bank lets you download, or its CSV exports.
        Nothing leaves your browser.
      </p>
      <Importer />
    </main>
  );
}
