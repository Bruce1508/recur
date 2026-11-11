import { Importer } from "./ui/Importer";

export function App() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Recur</h1>
      <p className="mt-2">
        Add the transaction CSV files your bank lets you download. Nothing
        leaves your browser.
      </p>
      <Importer />
    </main>
  );
}
