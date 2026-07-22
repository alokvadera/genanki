import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    /* istanbul ignore next -- SSR / sandbox guard; jsdom test env always has window */
    (typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false)
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      React.startTransition(() => {
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
      })
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
