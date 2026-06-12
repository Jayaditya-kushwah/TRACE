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
  Sparkles,
  Search,
  User,
  Settings,
  Globe,
  X,
  Database,
  Activity,
  AlertOctagon
} from "lucide-react";
import { translations, formatBytes, formatDate } from "./i18n/translations";
import { InteractiveMeshCanvas } from "./InteractiveMeshCanvas";

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
    sha256_hash?: string;
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
  
  // Canvas Visualization Mode
  const [canvasMode, setCanvasMode] = useState<"WIREFRAME" | "HALFTONE" | "ORBITS">("WIREFRAME");

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

  // Local clock state for corners
  const [timeStr, setTimeStr] = useState("");
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString("en-US", { hour12: false }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

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
        await fetchCases();
        setSelectedCaseId(json.data.id);
        setIsCreateModalOpen(false);
        setCreateForm({ reference_id: "", title: "", description: "", created_by: investigatorName });
      } else {
        alert(json.error || "Failed to create case");
      }
    } catch (err) {
      console.error("Error creating case:", err);
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
        if (selectedCaseId) {
          await fetchCaseDetails(selectedCaseId);
        }
        setIsTransferModalOpen(false);
        setTransferForm({ actor: investigatorName, recipient: "", reason: "" });
        setTransferTargetEvidence(null);
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

  const handleTamperFile = async (evidenceId: string) => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId, evidence_id: evidenceId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Server file tampered! Run 'Audit Case Integrity' to test integrity detection.");
        await fetchCaseDetails(selectedCaseId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTamperDBHash = async (evidenceId: string) => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-db-hash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_id: evidenceId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Database evidence hash altered! Run 'Audit Case Integrity' to evaluate integrity validation.");
        await fetchCaseDetails(selectedCaseId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTamperLogChain = async (logId: string) => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/tamper-log-chain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId, log_id: logId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Historical log block modified! The log hash chain is now broken. Execute audit to verify.");
        await fetchCaseDetails(selectedCaseId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestoreOriginals = async () => {
    if (!selectedCaseId) return;
    try {
      const res = await fetch(`${API_BASE}/api/simulate/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId })
      });
      const json = await res.json();
      if (json.success) {
        alert("Pristine backups restored, hashes recalculated, and log chain reconstructed.");
        await fetchCaseDetails(selectedCaseId);
        if (hasAudited) {
          handleAuditCase();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeedDemoCase = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/simulate/seed-demo`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        await fetchCases();
        setSelectedCaseId(json.case_id);
        alert(lang === "hi" ? "डेमो केस सफलतापूर्वक लोड किया गया!" : lang === "te" ? "డెమో కేసు విజయవంతంగా లోడ్ చేయబడింది!" : "Demo investigation case seeded successfully!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Seeding failed: " + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
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

  const getFileIcon = (mime: string) => {
    if (mime.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (mime.startsWith("video/")) return <Film className="w-4 h-4" />;
    if (mime.includes("pdf")) return <FileText className="w-4 h-4" />;
    if (mime.includes("javascript") || mime.includes("json") || mime.includes("html") || mime.includes("css")) {
      return <FileCode className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  const getStatusText = (status: "VERIFIED" | "TAMPERED" | "MISSING" | undefined) => {
    if (!status) return "Unverified";
    if (status === "VERIFIED") return t("verified_secure");
    if (status === "TAMPERED") return t("tamper_detected");
    return "Missing File";
  };

  return (
    <div className="flex h-screen bg-[#000000] text-slate-200 font-sans overflow-hidden relative selection:bg-neutral-800 selection:text-white">
      {/* 3D PROJECTED PARALLAX CANVAS */}
      <InteractiveMeshCanvas
        mode={canvasMode}
        evidence={caseDetails?.evidence || []}
        caseTitle={caseDetails?.title || null}
        hasAudited={hasAudited}
        auditResult={auditResult}
      />

      {/* AESTHETIC FINE OVERLAY GRID LINES */}
      <div className="absolute inset-0 pointer-events-none z-10 border border-neutral-900/60 m-4 flex flex-col justify-between">
        <div className="flex justify-between p-4 text-[9px] font-mono tracking-widest text-neutral-500 uppercase">
          <div>TRACE // FORENSIC CUSTODY PLATFORM</div>
          <div className="flex space-x-6">
            <span>UPTIME // 100%</span>
            <span>AI: {aiProvider.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex justify-between p-4 text-[9px] font-mono tracking-widest text-neutral-500">
          <div className="flex items-center space-x-2">
            <span>SYSTEM NODE READY // CUSTODY LEVEL: ACTIVE</span>
          </div>
          <div>{timeStr} // UTC+5:30</div>
        </div>
      </div>

      {/* CORE WRAPPER CONTROLS */}
      {/* SIDEBAR NAVIGATION PANEL */}
      <aside className="w-80 border-r border-neutral-900 bg-black/60 backdrop-blur-md flex flex-col z-20 relative m-4 mr-0 rounded-l-xl">
        <div className="p-5 border-b border-neutral-900">
          <div className="flex items-center space-x-3 mb-2">
            <Shield className="w-5 h-5 text-neutral-400" />
            <div>
              <h1 className="text-md font-bold tracking-wider font-mono text-white">{t("app_title")}</h1>
              <p className="text-[8px] text-neutral-500 uppercase tracking-widest font-bold font-mono">
                {t("forensic_custody_engine")}
              </p>
            </div>
          </div>
        </div>

        {/* INVESTIGATOR IDENTITY CONTROL */}
        <div className="px-5 py-3 border-b border-neutral-900 bg-neutral-950/40">
          <label className="text-[8px] uppercase tracking-widest text-neutral-500 font-bold block mb-1">
            {t("current_investigator")}
          </label>
          <div className="flex items-center space-x-2 bg-black/80 px-3 py-1.5 rounded border border-neutral-900 focus-within:border-neutral-700 transition-all">
            <User className="w-3 h-3 text-neutral-500" />
            <input
              type="text"
              value={investigatorName}
              onChange={(e) => setInvestigatorName(e.target.value)}
              className="bg-transparent text-xs text-neutral-300 focus:outline-none w-full font-mono"
            />
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="p-3 border-b border-neutral-900">
          <div className="relative">
            <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              placeholder={t("search_cases")}
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-black/80 border border-neutral-900 rounded pl-8 pr-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-700 font-mono placeholder:text-neutral-700"
            />
          </div>
        </div>

        {/* CASES TREE VIEW LIST */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {filteredCases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={`w-full text-left p-3 rounded transition-all relative group overflow-hidden border ${
                selectedCaseId === c.id
                  ? "bg-neutral-950 border-neutral-700 text-white"
                  : "bg-transparent border-transparent text-neutral-450 hover:bg-neutral-950/50 hover:text-white"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-850">
                  {c.reference_id}
                </span>
                <span className="text-[8px] text-neutral-600 font-mono">
                  {formatDate(c.created_at, lang).split(",")[0]}
                </span>
              </div>
              <h3 className="text-xs font-semibold font-mono truncate">{c.title}</h3>
              <p className="text-[9px] text-neutral-500 truncate mt-0.5 font-mono">{c.description || "No abstract"}</p>
            </button>
          ))}
          {filteredCases.length === 0 && (
            <div className="text-center py-12">
              <Folder className="w-6 h-6 text-neutral-800 mx-auto mb-2 opacity-50" />
              <p className="text-xs text-neutral-600 font-mono">{t("no_cases_found")}</p>
            </div>
          )}
        </div>

        {/* SIDEBAR SETTINGS FOOTER */}
        <div className="p-4 border-t border-neutral-900 bg-black/80 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex-1 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 text-neutral-300 font-mono py-1.5 px-3 rounded flex items-center justify-center space-x-1.5 text-[10px] cursor-pointer"
            >
              <Settings className="w-3 h-3 text-neutral-400" />
              <span>{t("settings_title")}</span>
            </button>
            <button
              onClick={handleSeedDemoCase}
              className="bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 text-neutral-400 font-mono p-1.5 rounded flex items-center justify-center cursor-pointer"
              title={t("seed_demo_case")}
            >
              <Sparkles className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full bg-white hover:bg-neutral-200 text-black font-bold font-mono py-2 px-4 rounded text-xs flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("create_case_file")}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT DASHBOARD */}
      <main className="flex-1 flex flex-col z-20 relative m-4 ml-2 bg-black/40 backdrop-blur-md border border-neutral-900 rounded-r-xl overflow-hidden">
        {selectedCaseId && caseDetails ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* CASE HEADER CONTROL BANNER */}
            <div className="p-6 border-b border-neutral-900 bg-black/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center space-x-3 mb-1">
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                    {caseDetails.reference_id}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {t("created_by")}: {caseDetails.created_by}
                  </span>
                </div>
                <h2 className="text-xl font-bold font-mono text-white">{caseDetails.title}</h2>
                <p className="text-xs text-neutral-400 font-mono max-w-2xl mt-1 leading-relaxed">
                  {caseDetails.description || "No abstract detailed."}
                </p>
              </div>

              {/* ACTION TOGGLES */}
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setShowSimulationPanel(!showSimulationPanel)}
                  className={`px-3 py-1.5 rounded border font-mono text-[10px] flex items-center space-x-1.5 transition-all cursor-pointer ${
                    showSimulationPanel
                      ? "bg-red-950/40 border-red-700 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                      : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-red-950/60 hover:text-red-400"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t("tamper_simulation")}</span>
                </button>

                <button
                  onClick={handleAuditCase}
                  disabled={isAuditLoading}
                  className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-white font-mono text-[10px] font-bold rounded flex items-center space-x-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? "animate-spin" : ""}`} />
                  <span>{isAuditLoading ? t("verifying") : t("audit_case_integrity")}</span>
                </button>

                <a
                  href={`${API_BASE}/api/cases/${selectedCaseId}/report`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 text-neutral-300 font-mono text-[10px] rounded flex items-center space-x-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t("export_report")}</span>
                </a>

                <a
                  href={`${API_BASE}/api/cases/${selectedCaseId}/export`}
                  className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 text-neutral-300 font-mono text-[10px] rounded flex items-center space-x-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t("download_archive")}</span>
                </a>
              </div>
            </div>

            {/* INTEGRITY AUDIT NOTIFICATION BAR */}
            {hasAudited && auditResult && (
              <div
                className={`mx-6 mt-4 p-4 border rounded font-mono ${
                  auditResult.chain_integrity
                    ? "bg-emerald-950/20 border-emerald-900 text-emerald-400"
                    : "bg-red-950/20 border-red-900 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.06)]"
                }`}
              >
                <div className="flex items-start space-x-3">
                  {auditResult.chain_integrity ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertOctagon className="w-5 h-5 text-red-500 mt-0.5 shrink-0 animate-pulse" />
                  )}
                  <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {auditResult.chain_integrity ? t("verification_passed_title") : t("verification_failed_title")}
                    </h4>
                    <p className="text-[10px] opacity-80 mt-1 leading-relaxed">
                      {auditResult.chain_integrity ? t("verification_passed_desc") : t("verification_failed_desc")}
                    </p>
                  </div>
                  {showSimulationPanel && !auditResult.chain_integrity && (
                    <button
                      onClick={handleRestoreOriginals}
                      className="px-3 py-1 bg-red-900/40 hover:bg-red-900 border border-red-750 text-red-100 text-[10px] font-bold rounded cursor-pointer"
                    >
                      {t("restore_originals")}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTAINER VIEWPORT */}
            <div className="px-6 border-b border-neutral-900 bg-black/40 flex justify-between items-center">
              <div className="flex space-x-1 mt-2">
                <button
                  onClick={() => setActiveTab("catalog")}
                  className={`px-4 py-2 text-[10px] font-bold font-mono tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeTab === "catalog"
                      ? "border-white text-white bg-neutral-950/20"
                      : "border-transparent text-neutral-550 hover:text-neutral-350"
                  }`}
                >
                  [ 01 // {t("evidence_catalog")} ]
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`px-4 py-2 text-[10px] font-bold font-mono tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeTab === "timeline"
                      ? "border-white text-white bg-neutral-950/20"
                      : "border-transparent text-neutral-550 hover:text-neutral-350"
                  }`}
                >
                  [ 02 // {t("audit_timeline")} ]
                </button>
                <button
                  onClick={() => setActiveTab("ai_hub")}
                  className={`px-4 py-2 text-[10px] font-bold font-mono tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeTab === "ai_hub"
                      ? "border-white text-white bg-neutral-950/20"
                      : "border-transparent text-neutral-550 hover:text-neutral-350"
                  }`}
                >
                  [ 03 // {t("ai_insights_tab")} ]
                </button>
              </div>

              {/* SIMULATION RESTORE SHORTCUT */}
              {showSimulationPanel && (
                <button
                  onClick={handleRestoreOriginals}
                  className="mb-1 text-[9px] text-red-450 hover:text-red-400 font-bold font-mono border border-red-900/50 bg-red-950/10 px-2 py-0.5 rounded flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>{t("restore_originals")}</span>
                </button>
              )}
            </div>

            {/* TAB CONTAINER WORKSPACE */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAB 01: EVIDENCE DATABASE CATALOG */}
              {activeTab === "catalog" && (
                <div className="space-y-6">
                  {/* DRAG AND DROP ZONE */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border border-dashed rounded-lg p-8 text-center transition-all ${
                      dragActive
                        ? "border-white bg-neutral-950 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        : "border-neutral-900 bg-neutral-950/40 text-neutral-500 hover:border-neutral-800"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload className="w-8 h-8 mx-auto mb-3 opacity-60" />
                    <p className="text-xs font-semibold font-mono text-neutral-300">{t("drag_drop_zone")}</p>
                    <p className="text-[9px] text-neutral-600 max-w-md mx-auto mt-1 leading-relaxed font-mono">
                      {t("drag_drop_sub")}
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="mt-4 px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-white font-mono text-[10px] rounded cursor-pointer disabled:opacity-50"
                    >
                      {isUploading ? t("uploading") : t("select_file")}
                    </button>
                  </div>

                  {/* EVIDENCE ENTRIES TABLE */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-450 font-mono">
                      {t("secure_evidence_records")}
                    </h3>
                    <div className="border border-neutral-900 rounded-lg overflow-hidden bg-black/60">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-900 bg-neutral-950/40 text-[9px] font-mono tracking-widest text-neutral-500 uppercase">
                            <th className="p-3 pl-4">Filename</th>
                            <th className="p-3">Audit SHA-256 Hash</th>
                            <th className="p-3">File Size</th>
                            <th className="p-3">Custody Event</th>
                            <th className="p-3 pr-4 text-right">Integrity Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-900 text-xs font-mono">
                          {decoratedEvidence.map((ev) => (
                            <tr key={ev.id} className="hover:bg-neutral-950/30 group">
                              {/* File name & info */}
                              <td className="p-3 pl-4">
                                <div className="flex items-center space-x-2.5">
                                  <div className="text-neutral-500 shrink-0">
                                    {getFileIcon(ev.mime_type)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-neutral-200 group-hover:text-white truncate max-w-[180px]" title={ev.original_filename}>
                                      {ev.original_filename}
                                    </div>
                                    <div className="text-[9px] text-neutral-600 mt-0.5">
                                      {ev.mime_type}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Cryptographic SHA-256 Hash */}
                              <td className="p-3">
                                <div className="flex items-center space-x-2">
                                  <span className="text-[10px] text-neutral-500 font-mono font-semibold">
                                    {ev.sha256_hash.substring(0, 16)}...
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(ev.sha256_hash)}
                                    className="text-neutral-700 hover:text-neutral-450 shrink-0 cursor-pointer"
                                    title="Copy SHA-256 Hash"
                                  >
                                    {copiedHash === ev.sha256_hash ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                                {ev.recalculated_hash && ev.recalculated_hash !== ev.sha256_hash && (
                                  <div className="text-[9px] text-red-500 mt-1 font-semibold">
                                    {t("recalculated_hash")} {ev.recalculated_hash.substring(0, 12)}...
                                  </div>
                                )}
                              </td>

                              {/* Size */}
                              <td className="p-3 text-neutral-400">
                                {formatBytes(ev.file_size_bytes, lang)}
                              </td>

                              {/* Upload timestamp & uploader */}
                              <td className="p-3">
                                <div className="text-neutral-400">{ev.uploaded_by}</div>
                                <div className="text-[9px] text-neutral-600 mt-0.5">
                                  {formatDate(ev.uploaded_at, lang)}
                                </div>
                              </td>

                              {/* Action Options (Tamper & Transfer buttons) */}
                              <td className="p-3 pr-4 text-right">
                                <div className="flex items-center justify-end space-x-2.5">
                                  {/* Tampering Options for testing */}
                                  {showSimulationPanel && (
                                    <div className="flex items-center space-x-1 animate-fadeIn">
                                      <button
                                        onClick={() => handleTamperFile(ev.id)}
                                        className="bg-red-950/20 hover:bg-red-950/50 border border-red-900/60 text-red-400 text-[8px] px-1.5 py-0.5 rounded cursor-pointer"
                                        title={t("tamper_disk_file")}
                                      >
                                        Disk Corrupt
                                      </button>
                                      <button
                                        onClick={() => handleTamperDBHash(ev.id)}
                                        className="bg-red-950/20 hover:bg-red-950/50 border border-red-900/60 text-red-400 text-[8px] px-1.5 py-0.5 rounded cursor-pointer"
                                        title={t("tamper_db_hash")}
                                      >
                                        DB Hash
                                      </button>
                                    </div>
                                  )}

                                  {/* Custom status badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded text-[8px] font-bold border ${
                                      !ev.status
                                        ? "bg-neutral-900 border-neutral-800 text-neutral-450"
                                        : ev.status === "VERIFIED"
                                        ? "bg-emerald-950/10 border-emerald-900/40 text-emerald-450"
                                        : "bg-red-950/10 border-red-900/40 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.1)]"
                                    }`}
                                  >
                                    {getStatusText(ev.status)}
                                  </span>

                                  {/* Transfer button */}
                                  <button
                                    onClick={() => {
                                      setTransferTargetEvidence(ev);
                                      setIsTransferModalOpen(true);
                                    }}
                                    className="p-1 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 hover:border-neutral-700 text-neutral-400 hover:text-white rounded cursor-pointer"
                                    title={t("transfer_custody")}
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {decoratedEvidence.length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-12 text-neutral-600">
                                <Database className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                <div className="font-bold">{t("empty_evidence_room")}</div>
                                <div className="text-[10px] mt-0.5">{t("empty_evidence_desc")}</div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 02: CRYPTOGRAPHIC LOG TIMELINE */}
              {activeTab === "timeline" && (
                <div className="space-y-6 max-w-4xl mx-auto">
                  <div className="p-4 border border-neutral-900 bg-neutral-950/30 rounded-lg text-neutral-400 font-mono text-xs leading-relaxed">
                    <p className="font-semibold text-neutral-200 mb-1">
                      [CRYPTOGRAPHIC AUDIT LEDGER]
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      {t("linked_chain_desc")}
                    </p>
                  </div>

                  {/* LOG VERTICAL TIMELINE LEDGER */}
                  <div className="relative border-l border-neutral-900 ml-4 pl-6 space-y-6">
                    {caseDetails.logs.map((log, index) => {
                      const isBroken = hasAudited && auditResult && !auditResult.chain_integrity && auditResult.chain_error_at === log.id;
                      
                      return (
                        <div key={log.id} className="relative">
                          {/* Left bullet marker node */}
                          <div
                            className={`absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border flex items-center justify-center ${
                              isBroken
                                ? "bg-red-950 border-red-650 text-red-400 animate-pulse"
                                : "bg-black border-neutral-800 text-neutral-500"
                            }`}
                          >
                            <span className="text-[8px] font-bold font-mono">{index}</span>
                          </div>

                          {/* Block Card */}
                          <div className={`p-4 border rounded-lg bg-neutral-950/60 font-mono ${
                            isBroken ? "border-red-900 shadow-[0_0_12px_rgba(239,68,68,0.1)]" : "border-neutral-900"
                          }`}>
                            <div className="flex flex-wrap justify-between items-start mb-2 gap-2">
                              <div>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                  log.action_type === "CASE_CREATED"
                                    ? "bg-indigo-950/20 border-indigo-900 text-indigo-400"
                                    : log.action_type === "EVIDENCE_UPLOADED"
                                    ? "bg-emerald-950/20 border-emerald-900 text-emerald-450"
                                    : "bg-amber-950/20 border-amber-900 text-amber-500"
                                }`}>
                                  {log.action_type}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-500">
                                {formatDate(log.created_at, lang)}
                              </div>
                            </div>

                            <p className="text-xs text-neutral-300 mb-3 leading-relaxed">
                              {log.details}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[9px] text-neutral-500 border-t border-neutral-900/60 pt-2.5">
                              <div>
                                <span className="font-bold text-neutral-600 block">{t("actor")}:</span>
                                <span className="text-neutral-450">{log.actor}</span>
                              </div>
                              <div>
                                <span className="font-bold text-neutral-600 block">{t("prev_block_hash")}:</span>
                                <span className="text-neutral-500 truncate block hover:text-neutral-350 cursor-pointer" onClick={() => copyToClipboard(log.prev_log_hash)}>
                                  {log.prev_log_hash.substring(0, 32)}...
                                </span>
                              </div>
                              <div className="md:col-span-2 mt-1">
                                <span className="font-bold text-neutral-600 block">{t("current_block_hash")}:</span>
                                <span className={`truncate block font-semibold hover:text-neutral-300 cursor-pointer ${isBroken ? "text-red-400" : "text-neutral-400"}`} onClick={() => copyToClipboard(log.log_hash)}>
                                  {log.log_hash}
                                </span>
                              </div>
                            </div>

                            {/* Tamper log simulation panel */}
                            {showSimulationPanel && (
                              <div className="mt-3 flex justify-end animate-fadeIn">
                                <button
                                  onClick={() => handleTamperLogChain(log.id)}
                                  className="bg-red-950/20 hover:bg-red-950/50 border border-red-900/50 text-red-400 text-[8px] font-bold px-2 py-0.5 rounded cursor-pointer"
                                >
                                  {t("alter_log_details")}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 03: COGNITIVE INTELLIGENCE ENGINE (AI FEATURES) */}
              {activeTab === "ai_hub" && (
                <div className="space-y-6">
                  {/* CONFIG AND REBUILD BUTTONS */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-neutral-900 bg-neutral-950/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold font-mono uppercase text-neutral-300">
                        {t("ai_provider_label")}: {aiProvider.toUpperCase()} ({ollamaModel})
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isAiLoading}
                        className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-white font-mono text-[9px] font-bold rounded flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isAiLoading ? "animate-spin" : ""}`} />
                        <span>{t("recompile")} summary</span>
                      </button>
                      <button
                        onClick={handleGenerateTimeline}
                        disabled={isAiLoading}
                        className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-white font-mono text-[9px] font-bold rounded flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isAiLoading ? "animate-spin" : ""}`} />
                        <span>{t("rebuild")} timeline</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* EXECUTIVE ABSTRACT AND ACTORS (2 COLS) */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* EXECUTIVE SUMMARY ABSTRACT */}
                      <div className="border border-neutral-900 rounded-lg p-5 bg-black/60 font-mono">
                        <div className="flex items-center justify-between mb-4 border-b border-neutral-900 pb-2">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                            {t("executive_summary")}
                          </h3>
                          <Sparkles className="w-3.5 h-3.5 text-indigo-450" />
                        </div>
                        {isAiLoading && !aiInsights.summary ? (
                          <div className="py-12 text-center text-neutral-600 text-xs">
                            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
                            <span>{t("analyzing")}</span>
                          </div>
                        ) : aiInsights.summary ? (
                          <div className="text-xs leading-relaxed text-neutral-300 whitespace-pre-wrap">
                            {aiInsights.summary.executive_summary}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-neutral-600 text-xs">
                            <p className="mb-2">No compiled abstract found for this case container.</p>
                            <button
                              onClick={handleGenerateSummary}
                              className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded hover:text-white"
                            >
                              {t("build_forensic_timeline")}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* SEMANTIC VECTOR SEARCH */}
                      <div className="border border-neutral-900 rounded-lg p-5 bg-black/60 font-mono">
                        <div className="mb-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                            {t("semantic_query_title")}
                          </h3>
                          <p className="text-[9px] text-neutral-500 mt-0.5">
                            {t("semantic_query_desc")}
                          </p>
                        </div>

                        <form onSubmit={handleSemanticSearch} className="flex gap-2 mb-4">
                          <input
                            type="text"
                            placeholder={t("ask_questions_placeholder")}
                            value={semanticQuery}
                            onChange={(e) => setSemanticQuery(e.target.value)}
                            className="flex-1 bg-black border border-neutral-900 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-neutral-700"
                          />
                          <button
                            type="submit"
                            disabled={isSearching}
                            className="px-4 py-1.5 bg-white text-black font-bold text-xs rounded hover:bg-neutral-200 cursor-pointer disabled:opacity-50"
                          >
                            {isSearching ? t("analyzing") : t("query_case")}
                          </button>
                        </form>

                        {/* SEARCH RESULTS */}
                        {searchResults && (
                          <div className="space-y-3 animate-fadeIn border-t border-neutral-900 pt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                {t("semantic_matches")} ({searchResults.length})
                              </span>
                              <button
                                onClick={() => {
                                  setSearchResults(null);
                                  setSemanticQuery("");
                                }}
                                className="text-[9px] text-neutral-650 hover:text-neutral-400 font-bold"
                              >
                                {t("clear_results")}
                              </button>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                              {searchResults.map((match: any, index: number) => (
                                <div key={index} className="p-3 border border-neutral-900 rounded bg-neutral-950/60 text-[11px] leading-relaxed">
                                  <div className="flex justify-between items-center mb-1 text-[9px] text-neutral-500">
                                    <span className="font-bold text-neutral-400">
                                      {t("match")} #{index + 1} (Score: {(match.similarity * 100).toFixed(1)}%)
                                    </span>
                                    <span>
                                      {t("source_type")}: {match.mime_type}
                                    </span>
                                  </div>
                                  <p className="text-neutral-300 whitespace-pre-wrap">
                                    {match.content}
                                  </p>
                                  <div className="text-[8px] text-neutral-600 mt-1 border-t border-neutral-900/40 pt-1">
                                    SOURCE FILE: {match.original_filename}
                                  </div>
                                </div>
                              ))}
                              {searchResults.length === 0 && (
                                <p className="text-center py-6 text-xs text-neutral-600">
                                  {t("no_semantic_matches")}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* EXTRACTED ENTITIES & AUTOMATED TIMELINE (1 COL) */}
                    <div className="space-y-6">
                      {/* ENTITIES CARD */}
                      <div className="border border-neutral-900 rounded-lg p-5 bg-black/60 font-mono">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-2">
                          {t("extracted_entities")}
                        </h3>
                        <p className="text-[9px] text-neutral-500 leading-relaxed mb-4">
                          {t("extracted_entities_desc")}
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {aiInsights.entities.map((ent) => (
                            <button
                              key={ent.id}
                              onClick={() =>
                                setSelectedEntityFilter(
                                  selectedEntityFilter === ent.entity_value ? null : ent.entity_value
                                )
                              }
                              className={`px-2 py-0.5 rounded text-[8px] font-semibold border transition-all cursor-pointer ${
                                selectedEntityFilter === ent.entity_value
                                  ? "bg-white border-white text-black font-bold"
                                  : "bg-neutral-950 border-neutral-850 text-neutral-400 hover:border-neutral-700 hover:text-white"
                              }`}
                            >
                              {ent.entity_value}
                              <span className="text-[7px] opacity-60 ml-1 font-mono uppercase">
                                ({ent.entity_type.substring(0, 3)})
                              </span>
                            </button>
                          ))}
                          {aiInsights.entities.length === 0 && (
                            <p className="text-[10px] text-neutral-600 italic py-3">
                              {t("entities_placeholder")}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* AUTOMATED TIMELINE EVENTS */}
                      <div className="border border-neutral-900 rounded-lg p-5 bg-black/60 font-mono">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-1">
                          {t("automated_timeline_title")}
                        </h3>
                        <p className="text-[9px] text-neutral-500 leading-relaxed mb-4">
                          {t("automated_timeline_desc")}
                        </p>

                        {isAiLoading && !aiInsights.timeline.length ? (
                          <div className="py-8 text-center text-neutral-600 text-xs">
                            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
                            <span>{t("analyzing")}</span>
                          </div>
                        ) : aiInsights.timeline.length ? (
                          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                            {aiInsights.timeline
                              .filter((e) => {
                                if (!selectedEntityFilter) return true;
                                return e.description.toLowerCase().includes(selectedEntityFilter.toLowerCase());
                              })
                              .map((ev) => (
                                <div key={ev.id} className="p-3 border border-neutral-900 rounded bg-neutral-950/40 text-[10px] leading-relaxed">
                                  <div className="text-[8px] text-neutral-500 mb-1 flex justify-between">
                                    <span className="font-bold">{ev.event_timestamp}</span>
                                    <span className="uppercase">Conf: {ev.confidence}</span>
                                  </div>
                                  <p className="text-neutral-300">{ev.description}</p>
                                </div>
                              ))}
                            {aiInsights.timeline.filter((e) => {
                              if (!selectedEntityFilter) return true;
                              return e.description.toLowerCase().includes(selectedEntityFilter.toLowerCase());
                            }).length === 0 && (
                              <p className="text-center py-6 text-neutral-600 text-xs">
                                {t("no_timeline_match")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-neutral-600 text-xs">
                            <p className="mb-2">{t("no_timeline_records")}</p>
                            <button
                              onClick={handleGenerateTimeline}
                              className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded hover:text-white"
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
        ) : (
          /* NO CASE SELECTED INTERACTIVE OVERLAY */
          <div className="flex-1 flex flex-col justify-center items-center p-8 text-center font-mono">
            <div className="max-w-md p-6 border border-neutral-900 bg-neutral-950/60 rounded-lg backdrop-blur shadow-[0_0_25px_rgba(0,0,0,0.8)]">
              <Shield className="w-8 h-8 text-neutral-550 mx-auto mb-4" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">{t("no_case_selected_title")}</h2>
              <p className="text-[10px] text-neutral-500 leading-relaxed mt-2">
                {t("no_case_selected_desc")}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 bg-white text-black font-bold rounded text-xs cursor-pointer hover:bg-neutral-200"
                >
                  {t("initialize_case_file")}
                </button>
                <button
                  onClick={handleSeedDemoCase}
                  className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-750 text-neutral-300 rounded text-xs cursor-pointer"
                >
                  {t("seed_demo_case")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM LEFT SETTINGS BAR */}
      <div className="absolute bottom-5 left-85 flex items-center space-x-6 z-30 font-mono text-[9px] text-neutral-500 bg-black/40 backdrop-blur-sm px-4 py-1.5 rounded border border-neutral-900/40">
        {/* CANVAS MODE TOGGLE (SHIFT button) */}
        <div className="flex items-center space-x-2">
          <span>SHIFT:</span>
          <button
            onClick={() => {
              if (canvasMode === "WIREFRAME") setCanvasMode("HALFTONE");
              else if (canvasMode === "HALFTONE") setCanvasMode("ORBITS");
              else setCanvasMode("WIREFRAME");
            }}
            className="px-2 py-0.5 bg-neutral-950 border border-neutral-850 hover:border-neutral-700 text-white rounded text-[8px] cursor-pointer tracking-wider font-bold"
          >
            {canvasMode}
          </button>
        </div>

        {/* REGIONAL LOCALIZATION DROPDOWN */}
        <div className="flex items-center space-x-2 border-l border-neutral-900 pl-4">
          <Globe className="w-3.5 h-3.5" />
          <button
            onClick={() => {
              const next = lang === "en" ? "hi" : lang === "hi" ? "te" : "en";
              setLang(next);
              localStorage.setItem("trace_lang", next);
            }}
            className="px-2 py-0.5 bg-neutral-950 border border-neutral-850 hover:border-neutral-700 text-white rounded text-[8px] cursor-pointer tracking-wider font-bold uppercase"
          >
            {lang === "en" ? "English" : lang === "hi" ? "हिंदी" : "తెలుగు"}
          </button>
        </div>
      </div>

      {/* 1. INITIALIZE NEW CASE DIALOG MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-850 rounded-lg p-6 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-900 pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">{t("open_new_case")}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("ref_id_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CRIM-2026-X89"
                  value={createForm.reference_id}
                  onChange={(e) => setCreateForm({ ...createForm, reference_id: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                />
              </div>
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("case_title_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operation Phantom Exfil"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                />
              </div>
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("scope_abstract_label")}
                </label>
                <textarea
                  rows={3}
                  placeholder="Investigative abstract detailed scope of collection..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white text-black font-bold rounded cursor-pointer hover:bg-neutral-200"
                >
                  {t("initialize_case_file")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. TRANSFER CUSTODY DIALOG MODAL */}
      {isTransferModalOpen && transferTargetEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-850 rounded-lg p-6 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-900 pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">{t("transfer_custody_log")}</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-neutral-450 mb-4">
              {t("logging_custody_for")}: <span className="text-white font-bold">{transferTargetEvidence.original_filename}</span>
            </p>
            <form onSubmit={handleTransferCustody} className="space-y-4">
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("recipient_identity_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Officer Miller"
                  value={transferForm.recipient}
                  onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                />
              </div>
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("reason_for_transfer_label")}
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Forensic analysis laboratory relocation, evidence locker storage..."
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white text-black font-bold rounded cursor-pointer hover:bg-neutral-200"
                >
                  {t("log_custody_transfer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. SETTINGS & PARAMETERS CONFIGURATION DRAWER */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-850 rounded-lg p-6 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-900 pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center space-x-2">
                <Settings className="w-4 h-4 text-indigo-400" />
                <span>{t("settings_title")}</span>
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={saveConfiguration} className="space-y-4">
              {/* Language Selection */}
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("language_label")}
                </label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-250 font-semibold"
                >
                  <option value="en">English (US)</option>
                  <option value="hi">हिंदी (Hindi)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                </select>
              </div>

              {/* AI Provider Config */}
              <div>
                <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                  {t("ai_provider_label")}
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-250 font-semibold"
                >
                  <option value="gemini">Google Gemini API (BYOK)</option>
                  <option value="ollama">Local AI Inference (Ollama)</option>
                </select>
              </div>

              {/* BYOK: Gemini API Key */}
              {aiProvider === "gemini" && (
                <div className="animate-fadeIn">
                  <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>{t("gemini_key_label")}</span>
                    <span className="text-[8px] text-indigo-400 normal-case font-normal">(Tokens stored locally)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-200"
                  />
                </div>
              )}

              {/* Local AI inference parameters */}
              {aiProvider === "ollama" && (
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                      {t("ollama_host_label")}
                    </label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434"
                      value={ollamaHost}
                      onChange={(e) => setOllamaHost(e.target.value)}
                      className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-250 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                        {t("ollama_model_label")}
                      </label>
                      <input
                        type="text"
                        placeholder="llama3"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-250 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-500 font-bold uppercase tracking-wider mb-1">
                        {t("ollama_embed_model_label")}
                      </label>
                      <input
                        type="text"
                        placeholder="nomic-embed-text"
                        value={ollamaEmbedModel}
                        onChange={(e) => setOllamaEmbedModel(e.target.value)}
                        className="w-full bg-black border border-neutral-900 rounded p-2 focus:outline-none focus:border-neutral-700 text-neutral-250 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4 border-t border-neutral-900">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-350 rounded cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white text-black font-bold rounded cursor-pointer hover:bg-neutral-200"
                >
                  {t("save_settings")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIGURATION SAVED ALERT TOAST */}
      {showSavedAlert && (
        <div className="fixed bottom-5 right-5 z-50 bg-neutral-950 border border-neutral-700 text-white px-4 py-2.5 rounded font-mono text-xs shadow-lg flex items-center space-x-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-500 animate-bounce" />
          <span>{t("settings_saved_alert")}</span>
        </div>
      )}
    </div>
  );
}
