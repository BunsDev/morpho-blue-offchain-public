import { cn } from "@morpho-blue-offchain-public/uikit/lib/utils";

export function Header({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className="pointer-events-none fixed top-0 z-50 flex h-screen w-screen flex-col">
      <header className={cn("bg-secondary pointer-events-auto h-16", className)} {...props}>
        {children}
      </header>

      <aside className="flex shrink grow basis-auto flex-col">
        <div className="apply-rounding-blur -z-10 m-[-2px] mt-[-12px] flex grow">
          <svg className="hidden h-0 w-0">
            <defs>
              <filter id="rounding_blur">
                <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -14"
                  result="rounding_blur"
                />
                <feComposite in="SourceGraphic" in2="rounding_blur" operator="atop" />
              </filter>
            </defs>
          </svg>
          <div className="is-frame bg-secondary w-full"></div>
        </div>
        {/* <div className="mt-[-10px] h-[12px] bg-slate-100 dark:bg-slate-700"></div> */}
      </aside>
    </div>
  );
}
