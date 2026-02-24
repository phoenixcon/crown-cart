import { DealsExplorer } from "@/components/DealsExplorer";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 py-16 text-zinc-900">
      <div className="mx-auto flex max-w-5xl justify-center px-6">
        <DealsExplorer />
      </div>
    </main>
  );
}
