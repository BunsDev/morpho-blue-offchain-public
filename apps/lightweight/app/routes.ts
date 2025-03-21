import { type RouteConfig, prefix, route } from "@react-router/dev/routes";

export default [
  ...prefix(":chain", [
    route("earn", "routes/earn.tsx"),
    route("borrow", "routes/borrow.tsx"),
    route("market/:id", "routes/market.tsx"),
    route("vault/:address", "routes/vault.tsx"),
  ]),
] satisfies RouteConfig;
