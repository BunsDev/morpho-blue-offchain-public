import type { Route } from "./+types/vault";

export default function Component({ params }: Route.ComponentProps) {
  return (
    <div>
      {params.chain} {params.address}
    </div>
  );
}
