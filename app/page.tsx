import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Allo Reservation Service</h1>
        <p className="text-muted-foreground">
          Scaffold is live. Products and checkout pages land in the next commits.
        </p>
      </header>

      <section className="flex gap-3">
        <Button disabled>Browse products</Button>
        <Button variant="outline" disabled>
          My reservation
        </Button>
      </section>
    </main>
  );
}
