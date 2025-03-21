import type { Route } from "./+types/market";

export default function Component({ params }: Route.ComponentProps) {
  return (
    <div>
      {params.chain} {params.id}
    </div>
  );
}
