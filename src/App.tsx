import { Importer } from "./ui/Importer";

export function App() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Recur</h1>
      <p className="mt-2">
        Add the PDF statements your bank lets you download, or its CSV exports.
        Nothing leaves your browser.
      </p>
      <Importer />
    </main>
  );
}
