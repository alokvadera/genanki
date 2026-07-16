import { Toaster } from "@/components/ui/sonner";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "katex/dist/katex.min.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));

// Lazy-load the dev toolbar — only imported when running on a *.vly.sh preview
const VlyToolbar = lazy(() => import("../vly-toolbar-readonly.tsx"));
const AnkiCreator = lazy(() => import("./pages/AnkiCreator.tsx"));
const History = lazy(() => import("./pages/History.tsx"));
const ProviderUsage = lazy(() => import("./pages/ProviderUsage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="nb-border nb-shadow-sm bg-white p-6 font-bold text-sm animate-pulse">
        Loading...
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="nb-border nb-shadow bg-white max-w-lg text-center p-8">
            <p className="text-sm font-bold">Preview runtime error</p>
            <p className="mt-3 text-xs text-muted-foreground break-words font-medium">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-4 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto nb-border-2 p-3">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);


function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      {import.meta.env.DEV && window.location.hostname.endsWith(".vly.sh") && (
        <Suspense fallback={null}>
          <ToolbarErrorBoundary>
            <VlyToolbar />
          </ToolbarErrorBoundary>
        </Suspense>
      )}
      <ConvexProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<AnkiCreator />} />
              <Route path="/runs" element={<History />} />
              <Route path="/runs/:jobId" element={<History />} />
              <Route path="/history" element={<History />} />
              <Route path="/history/:jobId" element={<History />} />
              <Route path="/usage" element={<ProviderUsage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ConvexProvider>
      <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
