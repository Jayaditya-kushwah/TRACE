import React, { useState, useEffect, useRef } from "react";
import {
  Folder,
  Plus,
  Shield,
  ShieldCheck,
  Upload,
  ArrowRightLeft,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  Film,
  FileCode,
  File,
  AlertTriangle,
  Download,
  RefreshCw,
  Clock,
  Sparkles,
  Lock,
  Search,
  User,
  Settings,
  Globe,
  X,
  Languages
} from "lucide-react";
import { translations, formatBytes, formatDate } from "./i18n/translations";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "";

interface Case {
  id: string;
  reference_id: string;
  title: string;
  description: string;
  created_by: string;
  created_at: string;
}

interface Evidence {
  id: string;
  case_id: string;
  original_filename: string;
  stored_filename: string;
  file_size_bytes: string;
  mime_type: string;
  sha256_hash: string;
  uploaded_by: string;
  uploaded_at: string;
  status?: "VERIFIED" | "TAMPERED" | "MISSING";
  recalculated_hash?: string | null;
  processing_status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
}

interface CustodyLog {
  id: string;
  case_id: string;
  evidence_id: string | null;
  action_type: string;
  actor: string;
  details: string | null;
  prev_log_hash: string;
  log_hash: string;
  created_at: string;
}

interface CaseDetails extends Case {
  evidence: Evidence[];
  logs: CustodyLog[];
}

interface CaseVerificationResult {
  chain_integrity: boolean;
  chain_error_at?: string;
  evidence_status: Array<{
    id: string;
    original_filename: string;
    sha255_hash?: string;
    file_exists: boolean;
    recalculated_hash: string | null;
    status: "VERIFIED" | "TAMPERED" | "MISSING";
  }>;
}

interface CaseAIInsights {
  summary: { executive_summary: string; key_events: any[]; important_entities: any[] } | null;
  entities: Array<{ id: string; entity_type: string; entity_value: string; evidence_id: string | null; original_filename: string | null }>;
  timeline: Array<{ id: string; description: string; event_timestamp: string; confidence: string; supporting_evidence_ids: string[] }>;
}

