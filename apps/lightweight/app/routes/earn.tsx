import type { Route } from "./+types/earn";

export default function Earn({ params }: Route.ComponentProps) {
  return <div>Earn on {params.chain}</div>;
}
