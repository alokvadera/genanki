import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, BarChart3, Clock3, Layers, Search, X } from "lucide-react";
import { useNavigate, useParams, Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ArchivedRunViewer } from "@/components/ArchivedRunViewer";
import { useDeckStore } from "@/hooks/use-deck-store";
import { formatDistanceToNow } from "date-fns";

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

export default function History() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const deckStore = useDeckStore();
  const { activeDeckId, createDeckWithCards, addCards } = deckStore;
  const [now, setNow] = useState(() => Date.now());
  const [selectedLiveJobId, setSelectedLiveJobId] = useState<string | null>(null);
  const cancelGenerationJob = useMutation(api.generationJobs.cancel);
  const activeJobs = useQuery(api.generationJobs.listActive, { limit: 50 }) ?? [];
  const jobs = useQuery(api.generationJobs.listArchived, { limit: 100 }) ?? [];
  const firstJobId = jobs[0]?._id;

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeJobs.length]);

  useEffect(() => {
    if (!jobId && firstJobId) {
      navigate(`/runs/${firstJobId}`, { replace: true });
    }
  }, [firstJobId, jobId, navigate]);

  const selectedJob = jobs.find((job) => job._id === (jobId ?? jobs[0]?._id)) ?? null;
  const selectedLiveJob = activeJobs.find((job) => job._id === selectedLiveJobId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-[3px] border-black bg-white">
        <div className="w-full px-6 lg:px-10 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-3 h-9">
              <Link to="/app">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Clock3 className="w-6 h-6" />
                Runs
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Live generation monitoring and archived run intelligence.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9">
              <Link to="/usage">
                <BarChart3 className="w-4 h-4" />
                Usage
              </Link>
            </Button>
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9">
              <Link to="/app">
                <Layers className="w-4 h-4" />
                Deck creator
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 py-6">
        <section className="nb-border-2 bg-black text-white nb-shadow-amber p-4 sm:p-5 mb-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="border-2 border-white bg-primary p-2">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Run control center</p>
                <h2 className="text-lg font-bold tracking-tight mt-1">
                  {activeJobs.length > 0
                    ? `${activeJobs.length} run${activeJobs.length !== 1 ? "s" : ""} in progress`
                    : "No runs in progress"}
                </h2>
                <p className="text-xs text-white/70 font-medium mt-1">
                  This page updates live while providers, models, and document sections change.
                </p>
              </div>
            </div>
            <Link to="/app" className="nb-border bg-white text-black px-3 py-2 text-xs font-bold nb-hover-shadow">
              Start another run
            </Link>
          </div>
        </section>

        {activeJobs.length > 0 && (
          <section className="nb-border bg-white nb-shadow-rose p-4 sm:p-5 mb-6">
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Live now</p>
                <h2 className="text-lg font-bold tracking-tight">Active generation runs</h2>
              </div>
              <span className="text-xs text-muted-foreground font-medium">Updates automatically</span>
            </div>
            <div className="grid gap-3">
              {activeJobs.map((job) => {
                const progress = Math.max(0, Math.min(1, job.progress));
                const timeLeft = Math.max(0, Math.ceil((job.deadlineAt - now) / 1000));
                const statusLabel = job.status === "running" ? "Running" : "Queued";
                return (
                  <div key={job._id} className="nb-border-2 bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-blue-100 text-blue-800">
                            <Activity className="w-3 h-3" /> {statusLabel}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
                            {job.kind}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
                            {job.requestedCount} cards
                          </span>
                        </div>
                        <p className="text-sm font-bold tracking-tight break-words">{job.message}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-1 break-words">
                          {job.provider || "Selecting provider"} / {job.model || "Selecting model"}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium mt-2">
                          Section {Math.min(job.sectionIndex + 1, Math.max(1, job.totalSections))} / {Math.max(1, job.totalSections)}
                          {job.totalProviders > 0 ? ` · Provider ${Math.min(job.providerIndex + 1, job.totalProviders)} / ${job.totalProviders}` : ""}
                          {job.totalModels > 0 ? ` · Model ${Math.min(job.modelIndex + 1, job.totalModels)} / ${job.totalModels}` : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Progress</p>
                          <p className="text-xl font-bold mt-1">{Math.round(progress * 100)}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">ETA</p>
                          <p className="text-xl font-bold mt-1">{formatDuration(job.etaSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Time left</p>
                          <p className="text-xl font-bold mt-1">{formatDuration(timeLeft)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 bg-white overflow-hidden nb-border-2">
                        <motion.div
                          className="h-full bg-primary"
                          initial={false}
                          animate={{ width: `${Math.max(4, progress * 100)}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelGenerationJob({ jobId: job._id })}
                        className="inline-flex items-center gap-1 nb-border bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 nb-hover-shadow"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLiveJobId(job._id)}
                        className="nb-border bg-secondary px-3 py-1.5 text-xs font-bold nb-hover-shadow"
                      >
                        View available cards ({job.resultCards?.length ?? 0})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {selectedLiveJob && (
          <section className="mb-6">
            <ArchivedRunViewer
              job={selectedLiveJob}
              historyHref={`/runs/${selectedLiveJob._id}`}
              onClose={() => setSelectedLiveJobId(null)}
              closeLabel="Close live cards"
            />
          </section>
        )}

        <div className="nb-border bg-white nb-shadow-teal p-4 sm:p-5 mb-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Archived runs
              </p>
              <h2 className="text-lg font-bold tracking-tight">Completed, failed, and canceled runs</h2>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {jobs.length > 0
                ? `Showing ${jobs.length} archived run${jobs.length !== 1 ? "s" : ""}`
                : "No archived runs yet"}
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <aside className="nb-border bg-white nb-shadow-indigo p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Run list
                </p>
                <h3 className="text-base font-bold tracking-tight mt-1">Recent archives</h3>
              </div>
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="space-y-2 max-h-[780px] overflow-auto pr-1">
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">
                  Archived runs will appear here after generation completes.
                </p>
              ) : (
                jobs.map((job, index) => {
                  const isSelected = selectedJob?._id === job._id;
                  const tone =
                    job.status === "succeeded"
                      ? "bg-emerald-100 text-emerald-800"
                      : job.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-800";
                  return (
                    <motion.button
                      key={job._id}
                      type="button"
                      onClick={() => navigate(`/runs/${job._id}`)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`w-full text-left nb-border-2 p-3 transition-all nb-hover-shadow ${
                        isSelected ? "bg-secondary nb-shadow-sm" : "bg-muted/20 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 ${tone}`}>
                              {job.status}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
                              {job.kind}
                            </span>
                          </div>
                          <p className="text-sm font-bold tracking-tight truncate">
                            {job.resultDeckName || job.message}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {job.provider || "Provider pending"} / {job.model || "Model pending"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{job.resultCards?.length ?? 0}</p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            cards
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-medium">
                        <span>{formatTime(job.createdAt)}</span>
                        <span>{job.resultPartial ? "partial result" : "finalized"}</span>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedJob ? (
              <ArchivedRunViewer
                job={selectedJob}
                historyHref={`/runs/${selectedJob._id}`}
                onCreateDeck={() => {
                  const deckName =
                    selectedJob.resultDeckName?.trim() ||
                    selectedJob.message ||
                    "Archived Deck";
                  createDeckWithCards(deckName, selectedJob.resultCards ?? []);
                }}
                onAddToCurrent={() => {
                  addCards(activeDeckId, selectedJob.resultCards ?? []);
                }}
                onClose={() => navigate("/app")}
                closeLabel="Back to app"
                footer={
                  <div className="nb-border-2 bg-muted/20 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Run details
                    </p>
                    <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-5">
                      <div className="nb-border bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                        <p className="text-sm font-bold tracking-tight mt-1">{selectedJob.status}</p>
                      </div>
                      <div className="nb-border bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Progress</p>
                        <p className="text-sm font-bold tracking-tight mt-1">
                          {selectedJob.status === "succeeded" ? "100%" : `${Math.round((selectedJob.progress ?? 0) * 100)}%`}
                        </p>
                      </div>
                      <div className="nb-border bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">ETA</p>
                        <p className="text-sm font-bold tracking-tight mt-1">
                          {selectedJob.status === "succeeded" ? "0s" : formatDuration(selectedJob.etaSeconds ?? 0)}
                        </p>
                      </div>
                      <div className="nb-border bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Budget</p>
                        <p className="text-sm font-bold tracking-tight mt-1">
                          {formatTokens(selectedJob.timeoutSeconds)}
                          <span className="ml-1 text-xs font-medium text-muted-foreground">seconds</span>
                        </p>
                      </div>
                      <div className="nb-border bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Archived</p>
                        <p className="text-sm font-bold tracking-tight mt-1">{formatTime(selectedJob.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                }
              />
            ) : (
              <div className="nb-border bg-white nb-shadow-indigo p-6">
                <p className="text-sm font-bold">No archived run selected</p>
                <p className="mt-2 text-sm text-muted-foreground font-medium">
                  Finish a generation first, then come back here to inspect the archived run.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