export default function App() {
  // Localization & Translations
  const [lang, setLang] = useState<string>(() => localStorage.getItem("trace_lang") || "en");
  
  // AI Settings (BYOK & Local Ollama)
  const [aiProvider, setAiProvider] = useState<string>(() => localStorage.getItem("trace_ai_provider") || "gemini");
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem("trace_gemini_key") || "");
  const [ollamaHost, setOllamaHost] = useState<string>(() => localStorage.getItem("trace_ollama_host") || "http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState<string>(() => localStorage.getItem("trace_ollama_model") || "llama3");
  const [ollamaEmbedModel, setOllamaEmbedModel] = useState<string>(() => localStorage.getItem("trace_ollama_embed_model") || "nomic-embed-text");
  
  // UI Panels
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSavedAlert, setShowSavedAlert] = useState(false);

  // Application State
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  
  // Modals & UI Controls
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetEvidence, setTransferTargetEvidence] = useState<Evidence | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "timeline" | "ai_hub">("catalog");
  const [showSimulationPanel, setShowSimulationPanel] = useState(false);

  // AI Insights State
  const [aiInsights, setAiInsights] = useState<CaseAIInsights>({ summary: null, entities: [], timeline: [] });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string | null>(null);

  // Form States
  const [investigatorName, setInvestigatorName] = useState("Investigator Alpha");
  const [createForm, setCreateForm] = useState({
    reference_id: "",
    title: "",
    description: "",
    created_by: "Investigator Alpha"
  });
  const [transferForm, setTransferForm] = useState({
    actor: "Investigator Alpha",
    recipient: "",
    reason: ""
  });

  // Verification results state
  const [auditResult, setAuditResult] = useState<CaseVerificationResult | null>(null);
  const [hasAudited, setHasAudited] = useState(false);

  // Drag and Drop file uploading
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Translation Helper
  const t = (key: string) => {
    return translations[lang]?.[key] || translations["en"]?.[key] || key;
  };

  // Generate headers representing current AI provider configuration
  const getAIHeaders = () => {
    return {
      "x-ai-provider": aiProvider,
      "x-ai-key": geminiApiKey,
      "x-ai-endpoint": ollamaHost,
      "x-ai-model": ollamaModel,
      "x-ai-embed-model": ollamaEmbedModel
    };
  };

  // Fetch all cases on mount
  useEffect(() => {
    fetchCases();
  }, []);

  // Fetch case details when selectedCaseId changes
  useEffect(() => {
    if (selectedCaseId) {
      fetchCaseDetails(selectedCaseId);
      fetchAiInsights(selectedCaseId);
      setAuditResult(null);
      setHasAudited(false);
      setSearchResults(null);
      setSemanticQuery("");
      setSelectedEntityFilter(null);
    } else {
      setCaseDetails(null);
      setAiInsights({ summary: null, entities: [], timeline: [] });
    }
  }, [selectedCaseId]);

  const saveConfiguration = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("trace_lang", lang);
    localStorage.setItem("trace_ai_provider", aiProvider);
    localStorage.setItem("trace_gemini_key", geminiApiKey);
    localStorage.setItem("trace_ollama_host", ollamaHost);
    localStorage.setItem("trace_ollama_model", ollamaModel);
    localStorage.setItem("trace_ollama_embed_model", ollamaEmbedModel);
    
    setShowSavedAlert(true);
    setTimeout(() => setShowSavedAlert(false), 3000);
    setIsSettingsOpen(false);
    
    // Refresh case insights if any case is selected
    if (selectedCaseId) {
      fetchAiInsights(selectedCaseId);
    }
  };

  const fetchAiInsights = async (caseId: string) => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}/ai-insights`);
      const json = await res.json();
      if (json.success) {
        setAiInsights(json.data);
      }
    } catch (err) {
      console.error("Error fetching AI insights:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateTimeline = async () => {
    if (!selectedCaseId) return;
    setIsAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${selectedCaseId}/ai-timeline`, {
        method: "POST",
        headers: getAIHeaders()
      });
      const json = await res.json();
      if (json.success) {
        await fetchAiInsights(selectedCaseId);
        alert(lang === "hi" ? "समयरेखा सफलतापूर्वक तैयार की गई!" : lang === "te" ? "కాలక్రమం విజయవంతంగా నిర్మించబడింది!" : "AI Forensic Timeline generated successfully!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedCaseId) return;
    setIsAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${selectedCaseId}/ai-summarize`, {
        method: "POST",
        headers: getAIHeaders()
      });
      const json = await res.json();
      if (json.success) {
        await fetchAiInsights(selectedCaseId);
        alert(lang === "hi" ? "मामला सारांश सफलतापूर्वक तैयार किया गया!" : lang === "te" ? "కేసు సారాంశం విజయవంతంగా నిర్మించబడింది!" : "AI Case Summary generated successfully!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId || !semanticQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${selectedCaseId}/ai-search?q=${encodeURIComponent(semanticQuery)}`, {
        headers: getAIHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setSearchResults(json.data);
      }
    } catch (err: any) {
      console.error(err);
      alert("Search Error: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchCases = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cases`);
      const json = await res.json();
      if (json.success) {
        setCases(json.data);
      }
    } catch (err) {
      console.error("Error fetching cases:", err);
    }
  };

  const fetchCaseDetails = async (caseId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}`);
      const json = await res.json();
      if (json.success) {
        setCaseDetails(json.data);
      }
    } catch (err) {
      console.error("Error fetching case details:", err);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          created_by: investigatorName
        })
      });
      const json = await res.json();
      if (json.success) {
        setCreateForm({ reference_id: "", title: "", description: "", created_by: investigatorName });
        setIsCreateModalOpen(false);
        fetchCases();
        setSelectedCaseId(json.data.id);
      } else {
        alert(json.error || "Failed to create case");
      }
    } catch (err) {
      console.error("Error creating case:", err);
      alert("Server error when creating case");
    }
  };

  const handleTransferCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetEvidence) return;
    try {
      const res = await fetch(`${API_BASE}/api/evidence/${transferTargetEvidence.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: investigatorName,
          recipient: transferForm.recipient,
          reason: transferForm.reason
        })
      });
      const json = await res.json();
      if (json.success) {
        setTransferForm({ actor: investigatorName, recipient: "", reason: "" });
        setIsTransferModalOpen(false);
        setTransferTargetEvidence(null);
        if (selectedCaseId) {
          await fetchCaseDetails(selectedCaseId);
          if (hasAudited) {
            handleAuditCase();
          }
        }
      } else {
        alert(json.error || "Failed to transfer custody");
      }
    } catch (err) {
      console.error("Error transferring custody:", err);
    }
  };

  const handleAuditCase = async () => {
    if (!selectedCaseId) return;
    setIsAuditLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${selectedCaseId}/verify`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setAuditResult(json.data);
        setHasAudited(true);
        await fetchCaseDetails(selectedCaseId);
      }
    } catch (err) {
      console.error("Error auditing case:", err);
    } finally {
      setIsAuditLoading(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!selectedCaseId) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploaded_by", investigatorName);

    try {
      const res = await fetch(`${API_BASE}/api/cases/${selectedCaseId}/evidence`, {
        method: "POST",
        headers: getAIHeaders(),
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        await fetchCaseDetails(selectedCaseId);
        if (hasAudited) {
          handleAuditCase();
        }
      } else {
        alert(json.error || "Failed to upload file");
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      alert("Error uploading file to server");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const simulateFileTampering = async (evidenceId: string) => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId, evidence_id: evidenceId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Success: File content corrupted on server disk!");
        setHasAudited(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const simulateDbHashTampering = async (evidenceId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-db-hash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_id: evidenceId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Success: Evidence hash modified in database record!");
        setHasAudited(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const simulateLogChainTampering = async (logId: string) => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-log-chain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId, log_id: logId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Success: Historical log entry details altered!");
        setHasAudited(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const restoreCaseIntegrity = async () => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Success: Backups restored, database hashes reset, and log chain recalculated!");
        await fetchCaseDetails(selectedCaseId);
        setAuditResult(null);
        setHasAudited(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeedDemoCase = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/simulate/seed-demo`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        await fetchCases();
        setSelectedCaseId(json.case_id);
        alert("Demo Case (Operation Phantom Exfil) seeded successfully!");
      } else {
        alert("Failed to seed demo case");
      }
    } catch (err) {
      console.error(err);
      alert("Error seeding demo case");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const getMimeIcon = (mime: string) => {
    if (mime.startsWith("image/")) return <ImageIcon className="w-8 h-8 text-indigo-400" />;
    if (mime.startsWith("video/")) return <Film className="w-8 h-8 text-amber-400" />;
    if (mime.startsWith("text/plain") || mime.includes("pdf")) return <FileText className="w-8 h-8 text-emerald-400" />;
    if (mime.includes("javascript") || mime.includes("json") || mime.includes("typescript"))
      return <FileCode className="w-8 h-8 text-pink-400" />;
    return <File className="w-8 h-8 text-slate-400" />;
  };

  const getActionStyles = (action: string) => {
    switch (action) {
      case "CASE_CREATED":
        return {
          icon: <Plus className="w-4 h-4 text-sky-400" />,
          bgColor: "bg-sky-500/10 border-sky-500/35",
          textColor: "text-sky-400"
        };
      case "EVIDENCE_UPLOADED":
        return {
          icon: <Upload className="w-4 h-4 text-emerald-400" />,
          bgColor: "bg-emerald-500/10 border-emerald-500/35",
          textColor: "text-emerald-400"
        };
      case "CUSTODY_TRANSFERRED":
        return {
          icon: <ArrowRightLeft className="w-4 h-4 text-amber-400" />,
          bgColor: "bg-amber-500/10 border-amber-500/35",
          textColor: "text-amber-400"
        };
      case "INTEGRITY_VERIFIED":
        return {
          icon: <ShieldCheck className="w-4 h-4 text-teal-400" />,
          bgColor: "bg-teal-500/10 border-teal-500/35",
          textColor: "text-teal-400"
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-slate-400" />,
          bgColor: "bg-slate-500/10 border-slate-500/35",
          textColor: "text-slate-400"
        };
    }
  };

  const filteredCases = cases.filter(
    (c) =>
      c.title.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      c.reference_id.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const decoratedEvidence = caseDetails?.evidence.map((ev) => {
    if (hasAudited && auditResult) {
      const match = auditResult.evidence_status.find((s) => s.id === ev.id);
      return match ? { ...ev, status: match.status, recalculated_hash: match.recalculated_hash } : ev;
    }
    return ev;
  }) || [];

  return (
    <div className="flex h-screen bg-[#02050f] text-slate-100 font-sans overflow-hidden relative selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* yutaabe-inspired grid overlay background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c1328_1px,transparent_1px),linear-gradient(to_bottom,#0c1328_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"></div>

      {/* 1. SIDEBAR */}
      <aside className="w-80 border-r border-[#0d162f] bg-[#03081a]/90 backdrop-blur flex flex-col z-20 relative">
        <div className="p-6 border-b border-[#0d162f] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/25 shadow-[0_0_10px_rgba(16,185,129,0.08)]">
              <Shield className="w-6 h-6 text-emerald-450" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">{t("app_title")}</h1>
              <p className="text-[9px] text-slate-550 uppercase tracking-widest font-bold font-mono">{t("forensic_custody_engine")}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-[#0d162f] bg-[#070e28]/40">
          <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1.5">
            {t("current_investigator")}
          </label>
          <div className="flex items-center space-x-2 bg-[#020512] px-3.5 py-2 rounded-xl border border-[#0c142c] focus-within:border-emerald-500/50 transition-all">
            <User className="w-3.5 h-3.5 text-emerald-450" />
            <input
              type="text"
              value={investigatorName}
              onChange={(e) => setInvestigatorName(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none w-full font-semibold"
            />
          </div>
        </div>

        <div className="p-4 border-b border-[#0d162f]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={t("search_cases")}
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-[#020512] border border-[#0d162f] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/70 placeholder:text-slate-650"
            />
          </div>
        </div>

        {/* Case List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {filteredCases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all relative group overflow-hidden ${
                selectedCaseId === c.id
                  ? "bg-[#0b132c]/75 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.06)]"
                  : "bg-transparent border-[#0c142c] hover:bg-[#070e28]/40 hover:border-[#0e1735]"
              }`}
            >
              {selectedCaseId === c.id && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500"></div>
              )}
              <div className="flex justify-between items-start mb-1.5">
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  {c.reference_id}
                </span>
                <span className="text-[9px] text-slate-500 font-bold font-mono">
                  {formatDate(c.created_at, lang).split(",")[0]}
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-200 group-hover:text-white truncate">{c.title}</h3>
              <p className="text-[10px] text-slate-500 truncate mt-1 leading-relaxed">{c.description || "No description"}</p>
            </button>
          ))}
          {filteredCases.length === 0 && (
            <div className="text-center py-12">
              <Folder className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
              <p className="text-xs text-slate-500 font-semibold">{t("no_cases_found")}</p>
            </div>
          )}
        </div>

        {/* Settings and Actions */}
        <div className="p-4 border-t border-[#0d162f] bg-[#020512]/60 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex-1 bg-[#060c20] hover:bg-[#0c132f] border border-[#0e1735] hover:border-slate-700 text-slate-300 font-semibold py-2 px-3 rounded-xl flex items-center justify-center space-x-1.5 text-[11px] cursor-pointer"
              title="Configure Language and AI Providers"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("settings_title")}</span>
            </button>
            <button
              onClick={handleSeedDemoCase}
              className="bg-[#060c20] hover:bg-[#0c132f] border border-[#0e1735] hover:border-emerald-600/30 text-emerald-400 font-semibold p-2 rounded-xl flex items-center justify-center cursor-pointer"
              title={t("seed_demo_case")}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 text-xs shadow-lg shadow-indigo-600/15 cursor-pointer border border-indigo-500/30"
          >
            <Plus className="w-4 h-4" />
            <span>{t("create_case_file")}</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col bg-[#02040b]/90 backdrop-blur z-10 overflow-hidden relative">
        {caseDetails ? (
          <>
            {/* Case Workspace Header */}
            <header className="p-6 border-b border-[#0d162f] bg-[#03081a]/50 backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-3 mb-1.5">
                  <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/25 font-bold tracking-wider">
                    {caseDetails.reference_id}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center font-semibold">
                    <Clock className="w-3 h-3 mr-1.5 text-slate-500" />
                    {t("opened_at")} {formatDate(caseDetails.created_at, lang)}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">{caseDetails.title}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowSimulationPanel(!showSimulationPanel)}
                  className={`px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center space-x-1.5 border transition-all ${
                    showSimulationPanel
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : "bg-[#060c20] border-[#0e1735] text-slate-400 hover:text-slate-200 hover:bg-[#0c132f]"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{t("tamper_simulation")}</span>
                </button>

                <button
                  onClick={handleAuditCase}
                  disabled={isAuditLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-[#02050f] px-3.5 py-2 rounded-xl text-[10px] font-black flex items-center space-x-1.5 shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? "animate-spin" : ""}`} />
                  <span>{isAuditLoading ? t("verifying") : t("audit_case_integrity")}</span>
                </button>

                <a
                  href={`${API_BASE}/api/cases/${caseDetails.id}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#060c20] border border-[#0e1735] hover:bg-[#0c132f] text-slate-300 px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center space-x-1.5"
                >
                  <FileText className="w-3 h-3 text-indigo-400" />
                  <span>{t("export_report")}</span>
                </a>

                <a
                  href={`${API_BASE}/api/cases/${caseDetails.id}/bundle`}
                  className="bg-indigo-600 hover:bg-indigo-750 border border-indigo-500/35 text-white px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center space-x-1.5 shadow-lg shadow-indigo-600/10"
                >
                  <Download className="w-3 h-3" />
                  <span>{t("download_archive")}</span>
                </a>
              </div>
            </header>

            {/* Verification Result Banner */}
            {hasAudited && auditResult && (
              <div
                className={`px-6 py-4 flex items-center justify-between border-b transition-all ${
                  auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED")
                    ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-450 glow-emerald"
                    : "bg-rose-950/20 border-rose-900/35 text-rose-400 glow-rose"
                }`}
              >
                <div className="flex items-center space-x-3.5">
                  {auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED") ? (
                    <>
                      <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider">{t("verification_passed_title")}</h4>
                        <p className="text-[11px] text-emerald-500/90 mt-0.5 font-medium leading-relaxed">
                          {t("verification_passed_desc")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-455 animate-pulse flex-shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider">{t("verification_failed_title")}</h4>
                        <p className="text-[11px] text-rose-500/90 mt-0.5 font-medium leading-relaxed">
                          {t("verification_failed_desc")}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="text-[9px] font-black uppercase tracking-widest bg-[#02050f]/80 border border-slate-800/80 px-3 py-1.5 rounded-lg">
                  {auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED")
                    ? t("verified_secure")
                    : t("tamper_detected")}
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="px-6 border-b border-[#0d162f] bg-[#03081a]/20 flex justify-between items-center z-10">
              <div className="flex space-x-6">
                <button
                  onClick={() => setActiveTab("catalog")}
                  className={`py-3 text-xs font-bold border-b-2 tracking-wider uppercase transition-all ${
                    activeTab === "catalog"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t("evidence_catalog")} ({decoratedEvidence.length})
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`py-3 text-xs font-bold border-b-2 tracking-wider uppercase transition-all ${
                    activeTab === "timeline"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t("audit_timeline")} ({caseDetails.logs.length})
                </button>
                <button
                  onClick={() => setActiveTab("ai_hub")}
                  className={`py-3 text-xs font-bold border-b-2 tracking-wider uppercase transition-all flex items-center space-x-1.5 ${
                    activeTab === "ai_hub"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  <span>{t("ai_insights_tab")}</span>
                </button>
              </div>

              {showSimulationPanel && (
                <div className="flex items-center space-x-2 py-2">
                  <span className="text-[9px] uppercase tracking-widest font-black text-rose-455">{t("simulation_enabled")}</span>
                  <button
                    onClick={restoreCaseIntegrity}
                    className="text-[10px] bg-[#060c20] border border-[#0d162f] hover:border-emerald-500/30 hover:bg-[#0c132f] text-slate-200 px-3 py-1 rounded-lg flex items-center space-x-1 font-bold transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-450" />
                    <span>{t("restore_originals")}</span>
                  </button>
                </div>
              )}
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                
                {/* 1. EVIDENCE CATALOG TAB */}
                {activeTab === "catalog" ? (
                  <div className="space-y-6">
                    {/* Abstract Card */}
                    <div className="bg-[#04091e]/50 p-5 rounded-2xl border border-[#0d162f] relative overflow-hidden glass">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none"></div>
                      <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2.5">
                        {t("investigative_abstract")}
                      </h3>
                      <p className="text-xs text-slate-350 leading-relaxed font-semibold">
                        {caseDetails.description || "No summary provided for this investigation case file."}
                      </p>
                      <div className="grid grid-cols-2 gap-4 mt-4 border-t border-[#0c142c] pt-4 font-mono text-[10px] text-slate-500">
                        <div>
                          <span className="block text-slate-600 font-bold">{t("created_by")}</span>
                          <span className="text-slate-400 font-bold">{caseDetails.created_by}</span>
                        </div>
                        <div>
                          <span className="block text-slate-600 font-bold">{t("case_ref_code")}</span>
                          <span className="text-emerald-400 font-bold">{caseDetails.reference_id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Drag and Drop Zone */}
                    <div
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                        dragActive
                          ? "border-indigo-500 bg-indigo-500/5 scale-[0.99]"
                          : "border-[#0d162f] hover:border-slate-800 bg-[#030717]/30"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-3 animate-bounce" />
                      <h4 className="text-xs font-bold text-slate-200">
                        {t("drag_drop_zone")}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1 mb-4 font-semibold leading-relaxed max-w-md mx-auto">
                        {t("drag_drop_sub")}
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="bg-[#060c20] border border-[#0d162f] hover:bg-[#0c132f] text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        {isUploading ? t("uploading") : t("select_file")}
                      </button>
                    </div>

                    {/* Evidence List */}
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                        {t("secure_evidence_records")} ({decoratedEvidence.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {decoratedEvidence.map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-5 rounded-2xl border bg-[#03081a]/40 relative overflow-hidden transition-all hover:-translate-y-0.5 ${
                              ev.status === "VERIFIED"
                                ? "border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.04)] glow-emerald"
                                : ev.status === "TAMPERED"
                                ? "border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.04)] glow-rose"
                                : ev.status === "MISSING"
                                ? "border-amber-500/25"
                                : "border-[#0c142c]"
                            }`}
                          >
                            <div className="flex items-start space-x-4">
                              <div className="p-3 bg-[#020512] rounded-xl border border-[#0d162f]">
                                {getMimeIcon(ev.mime_type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-slate-200 truncate pr-16" title={ev.original_filename}>
                                  {ev.original_filename}
                                </h4>
                                <div className="flex items-center space-x-3 text-[10px] text-slate-500 mt-1 font-semibold">
                                  <span>{formatBytes(ev.file_size_bytes, lang)}</span>
                                  <span>•</span>
                                  <span className="uppercase">{ev.mime_type.split("/")[1] || ev.mime_type}</span>
                                </div>
                                
                                {/* Background Processing Status */}
                                {ev.processing_status && ev.processing_status !== "COMPLETED" && (
                                  <div className="mt-2 flex items-center space-x-1.5 text-[9px] font-bold uppercase tracking-widest font-mono">
                                    <span className="relative flex h-2 w-2">
                                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                        ev.processing_status === "PROCESSING" ? "bg-indigo-400" : ev.processing_status === "FAILED" ? "bg-rose-400" : "bg-slate-400"
                                      }`}></span>
                                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                        ev.processing_status === "PROCESSING" ? "bg-indigo-500" : ev.processing_status === "FAILED" ? "bg-rose-500" : "bg-slate-500"
                                      }`}></span>
                                    </span>
                                    <span className={ev.processing_status === "PROCESSING" ? "text-indigo-400" : ev.processing_status === "FAILED" ? "text-rose-455" : "text-slate-550"}>
                                      {t("running_status")}: {ev.processing_status}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {ev.status && (
                                <div className="absolute top-4 right-4">
                                  <span
                                    className={`text-[8px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full border ${
                                      ev.status === "VERIFIED"
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                        : ev.status === "TAMPERED"
                                        ? "bg-rose-500/10 border-rose-500/25 text-rose-400"
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-450"
                                    }`}
                                  >
                                    {ev.status}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 p-2 bg-[#020512]/90 border border-[#0d162f] rounded-xl flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-[8px] font-bold text-slate-550 uppercase block tracking-wider font-mono">
                                  {t("sha256_hash")}
                                </span>
                                <span className="font-mono text-[9px] text-slate-400 truncate block">
                                  {ev.sha256_hash}
                                </span>
                              </div>
                              <button
                                onClick={() => copyToClipboard(ev.sha256_hash)}
                                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-[#070d22] ml-2 flex-shrink-0 transition-all cursor-pointer"
                                title="Copy full SHA-256 hash"
                              >
                                {copiedHash === ev.sha256_hash ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-450" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {ev.status === "TAMPERED" && ev.recalculated_hash && (
                              <div className="mt-2.5 p-2 bg-rose-950/10 border border-rose-950/20 rounded-xl">
                                <span className="text-[8px] font-black text-rose-455 uppercase block tracking-wider font-mono">
                                  {t("recalculated_hash")}
                                </span>
                                <span className="font-mono text-[9px] text-rose-500 truncate block">
                                  {ev.recalculated_hash}
                                </span>
                              </div>
                            )}

                            <div className="mt-4 flex items-center justify-between border-t border-[#0c142c] pt-3 text-[10px] font-semibold text-slate-500">
                              <span>
                                {t("uploaded_by")}: <span className="text-slate-450">{ev.uploaded_by}</span>
                              </span>
                              <button
                                onClick={() => {
                                  setTransferTargetEvidence(ev);
                                  setIsTransferModalOpen(true);
                                }}
                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-350 flex items-center space-x-1.5 transition-all cursor-pointer"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>{t("transfer_custody")}</span>
                              </button>
                            </div>

                            {showSimulationPanel && (
                              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-rose-950/20 pt-3">
                                <button
                                  onClick={() => simulateFileTampering(ev.id)}
                                  className="bg-rose-950/20 border border-rose-900/30 hover:bg-rose-950/40 text-rose-400 text-[9px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{t("tamper_disk_file")}</span>
                                </button>
                                <button
                                  onClick={() => simulateDbHashTampering(ev.id)}
                                  className="bg-rose-950/20 border border-rose-900/30 hover:bg-rose-950/40 text-rose-400 text-[9px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>{t("tamper_db_hash")}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {decoratedEvidence.length === 0 && (
                        <div className="text-center py-12 border border-[#0d162f] rounded-2xl bg-[#030717]/10 glass">
                          <Folder className="w-10 h-10 text-slate-700 mx-auto mb-3 opacity-40" />
                          <h4 className="text-xs font-bold text-slate-400">{t("empty_evidence_room")}</h4>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {t("empty_evidence_desc")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : activeTab === "timeline" ? (
                  
                  /* 2. AUDIT TIMELINE TAB */
                  <div className="space-y-6 max-w-3xl mx-auto">
                    <div className="bg-[#050b1e]/50 p-5 rounded-2xl border border-[#0d162f] flex items-center space-x-4 glass">
                      <ShieldCheck className="w-8 h-8 text-emerald-450 flex-shrink-0" />
                      <div>
                        <h3 className="text-xs font-bold text-slate-200">Linked Chain-of-Custody Verification</h3>
                        <p className="text-[10px] text-slate-450 mt-1 font-semibold leading-relaxed">
                          {t("linked_chain_desc")}
                        </p>
                      </div>
                    </div>

                    <div className="relative border-l border-[#0d162f] ml-4 pl-8 space-y-8 py-2">
                      {caseDetails.logs.map((log) => {
                        const style = getActionStyles(log.action_type);
                        const isTampered =
                          hasAudited && auditResult?.chain_integrity === false && auditResult?.chain_error_at === log.id;

                        return (
                          <div key={log.id} className="relative">
                            <div
                              className={`absolute -left-[41px] top-1 p-2 rounded-full border bg-[#02050f] flex items-center justify-center shadow-lg transition-all ${
                                isTampered ? "border-rose-500 bg-rose-950/20" : style.bgColor
                              }`}
                            >
                              {isTampered ? <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" /> : style.icon}
                            </div>

                            <div
                              className={`p-5 rounded-2xl border bg-[#03081a]/40 transition-all ${
                                isTampered
                                  ? "border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.06)] bg-rose-950/5"
                                  : "border-[#0c142c] hover:border-[#0f1b3e]"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2.5">
                                <div>
                                  <span
                                    className={`text-[9px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                      isTampered ? "bg-rose-500/10 border-rose-500/25 text-rose-455" : style.bgColor
                                    }`}
                                  >
                                    {log.action_type}
                                  </span>
                                  <h4 className="text-[10px] text-slate-500 mt-2 font-semibold">
                                    {t("actor")}: <span className="font-bold text-slate-300 font-mono">{log.actor}</span>
                                  </h4>
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold font-mono">
                                  {formatDate(log.created_at, lang)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-300 leading-relaxed font-semibold mb-4">
                                {log.details || t("no_remarks")}
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#0c142c] font-mono text-[9px] text-slate-500">
                                <div>
                                  <span className="block text-slate-650 font-bold uppercase tracking-wider">
                                    {t("prev_block_hash")}
                                  </span>
                                  <span className="text-slate-500 block truncate font-bold" title={log.prev_log_hash}>
                                    {log.prev_log_hash}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-slate-650 font-bold uppercase tracking-wider">
                                    {t("current_block_hash")}
                                  </span>
                                  <span
                                    className={`block truncate font-bold ${
                                      isTampered ? "text-rose-455 font-bold" : "text-emerald-450"
                                    }`}
                                    title={log.log_hash}
                                  >
                                    {log.log_hash}
                                  </span>
                                </div>
                              </div>

                              {showSimulationPanel && (
                                <div className="mt-3 flex justify-end border-t border-dashed border-rose-950/20 pt-3">
                                  <button
                                    onClick={() => simulateLogChainTampering(log.id)}
                                    className="bg-rose-950/20 border border-rose-900/30 hover:bg-rose-950/40 text-rose-400 text-[9px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer transition-all"
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>{t("alter_log_details")}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  
                  /* 3. AI EVIDENCE INTELLIGENCE TAB */
                  <div className="space-y-6 max-w-7xl mx-auto">
                    {/* Semantic search box */}
                    <div className="bg-[#040920]/40 p-6 rounded-2xl border border-[#0d162f] relative overflow-hidden glass">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-3xl pointer-events-none"></div>
                      <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2 mb-3">
                        <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                        <span>{t("semantic_query_title")}</span>
                      </h3>
                      <p className="text-[10px] text-slate-450 mb-4 font-semibold leading-relaxed">
                        {t("semantic_query_desc")}
                      </p>
                      <form onSubmit={handleSemanticSearch} className="flex space-x-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            placeholder={t("ask_questions_placeholder")}
                            value={semanticQuery}
                            onChange={(e) => setSemanticQuery(e.target.value)}
                            className="w-full bg-[#020512] border border-[#0d162f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/70 font-semibold"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isSearching}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer transition-all border border-indigo-500/30"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isSearching ? t("analyzing") : t("query_case")}</span>
                        </button>
                      </form>

                      {/* Semantic search results */}
                      {searchResults !== null && (
                        <div className="mt-6 border-t border-[#0d162f]/60 pt-4 space-y-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {t("semantic_matches")} ({searchResults.length})
                            </h4>
                            <button
                              onClick={() => {
                                setSearchResults(null);
                                setSemanticQuery("");
                              }}
                              className="text-[10px] font-black text-rose-455 hover:text-rose-500 cursor-pointer transition-all"
                            >
                              {t("clear_results")}
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {searchResults.map((res, idx) => (
                              <div
                                key={idx}
                                className="p-4 rounded-xl border border-[#0d162f] bg-[#020512]/60 hover:border-slate-800/80 transition-all space-y-2.5"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 font-bold truncate max-w-[200px]">
                                    {res.filename}
                                  </span>
                                  <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                                    {(res.similarity * 100).toFixed(1)}% {t("match")}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-350 leading-relaxed font-semibold italic">
                                  "{res.snippet}"
                                </p>
                                <div className="text-[8px] text-slate-550 font-bold uppercase tracking-wider font-mono">
                                  {t("source_type")}: {res.content_type}
                                </div>
                              </div>
                            ))}
                            {searchResults.length === 0 && (
                              <div className="text-center py-6 text-xs text-slate-500 font-semibold col-span-2">
                                {t("no_semantic_matches")}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Summary, Entities & Timeline split */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      
                      {/* Left: Summary & Entities (Col span 5) */}
                      <div className="lg:col-span-5 space-y-6">
                        
                        {/* Executive Summary Card */}
                        <div className="bg-[#03081a]/40 p-5 rounded-2xl border border-[#0d162f] flex flex-col justify-between relative glass">
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {t("executive_summary")}
                              </h3>
                              <button
                                onClick={handleGenerateSummary}
                                disabled={isAiLoading}
                                className="text-[10px] font-black text-indigo-400 hover:text-indigo-350 flex items-center space-x-1 cursor-pointer transition-all"
                              >
                                <RefreshCw className={`w-3 h-3 ${isAiLoading ? "animate-spin" : ""}`} />
                                <span>{t("recompile")}</span>
                              </button>
                            </div>

                            {aiInsights.summary ? (
                              <div className="space-y-4">
                                <p className="text-[11px] text-slate-350 leading-relaxed font-semibold whitespace-pre-wrap">
                                  {aiInsights.summary.executive_summary}
                                </p>
                                
                                {aiInsights.summary.important_entities.length > 0 && (
                                  <div className="border-t border-[#0c142c] pt-3.5">
                                    <h4 className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2.5 font-mono">
                                      {t("identified_actors")}
                                    </h4>
                                    <div className="space-y-2">
                                      {aiInsights.summary.important_entities.map((item, idx) => (
                                        <div key={idx} className="text-xs text-slate-350 flex justify-between font-semibold">
                                          <span className="font-bold text-slate-200">{item.name}</span>
                                          <span className="text-[10px] text-slate-500">{item.role_or_details}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-8">
                                <Sparkles className="w-6 h-6 text-slate-700 mx-auto mb-2 opacity-50" />
                                <p className="text-xs text-slate-500 mb-3 font-semibold">No summary compiled.</p>
                                <button
                                  onClick={handleGenerateSummary}
                                  className="bg-[#060c20] border border-[#0d162f] hover:bg-[#0c132f] text-slate-350 text-[10px] font-bold py-1.5 px-3.5 rounded-xl cursor-pointer transition-all"
                                >
                                  Compile Case Summary
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Forensic Entities Dictionary */}
                        <div className="bg-[#03081a]/40 p-5 rounded-2xl border border-[#0d162f] glass">
                          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                            {t("extracted_entities")}
                          </h3>
                          <p className="text-[10px] text-slate-500 mb-4 leading-relaxed font-semibold">
                            {t("extracted_entities_desc")}
                          </p>

                          {aiInsights.entities.length > 0 ? (
                            <div className="space-y-4">
                              {["NAME", "PHONE", "EMAIL", "UPI_ID", "TXN_ID", "ORGANIZATION"].map((type) => {
                                const group = aiInsights.entities.filter((e) => e.entity_type === type);
                                if (group.length === 0) return null;

                                return (
                                  <div key={type} className="space-y-2">
                                    <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest block font-mono">
                                      {type === "UPI_ID" ? "UPI Payments" : type === "TXN_ID" ? "Transaction References" : type + "S"}
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {Array.from(new Set(group.map((e) => e.entity_value))).map((val, idx) => {
                                        const isSelected = selectedEntityFilter === val;
                                        return (
                                          <button
                                            key={idx}
                                            onClick={() => setSelectedEntityFilter(isSelected ? null : val)}
                                            className={`text-[9px] font-semibold font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                                              isSelected
                                                ? "bg-emerald-500/20 border-emerald-500 text-emerald-350 font-bold"
                                                : "bg-[#020512] border-[#0d162f] text-slate-450 hover:text-slate-200 hover:border-slate-700"
                                            }`}
                                          >
                                            {val}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-[10px] text-slate-500 italic font-semibold">
                              {t("entities_placeholder")}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Interactive Forensic Timeline (Col span 7) */}
                      <div className="lg:col-span-7 space-y-6">
                        <div className="bg-[#03081a]/40 p-5 rounded-2xl border border-[#0d162f] glass">
                          <div className="flex justify-between items-center mb-4">
                            <div>
                              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {t("automated_timeline_title")}
                              </h3>
                              <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                                {t("automated_timeline_desc")}
                              </p>
                            </div>
                            <button
                              onClick={handleGenerateTimeline}
                              disabled={isAiLoading}
                              className="text-[10px] font-black text-indigo-400 hover:text-indigo-350 flex items-center space-x-1 cursor-pointer transition-all"
                            >
                              <RefreshCw className={`w-3 h-3 ${isAiLoading ? "animate-spin" : ""}`} />
                              <span>{t("rebuild")}</span>
                            </button>
                          </div>

                          {aiInsights.timeline.length > 0 ? (
                            <div className="relative border-l border-[#0d162f] ml-3 pl-6 space-y-5 py-2">
                              {aiInsights.timeline
                                .filter((ev) => !selectedEntityFilter || ev.description.toLowerCase().includes(selectedEntityFilter.toLowerCase()))
                                .map((ev, idx) => {
                                  const confidenceColor =
                                    ev.confidence === "HIGH"
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                      : ev.confidence === "MEDIUM"
                                      ? "bg-amber-500/10 border-amber-500/20 text-amber-450"
                                      : "bg-rose-500/10 border-rose-500/20 text-rose-455";

                                  return (
                                    <div key={idx} className="relative group">
                                      <div className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full border border-indigo-500 bg-[#02050f] group-hover:scale-125 transition-transform" />
                                      <div className="p-4 rounded-xl border border-[#0d162f] bg-[#020512]/40 hover:border-slate-800 transition-all space-y-2.5">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[9px] font-bold text-slate-450 bg-[#020512] border border-[#0d162f] px-2.5 py-0.5 rounded-lg font-mono">
                                            {formatDate(ev.event_timestamp, lang)}
                                          </span>
                                          <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${confidenceColor}`}>
                                            {ev.confidence || "MEDIUM"}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-300 font-semibold leading-relaxed">
                                          {ev.description}
                                        </p>
                                        
                                        {ev.supporting_evidence_ids && ev.supporting_evidence_ids.length > 0 && (
                                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#0c142c] mt-2.5">
                                            <span className="text-[8px] font-bold text-slate-550 uppercase tracking-widest font-mono mr-1">
                                              {t("supporting_evidence")}:
                                            </span>
                                            {ev.supporting_evidence_ids.map((refId) => {
                                              const fileMatch = caseDetails.evidence.find((e) => e.id === refId);
                                              return (
                                                <span
                                                  key={refId}
                                                  className="text-[9px] font-mono text-emerald-450 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 max-w-[150px] truncate"
                                                  title={fileMatch?.original_filename || refId}
                                                >
                                                  {fileMatch?.original_filename || refId.substring(0, 8) + "..."}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              {aiInsights.timeline.filter((ev) => !selectedEntityFilter || ev.description.toLowerCase().includes(selectedEntityFilter.toLowerCase())).length === 0 && (
                                <div className="text-center py-6 text-xs text-slate-500 font-semibold">
                                  {t("no_timeline_match")}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <Sparkles className="w-6 h-6 text-slate-700 mx-auto mb-2 opacity-50" />
                              <p className="text-xs text-slate-500 mb-3 font-semibold">{t("no_timeline_records")}</p>
                              <button
                                onClick={handleGenerateTimeline}
                                className="bg-[#060c20] border border-[#0d162f] hover:bg-[#0c132f] text-slate-350 text-[10px] font-bold py-1.5 px-3.5 rounded-xl cursor-pointer transition-all"
                              >
                                {t("build_forensic_timeline")}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty Case Room State */
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center bg-[#02050f]/30">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-[#03081a] border border-[#0d162f] flex items-center justify-center text-slate-700">
                <Folder className="w-12 h-12 opacity-60" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/25 text-emerald-450 shadow-lg">
                <Shield className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <h2 className="text-lg font-black text-slate-205">{t("no_case_selected_title")}</h2>
            <p className="text-xs text-slate-500 max-w-xs mt-2 mb-6 leading-relaxed font-semibold">
              {t("no_case_selected_desc")}
            </p>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleSeedDemoCase}
                className="bg-[#060c20] border border-[#0d162f] hover:border-slate-800 text-emerald-400 hover:text-emerald-300 font-bold py-2.5 px-5 rounded-xl flex items-center space-x-2 text-xs transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("seed_demo_case")}</span>
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl flex items-center space-x-2 text-xs shadow-lg shadow-indigo-600/10 cursor-pointer border border-indigo-500/30"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("open_new_case")}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Floating Settings Panel (yutaabe/Antigravity style Drawer) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-all animate-fade-in">
          <div className="w-96 bg-[#03081a] border-l border-[#0d162f] h-full p-6 shadow-2xl flex flex-col justify-between z-50 relative">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#0d162f] mb-6">
                <div className="flex items-center space-x-2.5">
                  <Languages className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-205">{t("settings_title")}</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-slate-500 hover:text-slate-350 p-1.5 rounded-lg hover:bg-[#060c20] cursor-pointer transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={saveConfiguration} className="space-y-5">
                {/* Language selection */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                    {t("language_label")}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3.5 top-3 w-4 h-4 text-slate-550" />
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      className="w-full bg-[#020512] border border-[#0d162f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                    >
                      <option value="en">English (India)</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                      <option value="te">తెలుగు (Telugu)</option>
                    </select>
                  </div>
                </div>

                {/* AI Provider selection */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                    {t("ai_provider_label")}
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-[#020512] p-1.5 rounded-xl border border-[#0d162f]">
                    <button
                      type="button"
                      onClick={() => setAiProvider("gemini")}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        aiProvider === "gemini"
                          ? "bg-indigo-600 text-white shadow-md"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Gemini Cloud
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiProvider("ollama")}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        aiProvider === "ollama"
                          ? "bg-indigo-600 text-white shadow-md"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Local Ollama
                    </button>
                  </div>
                </div>

                {/* BYOK: Gemini custom key */}
                {aiProvider === "gemini" && (
                  <div className="space-y-1.5 animate-slide-down">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      {t("gemini_key_label")}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-550" />
                      <input
                        type="password"
                        placeholder="AIzaSy..."
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        className="w-full bg-[#020512] border border-[#0d162f] rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Ollama local settings */}
                {aiProvider === "ollama" && (
                  <div className="space-y-4 animate-slide-down">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                        {t("ollama_host_label")}
                      </label>
                      <input
                        type="text"
                        placeholder="http://localhost:11434"
                        value={ollamaHost}
                        onChange={(e) => setOllamaHost(e.target.value)}
                        className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                        {t("ollama_model_label")}
                      </label>
                      <input
                        type="text"
                        placeholder="llama3"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                        {t("ollama_embed_model_label")}
                      </label>
                      <input
                        type="text"
                        placeholder="nomic-embed-text"
                        value={ollamaEmbedModel}
                        onChange={(e) => setOllamaEmbedModel(e.target.value)}
                        className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-indigo-600/15 cursor-pointer border border-indigo-500/30 transition-all mt-4"
                >
                  {t("save_settings")}
                </button>
              </form>
            </div>
            
            <div className="text-[9px] text-slate-550 border-t border-[#0d162f] pt-4 font-mono text-center">
              TRACE v1.2.0 • BYOK & i18n Engaged
            </div>
          </div>
        </div>
      )}

      {/* Settings Saved Toast Notification */}
      {showSavedAlert && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-[#02050f] font-bold py-3 px-5 rounded-2xl flex items-center space-x-2 shadow-2xl shadow-emerald-500/10 border border-emerald-400 animate-slide-up">
          <ShieldCheck className="w-5 h-5" />
          <span className="text-xs uppercase tracking-wider">{t("settings_saved_alert")}</span>
        </div>
      )}

      {/* 3. CASE INITIALIZATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[#03081a] border border-[#0d162f] rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 mb-4">{t("initialize_case_file")}</h3>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("ref_id_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LAB-2026-004A"
                  value={createForm.reference_id}
                  onChange={(e) => setCreateForm({ ...createForm, reference_id: e.target.value })}
                  className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("case_title_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Corporate Exfiltration Analysis"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("scope_abstract_label")}
                </label>
                <textarea
                  placeholder="Provide scope, background, and specific hardware or source details."
                  rows={4}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 resize-none font-semibold"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[#0d162f] mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-[#020512] border border-[#0d162f] hover:bg-[#070e26] text-slate-400 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-750 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-indigo-600/10 cursor-pointer border border-indigo-500/35 transition-all"
                >
                  {t("create_case_file")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. CUSTODY TRANSFER MODAL */}
      {isTransferModalOpen && transferTargetEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#03081a] border border-[#0d162f] rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 mb-2 flex items-center space-x-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-400" />
              <span>{t("transfer_custody_log")}</span>
            </h3>
            <p className="text-[10px] text-slate-500 mb-4 font-semibold">
              {t("logging_custody_for")}: <span className="font-mono text-emerald-450 font-bold">{transferTargetEvidence.original_filename}</span>
            </p>
            <form onSubmit={handleTransferCustody} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("recipient_identity_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Analyst Jessica Beta"
                  value={transferForm.recipient}
                  onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                  className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("reason_for_transfer_label")}
                </label>
                <textarea
                  required
                  placeholder="e.g. Relocating to secure lab vault for magnetic storage imaging."
                  rows={3}
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  className="w-full bg-[#020512] border border-[#0d162f] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 resize-none font-semibold"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[#0d162f] mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferTargetEvidence(null);
                  }}
                  className="bg-[#020512] border border-[#0d162f] hover:bg-[#070e26] text-slate-400 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-750 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-indigo-600/10 cursor-pointer border border-indigo-500/35 transition-all"
                >
                  {t("log_custody_transfer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
