import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  ArrowLeft,
  Search,
  Lock,
  Globe,
  Ban,
  Settings,
  RefreshCw,
  Edit2,
  FileText,
  Cpu,
  Layers,
  Zap,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { Link, useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { Toaster, toast } from "sonner";
import { OptimusDashboard } from "@/components/OptimusDashboard";

const DEFAULT_DAILY_LIMIT = 50000;

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

export default function IpAdmin() {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secretKey, setSecretKey] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIp, setExpandedIp] = useState<string | null>(null);

  // Modal / Inline Edit States
  const [editingLimitIp, setEditingLimitIp] = useState<string | null>(null);
  const [customLimitVal, setCustomLimitVal] = useState("");
  const [editingNoteIp, setEditingNoteIp] = useState<string | null>(null);
  const [customNoteVal, setCustomNoteVal] = useState("");

  // Load auth state from session storage on mount
  useEffect(() => {
    const savedSecret = sessionStorage.getItem("admin_secret");
    const envSecret = import.meta.env.VITE_ADMIN_SECRET || "";
    if (savedSecret && savedSecret === envSecret) {
      setSecretKey(savedSecret);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const envSecret = import.meta.env.VITE_ADMIN_SECRET || "";
    if (passphrase === envSecret) {
      sessionStorage.setItem("admin_secret", passphrase);
      setSecretKey(passphrase);
      setIsAuthenticated(true);
      toast.success("Authenticated successfully");
    } else {
      toast.error("Incorrect administrator passphrase");
    }
  };

  // Queries (authenticated via secretKey parameter)
  const ips = useQuery(api.ipRateLimiter.adminListIps, isAuthenticated ? { adminSecret: secretKey } : "skip");
  const summary = useQuery(api.providerUsage.summary, { daysBack: 30 });

  // Mutations
  const setRule = useMutation(api.ipRateLimiter.adminSetRule);
  const resetIpTokens = useMutation(api.ipRateLimiter.adminResetIpTokens);

  const toggleBlock = async (ip: string, currentBlocked: boolean) => {
    try {
      const state = ips?.find((x: any) => x.ip === ip);
      await setRule({
        adminSecret: secretKey,
        ip,
        isBlocked: !currentBlocked,
        customDailyLimit: state?.customDailyLimit,
        note: state?.note,
      });
      toast.success(`${currentBlocked ? "Unblocked" : "Blocked"} IP address ${ip}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update IP block rule");
    }
  };

  const handleSaveLimit = async (ip: string) => {
    try {
      const limit = customLimitVal.trim() ? parseInt(customLimitVal, 10) : undefined;
      const state = ips?.find((x: any) => x.ip === ip);
      await setRule({
        adminSecret: secretKey,
        ip,
        isBlocked: state?.isBlocked ?? false,
        customDailyLimit: limit,
        note: state?.note,
      });
      setEditingLimitIp(null);
      toast.success(`Custom limit updated for ${ip}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update custom limit");
    }
  };

  const handleSaveNote = async (ip: string) => {
    try {
      const state = ips?.find((x: any) => x.ip === ip);
      await setRule({
        adminSecret: secretKey,
        ip,
        isBlocked: state?.isBlocked ?? false,
        customDailyLimit: state?.customDailyLimit,
        note: customNoteVal.trim() || undefined,
      });
      setEditingNoteIp(null);
      toast.success(`Internal note updated for ${ip}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update note");
    }
  };

  const handleResetTokens = async (ip: string) => {
    if (!window.confirm(`Are you sure you want to reset today's token usage for IP ${ip}?`)) return;
    try {
      await resetIpTokens({ adminSecret: secretKey, ip });
      toast.success(`Today's token usage reset to 0 for ${ip}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to reset tokens");
    }
  };

  const filteredIps = (ips ?? []).filter((item: any) =>
    item.ip.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalTokens = summary?.totalTokens ?? 0;
  const promptTokens = summary?.totalPromptTokens ?? 0;
  const completionTokens = summary?.totalCompletionTokens ?? 0;
  const requests = summary?.requests ?? 0;

  // Render Login Gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md nb-border bg-white nb-shadow-rose p-6 sm:p-8"
        >
          <div className="flex flex-col items-center text-center">
            <div className="nb-border bg-rose-50 p-4 mb-4">
              <Lock className="w-8 h-8 text-rose-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Protected Area</h1>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Please enter the administrator passphrase to access the configuration panel.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-2">
                Passphrase
              </label>
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="••••••••••••••••"
                className="nb-border-2"
                required
              />
            </div>
            <Button type="submit" className="w-full nb-border nb-shadow-sm font-bold uppercase tracking-wider h-10 mt-2">
              Unlock Dashboard
            </Button>
          </form>
        </motion.div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-[3px] border-black bg-white">
        <div className="w-full px-6 lg:px-10 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-3 h-9">
              <Link to="/app">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Globe className="w-6 h-6" />
                IP rate limits & admin console
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Monitor client activity, enforce token policies, and review system metrics.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 uppercase tracking-[0.1em] text-xs font-bold shrink-0">
            <span className="nb-border bg-emerald-50 text-emerald-800 px-2.5 py-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> IP limit active
            </span>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 py-6 space-y-6">
        {/* Whole Resource Usage Overview */}
        <section className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-1">
              System health and resources
            </p>
            <h2 className="text-lg font-bold tracking-tight">Whole resources usage (Last 30 Days)</h2>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu, shadow: "nb-shadow-indigo", tint: "bg-indigo-50", accent: "text-indigo-600" },
              { label: "Prompt tokens", value: formatTokens(promptTokens), icon: Layers, shadow: "nb-shadow-teal", tint: "bg-teal-50", accent: "text-teal-600" },
              { label: "Completion tokens", value: formatTokens(completionTokens), icon: Zap, shadow: "nb-shadow-rose", tint: "bg-rose-50", accent: "text-rose-600" },
              { label: "Requests", value: formatTokens(requests), icon: BarChart3, shadow: "nb-shadow-amber", tint: "bg-amber-50", accent: "text-amber-600" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`nb-border p-4 ${item.shadow} ${item.tint}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${item.accent}`}>
                        {item.label}
                      </p>
                      <p className="text-2xl font-bold tracking-tight mt-1">{item.value}</p>
                    </div>
                    <div className="nb-border bg-white p-3">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </section>

        {/* IP Search and Control list */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 mb-1">
                Client directory
              </p>
              <h2 className="text-lg font-bold tracking-tight">IP budget control panel</h2>
            </div>
            
            <div className="relative w-full sm:max-w-xs shrink-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search IP address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 nb-border-2"
              />
            </div>
          </div>

          <div className="nb-border bg-white nb-shadow-indigo overflow-hidden">
            {ips === undefined ? (
              <div className="p-8 text-center text-muted-foreground font-semibold flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading client database...
              </div>
            ) : filteredIps.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-semibold">
                No IP address records found matching your query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black bg-muted/20 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="p-4">IP Address</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Today's tokens</th>
                      <th className="p-4">Limit</th>
                      <th className="p-4">Requests</th>
                      <th className="p-4">Last seen</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIps.map((item: any) => {
                      const limit = item.customDailyLimit ?? DEFAULT_DAILY_LIMIT;
                      const percent = Math.min(100, Math.max(0, (item.dayTokensUsed / limit) * 100));
                      const isExpanded = expandedIp === item.ip;
                      const statusTone = item.isBlocked
                        ? "bg-red-100 text-red-800"
                        : percent >= 80
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800";
                      
                      const statusLabel = item.isBlocked
                        ? "Blocked"
                        : percent >= 80
                          ? "Near Limit"
                          : "Active";

                      return (
                        <tr key={item.ip} className="border-b border-border hover:bg-muted/5">
                          <td className="p-4 font-mono font-bold text-sm">
                            <button
                              onClick={() => setExpandedIp(isExpanded ? null : item.ip)}
                              className="inline-flex items-center gap-2 hover:underline text-left text-primary"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                              {item.ip}
                            </button>
                            {item.note && (
                              <p className="text-[10px] text-muted-foreground font-sans font-medium mt-1 max-w-[200px] truncate">
                                Note: {item.note}
                              </p>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-1 ${statusTone}`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="p-4 min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono">
                                {formatTokens(item.dayTokensUsed)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">({Math.round(percent)}%)</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full bg-muted overflow-hidden nb-border">
                              <div
                                className={`h-full ${percent >= 80 ? "bg-amber-500" : "bg-primary"}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </td>
                          <td className="p-4 font-mono text-xs font-semibold">
                            {formatTokens(limit)}
                          </td>
                          <td className="p-4 text-xs font-semibold">{item.totalRequests}</td>
                          <td className="p-4 text-xs font-medium text-muted-foreground">
                            {formatTime(item.lastSeenAt)}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Set Notes */}
                              {editingNoteIp === item.ip ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <Input
                                    value={customNoteVal}
                                    onChange={(e) => setCustomNoteVal(e.target.value)}
                                    placeholder="Add notes..."
                                    className="h-8 py-1 text-xs w-[140px] nb-border-2"
                                  />
                                  <Button size="sm" onClick={() => handleSaveNote(item.ip)} className="h-8 px-2">
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingNoteIp(null)} className="h-8 px-2">
                                    X
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingNoteIp(item.ip);
                                    setCustomNoteVal(item.note || "");
                                  }}
                                  className="h-8 px-2 nb-border nb-shadow-sm"
                                  title="Add internal notes"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {/* Edit limits */}
                              {editingLimitIp === item.ip ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    value={customLimitVal}
                                    onChange={(e) => setCustomLimitVal(e.target.value)}
                                    placeholder="Daily limit..."
                                    className="h-8 py-1 text-xs w-[100px] nb-border-2"
                                  />
                                  <Button size="sm" onClick={() => handleSaveLimit(item.ip)} className="h-8 px-2">
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingLimitIp(null)} className="h-8 px-2">
                                    X
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingLimitIp(item.ip);
                                    setCustomLimitVal(item.customDailyLimit?.toString() ?? "");
                                  }}
                                  className="h-8 px-2 nb-border nb-shadow-sm"
                                  title="Set Custom limit"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {/* Clear / Reset today's usage */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResetTokens(item.ip)}
                                className="h-8 px-2 nb-border nb-shadow-sm text-amber-700 hover:text-amber-800"
                                title="Reset daily usage to 0"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>

                              {/* Block/Unblock toggle */}
                              <button
                                onClick={() => toggleBlock(item.ip, item.isBlocked)}
                                className={`nb-border font-bold text-xs px-2.5 py-1.5 transition-all nb-hover-shadow ${
                                  item.isBlocked
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-950"
                                    : "bg-red-50 text-red-700 border-red-950"
                                }`}
                              >
                                {item.isBlocked ? "Unblock" : "Block"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Collapsible details showing provider/model usage for selected IP */}
        {expandedIp && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="nb-border bg-white nb-shadow-amber p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
                  Detailed analytics
                </p>
                <h3 className="text-base font-bold tracking-tight mt-1">
                  IP Usage Breakdown: <span className="font-mono text-primary">{expandedIp}</span>
                </h3>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExpandedIp(null)} className="nb-border h-8">
                Close details
              </Button>
            </div>

            {(() => {
              const item = ips?.find((x: any) => x.ip === expandedIp);
              if (!item) return <p className="text-sm font-medium">Record not loaded.</p>;

              return (
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Providers Used */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-500" />
                      Providers Called
                    </h4>
                    <div className="space-y-2">
                      {item.providersUsed.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No provider queries recorded.</p>
                      ) : (
                        item.providersUsed.map((p: any) => (
                          <div key={p.label} className="nb-border-2 bg-muted/20 p-3 flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold">{p.label}</p>
                              <p className="text-[10px] text-muted-foreground">{p.requests} request(s)</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold font-mono">{formatTokens(p.tokens)}</p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">tokens</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Models Used */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-teal-500" />
                      Models Utilized
                    </h4>
                    <div className="space-y-2">
                      {item.modelsUsed.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No model queries recorded.</p>
                      ) : (
                        item.modelsUsed.map((m: any) => (
                          <div key={m.name} className="nb-border-2 bg-muted/20 p-3 flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold font-mono">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.requests} request(s)</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold font-mono">{formatTokens(m.tokens)}</p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">tokens</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.section>
        )}
      </main>
      <Toaster />
    </div>
  );
}
