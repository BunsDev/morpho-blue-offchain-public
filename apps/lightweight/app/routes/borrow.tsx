import type { Route } from "./+types/borrow";

export default function Borrow({ params }: Route.ComponentProps) {
  return <div>Borrow on {params.chain}</div>;
}
