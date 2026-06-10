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
  User
} from "lucide-react";

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

export default function App() {
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
  const [activeTab, setActiveTab] = useState<"catalog" | "timeline">("catalog");
  const [showSimulationPanel, setShowSimulationPanel] = useState(false);

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

  // Fetch all cases on mount
  useEffect(() => {
    fetchCases();
  }, []);

  // Fetch case details when selectedCaseId changes
  useEffect(() => {
    if (selectedCaseId) {
      fetchCaseDetails(selectedCaseId);
      setAuditResult(null);
      setHasAudited(false);
    } else {
      setCaseDetails(null);
    }
  }, [selectedCaseId]);

  const fetchCases = async () => {
    try {
      const res = await fetch("/api/cases");
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
      const res = await fetch(`/api/cases/${caseId}`);
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
      const res = await fetch("/api/cases", {
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
      const res = await fetch(`/api/evidence/${transferTargetEvidence.id}/transfer`, {
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
      const res = await fetch(`/api/cases/${selectedCaseId}/verify`, { method: "POST" });
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
      const res = await fetch(`/api/cases/${selectedCaseId}/evidence`, {
        method: "POST",
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
      const res = await fetch("/api/simulate/tamper-file", {
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
      const res = await fetch("/api/simulate/tamper-db-hash", {
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
      const res = await fetch("/api/simulate/tamper-log-chain", {
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
      const res = await fetch("/api/simulate/restore", {
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatBytes = (bytes: number | string) => {
    const num = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return "0 B";
    if (num === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
          bgColor: "bg-sky-500/10 border-sky-500/30",
          textColor: "text-sky-400"
        };
      case "EVIDENCE_UPLOADED":
        return {
          icon: <Upload className="w-4 h-4 text-emerald-400" />,
          bgColor: "bg-emerald-500/10 border-emerald-500/30",
          textColor: "text-emerald-400"
        };
      case "CUSTODY_TRANSFERRED":
        return {
          icon: <ArrowRightLeft className="w-4 h-4 text-amber-400" />,
          bgColor: "bg-amber-500/10 border-amber-500/30",
          textColor: "text-amber-400"
        };
      case "INTEGRITY_VERIFIED":
        return {
          icon: <ShieldCheck className="w-4 h-4 text-teal-400" />,
          bgColor: "bg-teal-500/10 border-teal-500/30",
          textColor: "text-teal-400"
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-slate-400" />,
          bgColor: "bg-slate-500/10 border-slate-500/30",
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
    <div className="flex h-screen bg-[#020617] text-slate-105 font-sans overflow-hidden">
      {/* 1. SIDEBAR */}
      <aside className="w-80 border-r border-slate-800 bg-[#070d1e] flex flex-col">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-emerald-400">T R A C E</h1>
              <p className="text-[10px] text-slate-500 tracking-tight">Forensic Custody Engine</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-800 bg-[#0b132b]/50">
          <label className="text-[10px] uppercase tracking-wider text-slate-550 font-semibold block mb-1">
            Current Investigator
          </label>
          <div className="flex items-center space-x-2 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800">
            <User className="w-4 h-4 text-emerald-400" />
            <input
              type="text"
              value={investigatorName}
              onChange={(e) => setInvestigatorName(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none w-full font-medium"
            />
          </div>
        </div>

        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search cases..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredCases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedCaseId === c.id
                  ? "bg-slate-900 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
                  : "bg-transparent border-slate-800 hover:bg-[#0c142b]/40 hover:border-slate-800"
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-mono text-emerald-450 font-semibold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                  {c.reference_id}
                </span>
                <span className="text-[10px] text-slate-550">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-200 line-clamp-1">{c.title}</h3>
              <p className="text-xs text-slate-500 line-clamp-1 mt-1">{c.description || "No description"}</p>
            </button>
          ))}
          {filteredCases.length === 0 && (
            <div className="text-center py-8">
              <Folder className="w-8 h-8 text-slate-650 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No cases found</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 text-sm shadow-lg shadow-emerald-500/15"
          >
            <Plus className="w-4 h-4" />
            <span>Create Case File</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col bg-[#040815] overflow-hidden">
        {caseDetails ? (
          <>
            <header className="p-6 border-b border-slate-800 bg-[#070d1e]/80 backdrop-blur flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-1">
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {caseDetails.reference_id}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    Opened {new Date(caseDetails.created_at).toUTCString()}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-200">{caseDetails.title}</h2>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowSimulationPanel(!showSimulationPanel)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition-all ${
                    showSimulationPanel
                      ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-250 hover:bg-slate-800"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tamper Simulation</span>
                </button>

                <button
                  onClick={handleAuditCase}
                  disabled={isAuditLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-500/10"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? "animate-spin" : ""}`} />
                  <span>{isAuditLoading ? "Verifying..." : "Audit Case Integrity"}</span>
                </button>

                <a
                  href={`/api/cases/${caseDetails.id}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Export Report</span>
                </a>

                <a
                  href={`/api/cases/${caseDetails.id}/bundle`}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-indigo-600/15"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Archive</span>
                </a>
              </div>
            </header>

            {hasAudited && auditResult && (
              <div
                className={`px-6 py-4 flex items-center justify-between border-b transition-all ${
                  auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED")
                    ? "bg-emerald-950/20 border-emerald-900/35 text-emerald-400"
                    : "bg-rose-950/20 border-rose-900/35 text-rose-450"
                }`}
              >
                <div className="flex items-center space-x-3">
                  {auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED") ? (
                    <>
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <div>
                        <h4 className="text-sm font-semibold">Verification Audit Passed</h4>
                        <p className="text-xs text-emerald-500/85">
                          The cryptographic hash-chain matches database records and all files on disk are fully intact and unaltered.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-450 animate-pulse" />
                      <div>
                        <h4 className="text-sm font-bold">CRITICAL WARNING: Integrity Compromised</h4>
                        <p className="text-xs text-rose-500/85">
                          {!auditResult.chain_integrity
                            ? "Hash Chain Linkage Broken: Historical entries in the database custody log have been altered."
                            : "Forensic Evidence Modified: Disk file hashes do not match database verification snapshots."}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="text-xs font-semibold uppercase tracking-wider bg-slate-905/50 border px-3 py-1 rounded-lg">
                  {auditResult.chain_integrity && auditResult.evidence_status.every((e) => e.status === "VERIFIED")
                    ? "Verified Secure"
                    : "TAMPER DETECTED"}
                </div>
              </div>
            )}

            <div className="px-6 border-b border-slate-800 bg-[#070d1e]/20 flex justify-between items-center">
              <div className="flex space-x-6">
                <button
                  onClick={() => setActiveTab("catalog")}
                  className={`py-3 text-sm font-semibold border-b-2 transition-all ${
                    activeTab === "catalog"
                      ? "border-emerald-500 text-emerald-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Evidence Catalog ({decoratedEvidence.length})
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`py-3 text-sm font-semibold border-b-2 transition-all ${
                    activeTab === "timeline"
                      ? "border-emerald-500 text-emerald-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Audit Timeline ({caseDetails.logs.length})
                </button>
              </div>

              {showSimulationPanel && (
                <div className="flex items-center space-x-2 py-2">
                  <span className="text-xs font-medium text-rose-400">Simulation Enabled</span>
                  <button
                    onClick={restoreCaseIntegrity}
                    className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 px-3 py-1 rounded-lg flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-450" />
                    <span>Restore Originals</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === "catalog" ? (
                  <div className="space-y-6">
                    <div className="bg-[#0b132b]/20 p-5 rounded-2xl border border-slate-800">
                      <h3 className="text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">
                        Investigative Abstract
                      </h3>
                      <p className="text-sm text-slate-300 leading-relaxed font-medium">
                        {caseDetails.description || "No summary provided for this investigation case file."}
                      </p>
                      <div className="grid grid-cols-2 gap-4 mt-4 text-xs text-slate-500 border-t border-slate-800 pt-4 font-medium">
                        <div>
                          <span className="block font-semibold">Created By:</span>
                          <span className="text-slate-400">{caseDetails.created_by}</span>
                        </div>
                        <div>
                          <span className="block font-semibold">Case Reference Code:</span>
                          <span className="font-mono text-emerald-400">{caseDetails.reference_id}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                        dragActive
                          ? "border-emerald-500 bg-emerald-500/5 scale-[0.99]"
                          : "border-slate-800 hover:border-slate-700 bg-[#070d1e]/10"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Upload className="w-10 h-10 text-emerald-450 mx-auto mb-3 animate-bounce" />
                      <h4 className="text-sm font-semibold text-slate-200">
                        Drag and drop digital evidence file here
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 mb-4 font-medium">
                        Files will be cryptographically hashed and appended to immutable custody database records.
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350 px-4 py-2 rounded-xl text-xs font-bold"
                      >
                        {isUploading ? "Uploading..." : "Select File"}
                      </button>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-slate-450 uppercase tracking-wider mb-4">
                        Secure Evidence Records ({decoratedEvidence.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {decoratedEvidence.map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-5 rounded-2xl border bg-slate-900/40 relative overflow-hidden transition-all ${
                              ev.status === "VERIFIED"
                                ? "border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.04)] glow-emerald"
                                : ev.status === "TAMPERED"
                                ? "border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.04)] glow-rose"
                                : ev.status === "MISSING"
                                ? "border-amber-500/25"
                                : "border-slate-800"
                            }`}
                          >
                            <div className="flex items-start space-x-4">
                              <div className="p-3 bg-[#0a1228] rounded-xl border border-slate-800">
                                {getMimeIcon(ev.mime_type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-slate-200 truncate" title={ev.original_filename}>
                                  {ev.original_filename}
                                </h4>
                                <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1 font-medium">
                                  <span>{formatBytes(ev.file_size_bytes)}</span>
                                  <span>•</span>
                                  <span>{ev.mime_type}</span>
                                </div>
                              </div>

                              {ev.status && (
                                <div className="absolute top-4 right-4">
                                  <span
                                    className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${
                                      ev.status === "VERIFIED"
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                        : ev.status === "TAMPERED"
                                        ? "bg-rose-500/10 border-rose-500/25 text-rose-450"
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-450"
                                    }`}
                                  >
                                    {ev.status}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 p-2 bg-slate-950/70 border border-slate-900 rounded-lg flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-[9px] font-semibold text-slate-550 uppercase block tracking-wider">
                                  SHA-256 HASH
                                </span>
                                <span className="font-mono text-[10px] text-slate-400 truncate block">
                                  {ev.sha256_hash}
                                </span>
                              </div>
                              <button
                                onClick={() => copyToClipboard(ev.sha256_hash)}
                                className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-900 ml-2 flex-shrink-0"
                                title="Copy full SHA-256 hash"
                              >
                                {copiedHash === ev.sha256_hash ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {ev.status === "TAMPERED" && ev.recalculated_hash && (
                              <div className="mt-2 p-2 bg-rose-950/10 border border-rose-950/30 rounded-lg">
                                <span className="text-[9px] font-bold text-rose-455 uppercase block tracking-wider">
                                  Recalculated Hash on server:
                                </span>
                                <span className="font-mono text-[10px] text-rose-500 truncate block">
                                  {ev.recalculated_hash}
                                </span>
                              </div>
                            )}

                            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 font-medium">
                              <span className="text-[10px] text-slate-500">
                                Uploaded by: <span className="text-slate-400">{ev.uploaded_by}</span>
                              </span>
                              <button
                                onClick={() => {
                                  setTransferTargetEvidence(ev);
                                  setIsTransferModalOpen(true);
                                }}
                                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-500 flex items-center space-x-1"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>Transfer Custody</span>
                              </button>
                            </div>

                            {showSimulationPanel && (
                              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-rose-950/30 pt-3">
                                <button
                                  onClick={() => simulateFileTampering(ev.id)}
                                  className="bg-rose-950/30 border border-rose-900/40 hover:bg-rose-950/50 text-rose-400 text-[10px] font-semibold py-1 px-2 rounded-lg flex items-center justify-center space-x-1"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Tamper Disk File</span>
                                </button>
                                <button
                                  onClick={() => simulateDbHashTampering(ev.id)}
                                  className="bg-rose-950/30 border border-rose-900/40 hover:bg-rose-950/50 text-rose-400 text-[10px] font-semibold py-1 px-2 rounded-lg flex items-center justify-center space-x-1"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>Tamper DB Hash</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {decoratedEvidence.length === 0 && (
                        <div className="text-center py-12 border border-slate-800 rounded-2xl bg-slate-900/10">
                          <Folder className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                          <h4 className="text-sm font-semibold text-slate-400">Empty Evidence Room</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            Drag and drop forensic digital files to begin securing evidence hashes.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 max-w-3xl mx-auto">
                    <div className="bg-[#0b132b]/20 p-5 rounded-2xl border border-slate-800 flex items-center space-x-4">
                      <ShieldCheck className="w-8 h-8 text-emerald-450 flex-shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">Linked Chain-of-Custody Verification</h3>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium leading-relaxed">
                          Each event log calculates a SHA-256 block hash incorporating the content details, actor identity, and the cryptographic hash of the previous log record.
                        </p>
                      </div>
                    </div>

                    <div className="relative border-l border-slate-800 ml-4 pl-8 space-y-8 py-2">
                      {caseDetails.logs.map((log) => {
                        const style = getActionStyles(log.action_type);
                        const isTampered =
                          hasAudited && auditResult?.chain_integrity === false && auditResult?.chain_error_at === log.id;

                        return (
                          <div key={log.id} className="relative">
                            <div
                              className={`absolute -left-[41px] top-1 p-2 rounded-full border bg-slate-950 flex items-center justify-center shadow-lg transition-all ${
                                isTampered ? "border-rose-500 bg-rose-950/20" : style.bgColor
                              }`}
                            >
                              {isTampered ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : style.icon}
                            </div>

                            <div
                              className={`p-5 rounded-2xl border bg-[#050b18]/60 transition-all ${
                                isTampered
                                  ? "border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.06)]"
                                  : "border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <span
                                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                      isTampered ? "bg-rose-500/15 border-rose-500/30 text-rose-455" : style.bgColor
                                    }`}
                                  >
                                    {log.action_type}
                                  </span>
                                  <h4 className="text-xs text-slate-450 mt-2 font-semibold">
                                    Actor: <span className="font-bold text-slate-250">{log.actor}</span>
                                  </h4>
                                </div>
                                <span className="text-[10px] text-slate-550 font-bold">
                                  {new Date(log.created_at).toUTCString()}
                                </span>
                              </div>

                              <p className="text-sm text-slate-350 leading-relaxed font-semibold mb-4">
                                {log.details || "No transaction remarks."}
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-805 text-[10px] font-semibold">
                                <div>
                                  <span className="block font-semibold text-slate-550 uppercase tracking-wider">
                                    Previous Log Block Hash
                                  </span>
                                  <span className="font-mono text-slate-450 block truncate" title={log.prev_log_hash}>
                                    {log.prev_log_hash}
                                  </span>
                                </div>
                                <div>
                                  <span className="block font-semibold text-slate-550 uppercase tracking-wider">
                                    Current Log Block Hash (Hn)
                                  </span>
                                  <span
                                    className={`font-mono block truncate ${
                                      isTampered ? "text-rose-450 font-bold" : "text-emerald-400"
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
                                    className="bg-rose-950/20 border border-rose-900/40 hover:bg-rose-950/40 text-rose-400 text-[10px] font-semibold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Alter Log Details</span>
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
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#02050e]/50">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                <Folder className="w-12 h-12" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/20 text-emerald-400">
                <Shield className="w-6 h-6" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-200">No Forensic Case Selected</h2>
            <p className="text-sm text-slate-500 max-w-sm mt-2 mb-6 leading-relaxed font-semibold">
              Select an ongoing digital investigation from the sidebar list, or initialize a new case file structure to upload evidence.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold py-2 px-6 rounded-xl flex items-center space-x-2 text-sm shadow-lg shadow-emerald-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>Open New Case</span>
            </button>
          </div>
        )}
      </main>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-200 mb-4">Initialize Forensic Case File</h3>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Reference ID (e.g. Case Number) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LAB-2026-004A"
                  value={createForm.reference_id}
                  onChange={(e) => setCreateForm({ ...createForm, reference_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Case Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Corporate Exfiltration Analysis"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Scope / Investigation Abstract
                </label>
                <textarea
                  placeholder="Provide scope, background, and specific hardware or source details."
                  rows={4}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/10"
                >
                  Create Case File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTransferModalOpen && transferTargetEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-200 mb-2 flex items-center space-x-2">
              <ArrowRightLeft className="w-5 h-5 text-amber-400" />
              <span>Transfer Custody Log</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Logging custody change for: <span className="font-mono text-emerald-450 font-bold">{transferTargetEvidence.original_filename}</span>
            </p>
            <form onSubmit={handleTransferCustody} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Recipient Identity (e.g. Officer, Analyst) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Analyst Jessica Beta"
                  value={transferForm.recipient}
                  onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Reason for Transfer *
                </label>
                <textarea
                  required
                  placeholder="e.g. Relocating to secure lab vault for magnetic storage imaging."
                  rows={3}
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferTargetEvidence(null);
                  }}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/10"
                >
                  Log Custody Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
