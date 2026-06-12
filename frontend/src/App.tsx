import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Folder, 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  CornerDownRight, 
  Download, 
  Search, 
  RefreshCw, 
  Plus, 
  Globe, 
  Activity, 
  Cpu, 
  Link as LinkIcon,
  Shield,
  Eye,
  ChevronRight,
  Hash,
  Clock,
  User,
  X,
  ArrowRight,
  Zap,
  Layers,
  Lock,
  Fingerprint,
  Terminal,
  Sparkles,
  ChevronDown,
  Settings
} from 'lucide-react';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ParticleSystem, BackgroundShader } from './components/Scene';
import LandingPage from './components/LandingPage';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ─────────────────────────────────────────
// Language translation dictionary
// ─────────────────────────────────────────
const UI_TRANSLATIONS = {
  en: {
    brand: "TRACE",
    subtitle: "Evidence Integrity & Custody Chain Platform",
    casesTitle: "ACTIVE CASES",
    searchPlaceholder: "Search cases...",
    initCase: "INIT CASE",
    utcClock: "UTC",
    localClock: "LOCAL",
    refId: "Reference ID",
    createdBy: "Created By",
    createdAt: "Created At",
    auditIntegrity: "AUDIT INTEGRITY",
    exportReport: "EXPORT PDF",
    downloadBundle: "DOWNLOAD ZIP",
    evidenceTitle: "INGESTED EVIDENCE",
    dropzoneText: "DRAG & DROP EVIDENCE",
    browseFiles: "or click to browse files",
    verifyFile: "VERIFY",
    transferCustody: "TRANSFER",
    timelineTab: "CUSTODY CHAIN",
    aiAdvisoryTab: "AI ADVISORY",
    searchTab: "SEMANTIC SEARCH",
    aiSummary: "AI Case Summary",
    regenerate: "REGENERATE",
    extractedEntities: "Extracted Entities",
    suggestedTimeline: "AI Advisory Timeline",
    searchPrompt: "Query evidence semantics...",
    searchButton: "SEARCH",
    verifyTitle: "Verify Evidence",
    statusVerified: "VERIFIED",
    statusTampered: "TAMPERED",
    statusMissing: "MISSING",
    chainIntact: "CRYPTOGRAPHIC CHAIN INTACT",
    chainBroken: "CHAIN COMPROMISED",
    loading: "PROCESSING...",
    creator: "Creator Name",
    refIdLabel: "Ref ID (alphanumeric, 3-20 chars)",
    titleLabel: "Case Title",
    descLabel: "Description",
    cancel: "CANCEL",
    submit: "INITIALIZE",
    transferTitle: "Transfer Custody",
    recipient: "Recipient Name",
    actor: "Actor (Transferring Person)",
    reason: "Reason for transfer",
    transferSubmit: "EXECUTE TRANSFER",
    gameTitle: "LIGHTS OUT REACTION",
    gameIntro: "Press SHIFT or click to start. React when screen flashes green!",
    gameWait: "WAIT FOR GREEN...",
    gameClick: "PRESS NOW!!!",
    gameResult: "Reaction Time",
    gameTooEarly: "TOO EARLY! Wait for the flash.",
    noCaseSelected: "Select a case from the sidebar or create a new one to begin.",
    heroTitle: "TRACE DASHBOARD",
    heroDesc: "Tamper-Resistant Audit Chain for Evidence",
    caseCount: "cases",
    evidenceCount: "evidence files",
    newCase: "NEW CASE",
    systemOnline: "SYSTEM ONLINE",
    loadDemo: "LOAD DEMO",
    generating: "GENERATING...",
    noCasesFound: "No cases found",
    game: "GAME"
  },
  hi: {
    brand: "ट्रेस",
    subtitle: "साक्ष्य अखंडता और हिरासत श्रृंखला मंच",
    casesTitle: "सक्रिय मामले",
    searchPlaceholder: "मामलों को खोजें...",
    initCase: "नया मामला",
    utcClock: "यूटीसी",
    localClock: "स्थानीय",
    refId: "संदर्भ आईडी",
    createdBy: "निर्माता",
    createdAt: "निर्माण तिथि",
    auditIntegrity: "अखंडता जांच",
    exportReport: "पीडीएफ रिपोर्ट",
    downloadBundle: "ज़िप डाउनलोड",
    evidenceTitle: "सहित साक्ष्य",
    dropzoneText: "साक्ष्य फ़ाइल खींचें और छोड़ें",
    browseFiles: "या ब्राउज़ करने के लिए क्लिक करें",
    verifyFile: "सत्यापित करें",
    transferCustody: "हस्तांतरण",
    timelineTab: "हिरासत श्रृंखला",
    aiAdvisoryTab: "एआई सलाहकार",
    searchTab: "सिमेंटिक खोज",
    aiSummary: "एआई मामला सारांश",
    regenerate: "पुनः उत्पन्न",
    extractedEntities: "निकाली गई संस्थाएं",
    suggestedTimeline: "एआई सलाहकार टाइमलाइन",
    searchPrompt: "सिमेंटिक खोज करें...",
    searchButton: "खोजें",
    verifyTitle: "साक्ष्य सत्यापित करें",
    statusVerified: "सत्यापित",
    statusTampered: "छेड़छाड़",
    statusMissing: "लापता",
    chainIntact: "क्रिप्टोग्राफिक श्रृंखला बरकरार",
    chainBroken: "श्रृंखला टूट गई",
    loading: "प्रसंस्करण...",
    creator: "निर्माता का नाम",
    refIdLabel: "संदर्भ आईडी (3-20 वर्ण)",
    titleLabel: "मामला शीर्षक",
    descLabel: "विवरण",
    cancel: "रद्द करें",
    submit: "आरंभ करें",
    transferTitle: "हिरासत हस्तांतरण",
    recipient: "प्राप्तकर्ता",
    actor: "हस्तांतरण करने वाला",
    reason: "कारण",
    transferSubmit: "हस्तांतरण करें",
    gameTitle: "लाइट्स आउट रिएक्शन",
    gameIntro: "शिफ्ट दबाएं या क्लिक करें। हरे रंग पर प्रतिक्रिया दें!",
    gameWait: "हरे की प्रतीक्षा...",
    gameClick: "अब दबाएं!!!",
    gameResult: "प्रतिक्रिया समय",
    gameTooEarly: "बहुत जल्दी!",
    noCaseSelected: "शुरू करने के लिए साइडबार से मामला चुनें या नया बनाएं।",
    heroTitle: "ट्रेस डैशबोर्ड",
    heroDesc: "साक्ष्य के लिए छेड़छाड़-प्रतिरोधी श्रृंखला",
    caseCount: "मामले",
    evidenceCount: "साक्ष्य फाइलें",
    newCase: "नया मामला",
    systemOnline: "सिस्टम ऑनलाइन",
    loadDemo: "डेमो लोड करें",
    generating: "उत्पन्न कर रहा है...",
    noCasesFound: "कोई मामला नहीं मिला",
    game: "गेम"
  },
  te: {
    brand: "ట్రేస్",
    subtitle: "సాక్ష్యం సమగ్రత & కస్టడీ గొలుసు వేదిక",
    casesTitle: "క్రియాశీల కేసులు",
    searchPlaceholder: "కేసుల కోసం వెతకండి...",
    initCase: "కొత్త కేసు",
    utcClock: "యుటిసి",
    localClock: "స్థానిక",
    refId: "రెఫరెన్స్ ఐడి",
    createdBy: "సృష్టికర్త",
    createdAt: "సృష్టించిన తేదీ",
    auditIntegrity: "సమగ్రత తనిఖీ",
    exportReport: "పిడిఎఫ్ నివేదిక",
    downloadBundle: "జిప్ డౌన్‌లోడ్",
    evidenceTitle: "సేకరించిన సాక్ష్యం",
    dropzoneText: "సాక్ష్యం ఫైల్ ఇక్కడ వదలండి",
    browseFiles: "లేదా క్లిక్ చేయండి",
    verifyFile: "ధృవీకరించు",
    transferCustody: "బదిలీ",
    timelineTab: "కస్టడీ గొలుసు",
    aiAdvisoryTab: "AI సలహా",
    searchTab: "సిమాంటిక్ శోధన",
    aiSummary: "AI కేసు సారాంశం",
    regenerate: "తిరిగి సృష్టించు",
    extractedEntities: "సేకరించిన సంస్థలు",
    suggestedTimeline: "AI సలహా టైమ్‌లైన్",
    searchPrompt: "సిమాంటిక్ శోధన చేయండి...",
    searchButton: "శోధించు",
    verifyTitle: "సాక్ష్యం ధృవీకరణ",
    statusVerified: "ధృవీకరించబడింది",
    statusTampered: "మార్చబడింది",
    statusMissing: "కనిపించట్లేదు",
    chainIntact: "గొలుసు సరిగ్గా ఉంది",
    chainBroken: "గొలుసు రాజీ పడింది",
    loading: "ప్రాసెస్ అవుతోంది...",
    creator: "సృష్టికర్త పేరు",
    refIdLabel: "రెఫరెన్స్ ఐడి (3-20 అక్షరాలు)",
    titleLabel: "కేసు శీర్షిక",
    descLabel: "వివరణ",
    cancel: "రద్దు",
    submit: "ప్రారంభించు",
    transferTitle: "కస్టడీ బదిలీ",
    recipient: "స్వీకర్త",
    actor: "బదిలీ చేసేవారు",
    reason: "కారణం",
    transferSubmit: "బదిలీ చేయి",
    gameTitle: "లైట్స్ అవుట్ రియాక్షన్",
    gameIntro: "షిఫ్ట్ నొక్కండి. ఆకుపచ్చగా మారినప్పుడు రియాక్ట్ చేయండి!",
    gameWait: "ఆకుపచ్చ కోసం వేచి ఉండండి...",
    gameClick: "ఇప్పుడు నొక్కండి!!!",
    gameResult: "ప్రతిచర్య సమయం",
    gameTooEarly: "చాలా త్వరగా!",
    noCaseSelected: "ప్రారంభించడానికి సైడ్‌బార్ నుండి కేసును ఎంచుకోండి.",
    heroTitle: "ట్రేస్ డాష్‌బోర్డ్",
    heroDesc: "సాక్ష్యం కోసం తారుమారు-నిరోధక గొలుసు",
    caseCount: "కేసులు",
    evidenceCount: "సాక్ష్యం ఫైళ్ళు",
    newCase: "కొత్త కేసు",
    systemOnline: "సిస్టమ్ ఆన్‌లైన్",
    loadDemo: "డెమో లోడ్ చేయండి",
    generating: "ఉత్పత్తి చేస్తోంది...",
    noCasesFound: "కేసులు కనుగొనబడలేదు",
    game: "ఆట"
  }
};

// ─────────────────────────────────────────
// Main App Component
// ─────────────────────────────────────────
export default function App() {
  const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(false);
  const [lang, setLang] = useState<'en' | 'hi' | 'te'>('en');
  const [cases, setCases] = useState<any[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeCase, setActiveCase] = useState<any | null>(null);
  
  // Case search filter
  const [caseSearch, setCaseSearch] = useState<string>('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  
  // Modal Fields
  const [newCaseRef, setNewCaseRef] = useState<string>('');
  const [newCaseTitle, setNewCaseTitle] = useState<string>('');
  const [newCaseDesc, setNewCaseDesc] = useState<string>('');
  const [newCaseCreator, setNewCaseCreator] = useState<string>('');
  
  const [transferRecipient, setTransferRecipient] = useState<string>('');
  const [transferActor, setTransferActor] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  const [uploadedBy, setUploadedBy] = useState<string>('Sarah Jenkins');

  // AI & Tab states
  const [activeTab, setActiveTab] = useState<'timeline' | 'ai' | 'search'>('timeline');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState<boolean>(false);
  const [aiEntities, setAiEntities] = useState<any[]>([]);
  const [aiTimeline, setAiTimeline] = useState<any[]>([]);
  const [semanticSearchQuery, setSemanticSearchQuery] = useState<string>('');
  const [semanticSearchResults, setSemanticSearchResults] = useState<any[]>([]);
  const [semanticSearchLoading, setSemanticSearchLoading] = useState<boolean>(false);

  // File Upload states
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verification states
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [fileVerifyStatus, setFileVerifyStatus] = useState<Record<string, { status: string; message: string }>>({});

  // BYOK Settings
  const [hasSeenSetup, setHasSeenSetup] = useState<boolean>(localStorage.getItem('hasSeenSetup') === 'true');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(!localStorage.getItem('hasSeenSetup'));
  const [geminiApiKey, setGeminiApiKey] = useState<string>(localStorage.getItem('geminiApiKey') || '');
  const [useLocalAI, setUseLocalAI] = useState<boolean>(localStorage.getItem('useLocalAI') === 'true');
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>(localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState<string>(localStorage.getItem('ollamaModel') || 'llama3');

  useEffect(() => {
    localStorage.setItem('hasSeenSetup', String(hasSeenSetup));
    localStorage.setItem('geminiApiKey', geminiApiKey);
    localStorage.setItem('useLocalAI', String(useLocalAI));
    localStorage.setItem('ollamaEndpoint', ollamaEndpoint);
    localStorage.setItem('ollamaModel', ollamaModel);
  }, [hasSeenSetup, geminiApiKey, useLocalAI, ollamaEndpoint, ollamaModel]);

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (geminiApiKey) headers.set('x-gemini-key', geminiApiKey);
    if (useLocalAI) headers.set('x-use-local-ai', 'true');
    if (ollamaEndpoint) headers.set('x-ollama-endpoint', ollamaEndpoint);
    if (ollamaModel) headers.set('x-ollama-model', ollamaModel);
    
    return fetch(url, { ...options, headers });
  };

  // Translation cache
  const [translatedContent, setTranslatedContent] = useState<Record<string, string>>({});

  // Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Sidebar collapsed on mobile
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Custom language dropdown
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // Demo generation
  const [demoLoading, setDemoLoading] = useState(false);
  const [showDemoPrompt, setShowDemoPrompt] = useState(false);
  const [casesLoaded, setCasesLoaded] = useState(false);

  // Lights Out timing game
  const [gameMode, setGameMode] = useState<boolean>(false);
  const [gameState, setGameState] = useState<'idle' | 'waiting' | 'flash' | 'result'>('idle');
  const [gameResultTime, setGameResultTime] = useState<number | null>(null);
  const [gameFlashColor, setGameFlashColor] = useState<boolean>(false);
  const gameTimeoutRef = useRef<any>(null);
  const gameStartTimeRef = useRef<number>(0);

  // Page load animation trigger
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const t = UI_TRANSLATIONS[lang];

  // ─── Clock ──────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Fetch Cases ────────────────────────
  const fetchCases = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cases`);
      const data = await res.json();
      if (data.success) {
        setCases(data.data);
        setCasesLoaded(true);
        // Show demo prompt if no cases exist
        if (data.data.length === 0) {
          setShowDemoPrompt(true);
        }
      }
    } catch (e) { console.error('Error fetching cases:', e); }
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // ─── Generate Demo Data ─────────────────
  const handleGenerateDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/demo`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setShowDemoPrompt(false);
        await fetchCases();
        setActiveCaseId(data.data.case_id);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      console.error('Demo generation failed:', e);
    }
    setDemoLoading(false);
  };

  // ─── Fetch Active Case ──────────────────
  const fetchCaseDetails = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/cases/${id}`);
      const data = await res.json();
      if (data.success) {
        setActiveCase(data.data);
        setAuditResult(null);
        setFileVerifyStatus({});
        setTranslatedContent({});
        fetchCaseAiData(id);
      }
    } catch (e) { console.error('Error fetching case details:', e); }
  }, []);

  useEffect(() => {
    if (activeCaseId) fetchCaseDetails(activeCaseId);
    else setActiveCase(null);
  }, [activeCaseId, fetchCaseDetails]);

  const fetchCaseAiData = async (caseId: string) => {
    try {
      const entRes = await apiFetch(`${API_BASE}/cases/${caseId}/entities`);
      const entData = await entRes.json();
      if (entData.success) setAiEntities(entData.data);

      const timelineRes = await apiFetch(`${API_BASE}/cases/${caseId}/timeline-ai`);
      const timelineData = await timelineRes.json();
      if (timelineData.success) setAiTimeline(timelineData.data);

      setAiSummaryLoading(true);
      const sumRes = await apiFetch(`${API_BASE}/cases/${caseId}/summary`);
      const sumData = await sumRes.json();
      if (sumData.success) setAiSummary(sumData.data.summary_text);
      setAiSummaryLoading(false);
    } catch (e) {
      console.error('Error fetching AI insights:', e);
      setAiSummaryLoading(false);
    }
  };

  // ─── Game Logic ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        if (gameMode) handleGameTrigger();
        else { setGameMode(true); setGameState('idle'); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameMode, gameState]);

  const handleGameTrigger = () => {
    if (gameState === 'idle') {
      setGameState('waiting');
      const delay = 1000 + Math.random() * 3000;
      gameTimeoutRef.current = setTimeout(() => {
        setGameState('flash');
        setGameFlashColor(true);
        gameStartTimeRef.current = Date.now();
      }, delay);
    } else if (gameState === 'waiting') {
      clearTimeout(gameTimeoutRef.current);
      setGameState('result');
      setGameResultTime(-1);
    } else if (gameState === 'flash') {
      const reaction = Date.now() - gameStartTimeRef.current;
      setGameState('result');
      setGameResultTime(reaction);
      setGameFlashColor(false);
    } else if (gameState === 'result') {
      setGameState('idle');
      setGameResultTime(null);
    }
  };

  // ─── CRUD Handlers ──────────────────────
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseRef || !newCaseTitle || !newCaseCreator) return;
    try {
      const res = await apiFetch(`${API_BASE}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_id: newCaseRef, title: newCaseTitle, description: newCaseDesc, created_by: newCaseCreator })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewCaseRef(''); setNewCaseTitle(''); setNewCaseDesc(''); setNewCaseCreator('');
        fetchCases();
        setActiveCaseId(data.data.id);
      } else { alert('Error: ' + data.error); }
    } catch (err) { console.error(err); }
  };

  const handleTransferCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidenceId || !transferActor || !transferRecipient || !transferReason) return;
    try {
      const res = await apiFetch(`${API_BASE}/evidence/${selectedEvidenceId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: transferActor, recipient: transferRecipient, reason: transferReason })
      });
      const data = await res.json();
      if (data.success) {
        setShowTransferModal(false);
        setTransferActor(''); setTransferRecipient(''); setTransferReason('');
        if (activeCaseId) fetchCaseDetails(activeCaseId);
      } else { alert('Error: ' + data.error); }
    } catch (err) { console.error(err); }
  };

  const handleAuditCase = async () => {
    if (!activeCaseId) return;
    setAuditLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/cases/${activeCaseId}/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setAuditResult(data.data);
    } catch (e) { console.error('Audit failed:', e); }
    setAuditLoading(false);
  };

  const handleVerifyEvidence = async (evidenceId: string) => {
    setFileVerifyStatus(prev => ({ ...prev, [evidenceId]: { status: 'LOADING', message: 'Verifying...' } }));
    try {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFileVerifyStatus(prev => ({ ...prev, [evidenceId]: { status: data.data.fileStatus, message: data.data.message } }));
        if (activeCaseId) {
          const detailRes = await apiFetch(`${API_BASE}/cases/${activeCaseId}`);
          const detailData = await detailRes.json();
          if (detailData.success) setActiveCase(detailData.data);
        }
      }
    } catch (e) {
      console.error(e);
      setFileVerifyStatus(prev => ({ ...prev, [evidenceId]: { status: 'ERROR', message: 'API failed.' } }));
    }
  };

  const handleProcessEvidenceAI = async (evidenceId: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/process`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => { if (activeCaseId) fetchCaseAiData(activeCaseId); }, 3000);
      }
    } catch (e) { console.error(e); }
  };

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCaseId || !semanticSearchQuery) return;
    setSemanticSearchLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: activeCaseId, query: semanticSearchQuery })
      });
      const data = await res.json();
      if (data.success) setSemanticSearchResults(data.data);
    } catch (err) { console.error(err); }
    setSemanticSearchLoading(false);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeCaseId) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
  };

  const uploadFile = async (file: File) => {
    setUploadLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('uploaded_by', uploadedBy);
    try {
      const res = await apiFetch(`${API_BASE}/cases/${activeCaseId}/evidence`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        fetchCaseDetails(activeCaseId!);
        handleProcessEvidenceAI(data.data.id);
      } else { alert('Upload Error: ' + data.error); }
    } catch (err) { console.error(err); }
    setUploadLoading(false);
  };

  const handleRegenerateSummary = async () => {
    if (!activeCaseId) return;
    setAiSummaryLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/cases/${activeCaseId}/summary?regenerate=true`);
      const data = await res.json();
      if (data.success) setAiSummary(data.data.summary_text);
    } catch (e) { console.error(e); }
    setAiSummaryLoading(false);
  };

  // Translation helper
  const getTranslation = async (text: string, cacheKey: string) => {
    if (lang === 'en') return text;
    const key = `${lang}_${cacheKey}`;
    if (translatedContent[key]) return;
    try {
      const res = await apiFetch(`${API_BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang })
      });
      const data = await res.json();
      if (data.success) setTranslatedContent(prev => ({ ...prev, [key]: data.data.translated }));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (lang !== 'en' && activeCase) {
      if (activeCase.title) getTranslation(activeCase.title, `case_title_${activeCase.id}`);
      if (activeCase.description) getTranslation(activeCase.description, `case_desc_${activeCase.id}`);
      if (aiSummary) getTranslation(aiSummary, `summary_${activeCase.id}`);
      
      // Translate timeline
      aiTimeline.forEach(evt => {
        getTranslation(evt.title, `tl_title_${evt.id}`);
        getTranslation(evt.description, `tl_desc_${evt.id}`);
        getTranslation(evt.explanation, `tl_exp_${evt.id}`);
      });
      
      // Translate logs
      if (activeCase.logs) {
        activeCase.logs.forEach((log: any) => {
          getTranslation(log.action_type, `log_action_${log.id}`);
          getTranslation(log.actor, `log_actor_${log.id}`);
          if (log.details) getTranslation(log.details, `log_details_${log.id}`);
        });
      }
      
      // Translate entities
      aiEntities.forEach(ent => {
        getTranslation(ent.entity_type, `ent_type_${ent.id}`);
        getTranslation(ent.entity_value, `ent_val_${ent.id}`);
        if (ent.context_snippet) getTranslation(ent.context_snippet, `ent_ctx_${ent.id}`);
      });
      
      // Translate evidence
      if (activeCase.evidence) {
        activeCase.evidence.forEach((ev: any) => {
          getTranslation(ev.original_filename, `ev_name_${ev.id}`);
        });
      }
    }
  }, [lang, activeCase, aiSummary, aiTimeline, aiEntities]);

  const getLangClass = () => {
    if (lang === 'hi') return 'lang-hi';
    if (lang === 'te') return 'lang-te';
    return '';
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  
  const filteredCases = cases.filter(c => 
    c.title.toLowerCase().includes(caseSearch.toLowerCase()) || 
    c.reference_id.toLowerCase().includes(caseSearch.toLowerCase())
  );

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────


  return (
    <div className={`min-h-screen bg-brand-black text-brand-white ${getLangClass()}`}>
      
      {/* 3D Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <Canvas eventSource={document.body} camera={{ position: [0, 0, 5], fov: 75 }}>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} />
          
          <Suspense fallback={null}>
            <BackgroundShader />
            <ParticleSystem count={1500} />
          </Suspense>
        </Canvas>
      </div>

      {/* Main Content Container (relative overlay) */}
      <div className="relative z-10 w-full h-full min-h-screen overflow-hidden flex flex-col">
        {/* Noise texture overlay for premium feel */}
        <div className="noise-overlay" />
        
        {/* Background grid */}
        <div className="fixed inset-0 grid-bg pointer-events-none" />

        {/* ═══ LANDING PAGE OVERLAY ═══ */}
        {!hasEnteredApp && <LandingPage onEnter={() => setHasEnteredApp(true)} />}

      {/* ═══ HEADER ═══ */}
      <header className={`fixed top-0 left-0 right-0 z-50 glass-strong transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-brand-white/5 transition-colors"
            >
              <Layers className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Shield className="text-brand-blue w-5 h-5" />
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-green rounded-full animate-pulse" />
              </div>
              <span className="font-syne font-extrabold text-xl tracking-tight text-brand-white">
                {t.brand}
              </span>
            </div>
            <div className="hidden md:block h-4 w-px bg-brand-border ml-2" />
            <span className="hidden md:block text-[10px] text-brand-dim font-mono tracking-wider uppercase">
              {t.subtitle}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Clock */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-brand-dim">
              <Clock className="w-3 h-3 text-brand-blue" />
              <span>{pad(currentTime.getUTCHours())}<span className="animate-blink">:</span>{pad(currentTime.getUTCMinutes())} {t.utcClock}</span>
              <span className="text-brand-muted">|</span>
              <span className="text-brand-blue font-semibold">{pad(currentTime.getHours())}:{pad(currentTime.getMinutes())} {t.localClock}</span>
            </div>
            
            <div className="h-4 w-px bg-brand-border" />

            {/* Language picker — custom dropdown for proper font rendering */}
            <div className="relative">
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-white/[0.03] border border-brand-border hover:border-brand-border-active transition-all cursor-pointer"
              >
                <Globe className="w-3 h-3 text-brand-blue" />
                <span className="text-[10px] font-bold text-brand-white" style={{ fontFamily: lang === 'hi' ? '"Noto Sans Devanagari", sans-serif' : lang === 'te' ? '"Noto Sans Telugu", sans-serif' : '"Inter", sans-serif' }}>
                  {lang === 'en' ? 'EN' : lang === 'hi' ? 'हिंदी' : 'తెలుగు'}
                </span>
                <ChevronDown className={`w-3 h-3 text-brand-dim transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {langDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-36 rounded-xl border border-brand-border bg-brand-surface shadow-2xl overflow-hidden animate-slide-down">
                    {[
                      { code: 'en' as const, label: 'English', native: 'EN', font: '"Inter", sans-serif' },
                      { code: 'hi' as const, label: 'Hindi', native: 'हिंदी', font: '"Noto Sans Devanagari", sans-serif' },
                      { code: 'te' as const, label: 'Telugu', native: 'తెలుగు', font: '"Noto Sans Telugu", sans-serif' },
                    ].map(opt => (
                      <button
                        key={opt.code}
                        onClick={() => { setLang(opt.code); setLangDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all cursor-pointer
                          ${lang === opt.code ? 'bg-brand-blue/10 text-brand-blue' : 'text-brand-white hover:bg-brand-white/[0.05]'}
                        `}
                      >
                        <span className="text-[11px] font-medium">{opt.label}</span>
                        <span className="text-[11px] font-bold" style={{ fontFamily: opt.font }}>{opt.native}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Settings toggle */}
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-white/[0.03] border border-brand-border hover:border-brand-border-active transition-all cursor-pointer"
              title="AI Settings & BYOK"
            >
              <Settings className="w-3 h-3 text-brand-dim hover:text-brand-white" />
            </button>

            {/* Game toggle */}
            <button 
              onClick={() => { setGameMode(!gameMode); if (!gameMode) setGameState('idle'); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${gameMode ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/30' : 'bg-brand-white/[0.03] text-brand-dim border border-brand-border hover:text-brand-white hover:border-brand-border-active'}`}
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">{t.game}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══ GAME OVERLAY ═══ */}
      {gameMode && (
        <div className={`fixed inset-0 z-40 flex items-center justify-center transition-all duration-300 ${gameFlashColor ? 'bg-green-500/90' : 'bg-brand-black/95 backdrop-blur-xl'}`}>
          <div className="text-center animate-scale-in max-w-lg px-6">
            <Zap className={`w-12 h-12 mx-auto mb-4 ${gameFlashColor ? 'text-black' : 'text-brand-blue animate-float'}`} />
            <h2 className="font-syne font-extrabold text-2xl mb-2">{t.gameTitle}</h2>
            <p className={`text-xs mb-8 ${gameFlashColor ? 'text-black/70' : 'text-brand-dim'}`}>{t.gameIntro}</p>
            
            <div 
              onClick={handleGameTrigger}
              className={`w-full max-w-sm mx-auto h-40 rounded-2xl flex items-center justify-center cursor-pointer select-none transition-all duration-300
                ${gameState === 'waiting' ? 'border-2 border-yellow-500/50 bg-yellow-500/5' : 
                  gameState === 'flash' ? 'border-2 border-green-400 bg-green-400/20 animate-pulse scale-105' : 
                  'border border-brand-border hover:border-brand-blue/50 bg-brand-white/[0.03] hover:bg-brand-white/[0.05]'}
              `}
            >
              <span className={`font-syne font-extrabold text-lg tracking-wider ${gameFlashColor ? 'text-black' : ''}`}>
                {gameState === 'idle' && "TAP TO START"}
                {gameState === 'waiting' && t.gameWait}
                {gameState === 'flash' && t.gameClick}
                {gameState === 'result' && (
                  gameResultTime === -1 ? t.gameTooEarly : `${t.gameResult}: ${gameResultTime}ms`
                )}
              </span>
            </div>

            <button 
              onClick={() => { setGameMode(false); setGameState('idle'); setGameFlashColor(false); }}
              className="mt-6 text-[10px] font-mono text-brand-dim hover:text-brand-white transition-colors cursor-pointer"
            >
              ← EXIT GAME
            </button>
          </div>
        </div>
      )}

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex pt-[52px] min-h-screen relative">
        
        {/* ─── SIDEBAR ─── */}
        <aside className={`fixed lg:sticky top-[52px] left-0 h-[calc(100vh-52px)] w-72 bg-brand-surface/80 backdrop-blur-xl border-r border-brand-border flex flex-col z-30 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          
          {/* Sidebar header */}
          <div className="p-4 border-b border-brand-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-syne font-bold text-xs tracking-[0.2em] text-brand-dim uppercase flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-brand-blue" />
                {t.casesTitle}
              </h2>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="btn-primary flex items-center gap-1 bg-brand-blue/10 text-brand-blue border border-brand-blue/20 rounded-lg px-2.5 py-1.5 text-[10px] font-bold font-mono uppercase cursor-pointer hover:bg-brand-blue/20"
              >
                <Plus className="w-3 h-3" />
                {t.newCase}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-dim" />
              <input 
                type="text" 
                placeholder={t.searchPlaceholder}
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                className="w-full bg-brand-white/[0.03] border border-brand-border rounded-lg pl-8 pr-3 py-2 text-xs text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Cases list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredCases.length === 0 ? (
              <div className="text-center py-12 text-brand-dim text-xs font-mono animate-fade-in">
                <Folder className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p>No cases found</p>
              </div>
            ) : (
              filteredCases.map((c, idx) => (
                <div 
                  key={c.id}
                  onClick={() => { setActiveCaseId(c.id); setSidebarOpen(false); }}
                  className={`group p-3 rounded-xl cursor-pointer transition-all duration-200 animate-fade-in-left
                    ${activeCaseId === c.id 
                      ? 'bg-brand-blue/[0.08] border border-brand-blue/20 shadow-[0_0_20px_rgba(48,184,255,0.05)]' 
                      : 'border border-transparent hover:bg-brand-white/[0.03] hover:border-brand-border'
                    }`}
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {activeCaseId === c.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-blue flex-shrink-0" />
                        )}
                        <span className="font-inter font-semibold text-xs text-brand-white truncate">
                          {c.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-brand-dim">
                        <Hash className="w-2.5 h-2.5" />
                        <span>{c.reference_id}</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-all ${activeCaseId === c.id ? 'text-brand-blue' : 'text-brand-muted group-hover:text-brand-dim'}`} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sidebar footer stats */}
          <div className="p-4 border-t border-brand-border text-[10px] font-mono text-brand-dim space-y-1">
            <div className="flex items-center justify-between">
              <span>{cases.length} {t.caseCount}</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                <span>ONLINE</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Sidebar backdrop on mobile */}
        {sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black/50 z-20"
            onClick={() => setSidebarOpen(false)} 
          />
        )}

        {/* ─── MAIN CONTENT ─── */}
        <main className="flex-1 min-h-[calc(100vh-52px)] relative">
          {activeCase ? (
            <div className="animate-fade-in">
              
              {/* Case Header Banner */}
              <div className="px-6 lg:px-10 py-8 border-b border-brand-border bg-gradient-to-b from-brand-blue/[0.03] to-transparent">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 animate-fade-in-up">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-xl bg-brand-blue/10 border border-brand-blue/20">
                        <Shield className="w-5 h-5 text-brand-blue" />
                      </div>
                      <div>
                        <h1 className="font-syne font-extrabold text-2xl lg:text-3xl tracking-tight text-brand-white">
                          {lang === 'en' ? activeCase.title : (translatedContent[`${lang}_case_title_${activeCase.id}`] || activeCase.title)}
                        </h1>
                        {activeCase.description && (
                          <p className="text-xs text-brand-dim mt-1 max-w-xl leading-relaxed">
                            {lang === 'en' ? activeCase.description : (translatedContent[`${lang}_case_desc_${activeCase.id}`] || activeCase.description)}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Metadata chips */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {[
                        { icon: <Hash className="w-3 h-3" />, label: activeCase.reference_id },
                        { icon: <User className="w-3 h-3" />, label: activeCase.created_by },
                        { icon: <Clock className="w-3 h-3" />, label: new Date(activeCase.created_at).toLocaleDateString() },
                      ].map((chip, i) => (
                        <span key={i} className="tag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-white/[0.03] border border-brand-border text-[10px] font-mono text-brand-dim">
                          {chip.icon}
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 animate-fade-in-up delay-2">
                    <button 
                      onClick={handleAuditCase}
                      disabled={auditLoading}
                      className="btn-primary flex items-center gap-2 px-4 py-2.5 bg-brand-blue text-brand-black rounded-xl text-[11px] font-bold font-mono uppercase cursor-pointer disabled:opacity-50 hover:shadow-[0_0_25px_rgba(48,184,255,0.3)]"
                    >
                      <Fingerprint className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                      {t.auditIntegrity}
                    </button>
                    <a 
                      href={`${API_BASE}/cases/${activeCase.id}/report`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary flex items-center gap-2 px-4 py-2.5 bg-brand-white/[0.05] border border-brand-border text-brand-white rounded-xl text-[11px] font-bold font-mono uppercase hover:border-brand-blue/50 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t.exportReport}
                    </a>
                    <a 
                      href={`${API_BASE}/cases/${activeCase.id}/bundle`}
                      className="btn-primary flex items-center gap-2 px-4 py-2.5 bg-brand-white/[0.05] border border-brand-border text-brand-white rounded-xl text-[11px] font-bold font-mono uppercase hover:border-brand-blue/50 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t.downloadBundle}
                    </a>
                  </div>
                </div>

                {/* Audit Result Alert */}
                {auditResult && (
                  <div className={`mt-6 p-4 rounded-xl border animate-scale-in flex items-center justify-between gap-4
                    ${auditResult.chainValid && auditResult.allFilesMatch 
                      ? 'border-brand-green/30 bg-brand-green/[0.05]' 
                      : 'border-brand-red/30 bg-brand-red/[0.05]'
                    }`}>
                    <div className="flex items-center gap-3">
                      {auditResult.chainValid && auditResult.allFilesMatch ? (
                        <div className="p-2 rounded-full bg-brand-green/10">
                          <CheckCircle className="w-5 h-5 text-brand-green" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-full bg-brand-red/10">
                          <AlertTriangle className="w-5 h-5 text-brand-red" />
                        </div>
                      )}
                      <div>
                        <div className={`font-bold text-sm ${auditResult.chainValid && auditResult.allFilesMatch ? 'text-brand-green' : 'text-brand-red'}`}>
                          {auditResult.chainValid ? t.chainIntact : t.chainBroken}
                        </div>
                        <div className="text-[10px] text-brand-dim mt-0.5 font-mono">
                          {auditResult.allFilesMatch ? "All file checksums verified." : "Warning: File integrity check failed."}
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:flex gap-2 text-[9px] font-mono">
                      {auditResult.fileAudits?.map((f: any) => (
                        <span key={f.id} className={`px-2 py-0.5 rounded-md border ${f.status === 'VERIFIED' ? 'border-brand-green/20 text-brand-green bg-brand-green/5' : 'border-brand-red/20 text-brand-red bg-brand-red/5'}`}>
                          {f.filename}: {f.status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Content Grid ─── */}
              <div className="flex flex-col xl:flex-row">
                
                {/* Left: Evidence Panel */}
                <div className="flex-1 px-6 lg:px-10 py-8 border-r border-brand-border">
                  <h2 className="font-syne font-bold text-xs tracking-[0.15em] text-brand-dim uppercase flex items-center gap-2 mb-6 animate-fade-in-up delay-1">
                    <FileText className="w-3.5 h-3.5 text-brand-blue" />
                    {t.evidenceTitle} ({activeCase.evidence?.length || 0})
                  </h2>

                  {/* Upload dropzone */}
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`group relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 mb-6 animate-fade-in-up delay-2
                      ${isDragOver 
                        ? 'border-brand-blue bg-brand-blue/[0.05] scale-[1.01]' 
                        : 'border-brand-border hover:border-brand-blue/30 hover:bg-brand-white/[0.02]'
                      }
                      ${uploadLoading ? 'pointer-events-none opacity-50 scanner-effect' : ''}
                    `}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={(e) => e.target.files && uploadFile(e.target.files[0])}
                      className="hidden" 
                    />
                    <Upload className={`w-8 h-8 mx-auto mb-3 transition-all duration-300 ${isDragOver ? 'text-brand-blue scale-110' : 'text-brand-muted group-hover:text-brand-blue'}`} />
                    <p className="font-inter font-semibold text-sm text-brand-white mb-1">
                      {uploadLoading ? t.loading : t.dropzoneText}
                    </p>
                    <p className="text-[10px] text-brand-dim font-mono">{t.browseFiles}</p>
                  </div>

                  {/* Evidence items */}
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {activeCase.evidence?.map((ev: any, idx: number) => {
                      const verifyInfo = fileVerifyStatus[ev.id];
                      return (
                        <div 
                          key={ev.id} 
                          className="card-hover border border-brand-border rounded-xl p-4 bg-brand-card/50 animate-fade-in-up"
                          style={{ animationDelay: `${(idx + 3) * 0.06}s` }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 rounded-lg bg-brand-blue/5 border border-brand-border flex-shrink-0 mt-0.5">
                                <FileText className="w-4 h-4 text-brand-blue" />
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-brand-white truncate block">
                                  {lang === 'en' ? ev.original_filename : (translatedContent[`${lang}_ev_name_${ev.id}`] || ev.original_filename)}
                                </span>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-brand-dim font-mono">
                                  <span>{ev.mime_type}</span>
                                  <span className="text-brand-muted">•</span>
                                  <span>{(ev.file_size_bytes / 1024).toFixed(1)} KB</span>
                                  <span className="text-brand-muted">•</span>
                                  <span>{new Date(ev.uploaded_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Verification badge */}
                            {verifyInfo && (
                              <span className={`flex-shrink-0 text-[9px] px-2 py-1 rounded-lg font-mono font-bold animate-scale-in
                                ${verifyInfo.status === 'VERIFIED' ? 'bg-brand-green/10 text-brand-green border border-brand-green/20' : 
                                  verifyInfo.status === 'TAMPERED' ? 'bg-brand-red/10 text-brand-red border border-brand-red/20' : 
                                  verifyInfo.status === 'LOADING' ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20' :
                                  'bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/20'}`}>
                                {verifyInfo.status === 'LOADING' ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : verifyInfo.status}
                              </span>
                            )}
                          </div>

                          {/* Hash & actions row */}
                          <div className="mt-3 pt-3 border-t border-brand-border/50 flex items-center justify-between">
                            <div className="text-[9px] font-mono text-brand-muted truncate max-w-[250px] flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{ev.sha256_hash}</span>
                            </div>
                            
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleProcessEvidenceAI(ev.id); }}
                                className="p-1.5 rounded-lg border border-brand-border text-brand-dim hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-all cursor-pointer"
                                title="Process with AI"
                              >
                                <Sparkles className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleVerifyEvidence(ev.id); }}
                                className="px-2.5 py-1 rounded-lg border border-brand-border text-brand-dim hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-all cursor-pointer text-[9px] font-mono font-bold"
                              >
                                {t.verifyFile}
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedEvidenceId(ev.id); setShowTransferModal(true); }}
                                className="px-2.5 py-1 rounded-lg border border-brand-border text-brand-dim hover:text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-all cursor-pointer text-[9px] font-mono font-bold"
                              >
                                {t.transferCustody}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Tabbed Detail Panel */}
                <div className="w-full xl:w-[480px] flex-shrink-0 px-6 lg:px-8 py-8">
                  
                  {/* Tab buttons */}
                  <div className="flex gap-1 p-1 bg-brand-white/[0.03] rounded-xl border border-brand-border mb-6 animate-fade-in-up delay-3">
                    {[
                      { id: 'timeline' as const, label: t.timelineTab, icon: <Activity className="w-3 h-3" /> },
                      { id: 'ai' as const, label: t.aiAdvisoryTab, icon: <Sparkles className="w-3 h-3" /> },
                      { id: 'search' as const, label: t.searchTab, icon: <Search className="w-3 h-3" /> },
                    ].map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer
                          ${activeTab === tab.id 
                            ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20 shadow-[0_0_15px_rgba(48,184,255,0.05)]' 
                            : 'text-brand-dim hover:text-brand-white'
                          }`}
                      >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Tab: Custody Timeline */}
                  {activeTab === 'timeline' && (
                    <div className="space-y-1 max-h-[650px] overflow-y-auto pr-1 animate-fade-in">
                      {activeCase.logs?.length === 0 ? (
                        <div className="text-center py-16 text-brand-dim animate-fade-in">
                          <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
                          <p className="text-xs font-mono">No custody events yet.</p>
                        </div>
                      ) : (
                        <div className="relative ml-3 pl-6 border-l border-brand-border space-y-6">
                          {activeCase.logs?.map((log: any, idx: number) => (
                            <div key={log.id} className="relative animate-fade-in-left" style={{ animationDelay: `${idx * 0.05}s` }}>
                              {/* Timeline node */}
                              <div className={`absolute -left-[29px] top-1 w-4 h-4 rounded-full border-2 bg-brand-black flex items-center justify-center
                                ${log.action_type.includes('UPLOADED') ? 'border-brand-blue' : 
                                  log.action_type.includes('TRANSFERRED') ? 'border-brand-purple' : 
                                  log.action_type.includes('VERIFIED') ? 'border-brand-green' : 'border-brand-dim'}
                              `}>
                                <div className={`w-1.5 h-1.5 rounded-full 
                                  ${log.action_type.includes('UPLOADED') ? 'bg-brand-blue' : 
                                    log.action_type.includes('TRANSFERRED') ? 'bg-brand-purple' : 
                                    log.action_type.includes('VERIFIED') ? 'bg-brand-green' : 'bg-brand-dim'}
                                `} />
                              </div>
                              
                              <div className="card-hover p-3 rounded-xl border border-brand-border bg-brand-card/30 hover:bg-brand-card/50">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-mono text-brand-dim">{new Date(log.created_at).toLocaleString()}</span>
                                  <span className={`text-[8px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-md border
                                    ${log.action_type.includes('UPLOADED') ? 'border-brand-blue/20 text-brand-blue bg-brand-blue/5' : 
                                      log.action_type.includes('TRANSFERRED') ? 'border-brand-purple/20 text-brand-purple bg-brand-purple/5' : 
                                      log.action_type.includes('VERIFIED') ? 'border-brand-green/20 text-brand-green bg-brand-green/5' : 
                                      'border-brand-border text-brand-dim'}
                                  `}>
                                    {lang === 'en' ? log.action_type : (translatedContent[`${lang}_log_action_${log.id}`] || log.action_type)}
                                  </span>
                                </div>
                                <div className="font-bold text-brand-white mb-0.5">
                                  {lang === 'en' ? log.actor : (translatedContent[`${lang}_log_actor_${log.id}`] || log.actor)}
                                </div>
                                <div className="text-brand-dim mb-3">
                                  {lang === 'en' ? log.details : (translatedContent[`${lang}_log_details_${log.id}`] || log.details)}
                                </div>
                                <div className="text-[8px] text-brand-muted mt-2 font-mono truncate flex items-center gap-1">
                                  <Fingerprint className="w-2.5 h-2.5 flex-shrink-0" />
                                  {log.log_hash}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: AI Advisory */}
                  {activeTab === 'ai' && (
                    <div className="space-y-6 max-h-[650px] overflow-y-auto pr-1 animate-fade-in">
                      
                      {/* Summary card */}
                      <div className="rounded-xl border border-brand-border bg-brand-card/30 overflow-hidden animate-fade-in-up">
                        <div className="flex items-center justify-between p-4 border-b border-brand-border/50">
                          <h3 className="font-syne font-bold text-xs uppercase tracking-wider text-brand-blue flex items-center gap-2">
                            <Cpu className="w-3.5 h-3.5" />
                            {t.aiSummary}
                          </h3>
                          <button 
                            onClick={handleRegenerateSummary}
                            disabled={aiSummaryLoading}
                            className="p-1.5 rounded-lg border border-brand-border hover:border-brand-blue/30 text-brand-dim hover:text-brand-blue transition-all cursor-pointer"
                          >
                            <RefreshCw className={`w-3 h-3 ${aiSummaryLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        <div className="p-4">
                          {aiSummaryLoading ? (
                            <div className="space-y-2">
                              <div className="h-3 shimmer rounded w-full" />
                              <div className="h-3 shimmer rounded w-4/5" />
                              <div className="h-3 shimmer rounded w-3/5" />
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed text-brand-white/80 font-mono whitespace-pre-line">
                              {lang === 'en' ? aiSummary : (translatedContent[`${lang}_summary_${activeCase.id}`] || aiSummary || "No summary available. Upload files to generate.")}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* AI Timeline */}
                      <div className="rounded-xl border border-brand-border bg-brand-card/30 overflow-hidden animate-fade-in-up delay-1">
                        <div className="p-4 border-b border-brand-border/50">
                          <h3 className="font-syne font-bold text-xs uppercase tracking-wider text-brand-blue flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5" />
                            {t.suggestedTimeline}
                          </h3>
                        </div>
                        <div className="p-4">
                          {aiTimeline.length === 0 ? (
                            <p className="text-[10px] text-brand-dim font-mono text-center py-4">No timeline events. Upload evidence to generate.</p>
                          ) : (
                            <div className="space-y-4 border-l border-brand-border/30 pl-4 ml-1">
                              {aiTimeline.map((evt, idx) => (
                                <div key={evt.id} className="relative animate-fade-in-left" style={{ animationDelay: `${idx * 0.08}s` }}>
                                  <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-brand-blue" />
                                  <div className="text-[10px] text-brand-dim font-mono">{new Date(evt.event_date).toLocaleString()}</div>
                                  <h4 className="text-xs text-brand-white font-semibold mt-0.5">
                                    {lang === 'en' ? evt.title : (translatedContent[`${lang}_tl_title_${evt.id}`] || evt.title)}
                                  </h4>
                                  <p className="text-[10px] text-brand-dim mt-0.5">
                                    {lang === 'en' ? evt.description : (translatedContent[`${lang}_tl_desc_${evt.id}`] || evt.description)}
                                  </p>
                                  <div className="text-[9px] text-brand-blue/60 italic mt-1 flex items-start gap-1">
                                    <CornerDownRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    <span>
                                      {lang === 'en' ? evt.explanation : (translatedContent[`${lang}_tl_exp_${evt.id}`] || evt.explanation)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Entities */}
                      <div className="rounded-xl border border-brand-border bg-brand-card/30 overflow-hidden animate-fade-in-up delay-2">
                        <div className="p-4 border-b border-brand-border/50">
                          <h3 className="font-syne font-bold text-xs uppercase tracking-wider text-brand-blue flex items-center gap-2">
                            <Eye className="w-3.5 h-3.5" />
                            {t.extractedEntities}
                          </h3>
                        </div>
                        <div className="p-4">
                          {aiEntities.length === 0 ? (
                            <p className="text-[10px] text-brand-dim font-mono text-center py-4">No entities extracted yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {aiEntities.map(ent => (
                                <span 
                                  key={ent.id} 
                                  className="tag text-[9px] font-mono border border-brand-border px-2 py-1 rounded-lg bg-brand-white/[0.02] text-brand-white cursor-help"
                                  title={`Context: ${lang === 'en' ? ent.context_snippet : (translatedContent[`${lang}_ent_ctx_${ent.id}`] || ent.context_snippet)}`}
                                >
                                  <strong className="text-brand-blue text-[8px] uppercase mr-1">
                                    {lang === 'en' ? ent.entity_type : (translatedContent[`${lang}_ent_type_${ent.id}`] || ent.entity_type)}:
                                  </strong>
                                  {lang === 'en' ? ent.entity_value : (translatedContent[`${lang}_ent_val_${ent.id}`] || ent.entity_value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab: Semantic Search */}
                  {activeTab === 'search' && (
                    <div className="space-y-6 animate-fade-in">
                      <form onSubmit={handleSemanticSearch} className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder={t.searchPrompt}
                          value={semanticSearchQuery}
                          onChange={(e) => setSemanticSearchQuery(e.target.value)}
                          className="flex-1 bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-xs text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors font-mono"
                        />
                        <button 
                          type="submit"
                          disabled={semanticSearchLoading}
                          className="btn-primary bg-brand-blue text-brand-black rounded-xl px-4 py-2.5 text-[10px] font-bold font-mono uppercase cursor-pointer disabled:opacity-50"
                        >
                          {semanticSearchLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : t.searchButton}
                        </button>
                      </form>

                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {semanticSearchLoading ? (
                          <div className="text-center py-12 text-brand-dim animate-fade-in">
                            <div className="relative inline-block">
                              <Search className="w-8 h-8 animate-pulse text-brand-blue" />
                            </div>
                            <p className="text-xs font-mono mt-3">SCANNING VECTOR SPACE...</p>
                          </div>
                        ) : semanticSearchResults.length === 0 ? (
                          <div className="text-center py-12 text-brand-dim animate-fade-in">
                            <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-mono">Execute a semantic query to search evidence.</p>
                          </div>
                        ) : (
                          semanticSearchResults.map((res, idx) => (
                            <div key={idx} className="card-hover border border-brand-border p-4 rounded-xl bg-brand-card/30 animate-fade-in-up" style={{ animationDelay: `${idx * 0.08}s` }}>
                              <div className="flex items-center justify-between text-[9px] text-brand-dim mb-2 font-mono">
                                <span className="font-bold uppercase text-brand-blue flex items-center gap-1">
                                  <LinkIcon className="w-3 h-3" />
                                  {res.original_filename || "CASE SUMMARY"}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-brand-blue/5 border border-brand-blue/20 text-brand-blue">
                                  {(res.similarity * 100).toFixed(1)}% match
                                </span>
                              </div>
                              <p className="text-[10px] text-brand-white/80 leading-relaxed font-mono whitespace-pre-line">
                                "{res.content}"
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          ) : (
            /* ═══ EMPTY STATE / HERO ═══ */
            <div className="flex items-center justify-center min-h-[calc(100vh-52px)] p-8 animate-fade-in">
              <div className="text-center max-w-lg">
                {/* Animated shield icon */}
                <div className="relative inline-block mb-8">
                  <div className="absolute inset-0 bg-brand-blue/10 rounded-full blur-3xl scale-150" />
                  <div className="relative p-6 rounded-3xl bg-gradient-to-br from-brand-blue/10 to-transparent border border-brand-blue/10 animate-float">
                    <Shield className="w-16 h-16 text-brand-blue" />
                  </div>
                </div>

                <h2 className="font-syne font-extrabold text-3xl lg:text-4xl tracking-tight text-brand-white mb-3 animate-fade-in-up delay-1">
                  {t.heroTitle}
                </h2>
                <p className="text-sm text-brand-dim mb-2 font-mono animate-fade-in-up delay-2">
                  {t.heroDesc}
                </p>
                <p className="text-xs text-brand-muted mb-8 max-w-sm mx-auto animate-fade-in-up delay-3">
                  {t.noCaseSelected}
                </p>

                {/* Quick stats */}
                <div className="flex items-center justify-center gap-6 mb-8 animate-fade-in-up delay-4">
                  <div className="text-center">
                    <div className="font-syne font-extrabold text-2xl text-brand-blue stat-number">{cases.length}</div>
                    <div className="text-[10px] font-mono text-brand-dim uppercase">{t.caseCount}</div>
                  </div>
                  <div className="h-8 w-px bg-brand-border" />
                  <div className="text-center">
                    <div className="font-syne font-extrabold text-2xl text-brand-green stat-number animate-pulse">●</div>
                    <div className="text-[10px] font-mono text-brand-dim uppercase">{t.systemOnline}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-center animate-fade-in-up delay-5">
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary inline-flex items-center gap-2 bg-brand-blue text-brand-black rounded-xl px-6 py-3 font-bold font-mono text-sm uppercase cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {t.newCase}
                  </button>

                  {showDemoPrompt && (
                    <button 
                      onClick={handleGenerateDemo}
                      disabled={demoLoading}
                      className="btn-primary inline-flex items-center gap-2 bg-brand-white/[0.05] border border-brand-border text-brand-white rounded-xl px-6 py-3 font-bold font-mono text-sm uppercase cursor-pointer hover:border-brand-blue/50 disabled:opacity-50"
                    >
                      {demoLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {demoLoading ? t.generating : t.loadDemo}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ═══ CREATE CASE MODAL ═══ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCreateModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-brand-border bg-gradient-to-r from-brand-blue/[0.05] to-transparent">
                <div className="flex items-center justify-between">
                  <h3 className="font-syne font-extrabold text-lg text-brand-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-brand-blue/10">
                      <Plus className="w-4 h-4 text-brand-blue" />
                    </div>
                    Initialize Case
                  </h3>
                  <button 
                    onClick={() => setShowCreateModal(false)}
                    className="p-1.5 rounded-lg hover:bg-brand-white/5 text-brand-dim hover:text-brand-white transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateCase} className="p-6 space-y-4">
                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.refIdLabel}</label>
                  <input 
                    type="text" 
                    value={newCaseRef}
                    onChange={(e) => setNewCaseRef(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
                    placeholder="e.g. CASE-2026A"
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors font-mono uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.titleLabel}</label>
                  <input 
                    type="text" 
                    value={newCaseTitle}
                    onChange={(e) => setNewCaseTitle(e.target.value)}
                    placeholder="e.g. Corporate Securities Fraud"
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.descLabel}</label>
                  <textarea 
                    value={newCaseDesc}
                    onChange={(e) => setNewCaseDesc(e.target.value)}
                    placeholder="Detailed context..."
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors h-20 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.creator}</label>
                  <input 
                    type="text" 
                    value={newCaseCreator}
                    onChange={(e) => setNewCaseCreator(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 border border-brand-border rounded-xl px-4 py-2.5 text-sm font-bold text-brand-dim hover:text-brand-white hover:border-brand-border-active transition-all cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="btn-primary flex-1 bg-brand-blue text-brand-black rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer"
                  >
                    {t.submit}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TRANSFER MODAL ═══ */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowTransferModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-brand-border bg-gradient-to-r from-brand-purple/[0.05] to-transparent">
                <div className="flex items-center justify-between">
                  <h3 className="font-syne font-extrabold text-lg text-brand-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-brand-purple/10">
                      <CornerDownRight className="w-4 h-4 text-brand-purple" />
                    </div>
                    {t.transferTitle}
                  </h3>
                  <button 
                    onClick={() => setShowTransferModal(false)}
                    className="p-1.5 rounded-lg hover:bg-brand-white/5 text-brand-dim hover:text-brand-white transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleTransferCustody} className="p-6 space-y-4">
                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.actor}</label>
                  <input 
                    type="text" 
                    value={transferActor}
                    onChange={(e) => setTransferActor(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-purple/50 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.recipient}</label>
                  <input 
                    type="text" 
                    value={transferRecipient}
                    onChange={(e) => setTransferRecipient(e.target.value)}
                    placeholder="e.g. Detective Mark Gable"
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-purple/50 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">{t.reason}</label>
                  <textarea 
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Reason for custody transfer..."
                    className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-purple/50 transition-colors h-20 resize-none"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="flex-1 border border-brand-border rounded-xl px-4 py-2.5 text-sm font-bold text-brand-dim hover:text-brand-white hover:border-brand-border-active transition-all cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="btn-primary flex-1 bg-brand-purple text-white rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer"
                  >
                    {t.transferSubmit}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SETTINGS MODAL (BYOK & LOCAL AI) ═══ */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => { if(hasSeenSetup) setShowSettingsModal(false); }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-brand-border bg-gradient-to-r from-brand-blue/[0.05] to-transparent">
                <div className="flex items-center justify-between">
                  <h3 className="font-syne font-extrabold text-lg text-brand-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-brand-blue/10">
                      <Settings className="w-4 h-4 text-brand-blue" />
                    </div>
                    {hasSeenSetup ? 'AI SETTINGS' : 'WELCOME TO TRACE'}
                  </h3>
                  {hasSeenSetup && (
                    <button 
                      onClick={() => setShowSettingsModal(false)}
                      className="p-1.5 rounded-lg hover:bg-brand-white/5 text-brand-dim hover:text-brand-white transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!hasSeenSetup && (
                  <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                    Please configure your AI engine. We support the Gemini API as well as local inference using Ollama.
                  </p>
                )}
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-brand-border bg-brand-white/[0.02]">
                  <input
                    type="checkbox"
                    id="useLocalAI"
                    checked={useLocalAI}
                    onChange={(e) => setUseLocalAI(e.target.checked)}
                    className="w-4 h-4 rounded border-brand-border text-brand-blue focus:ring-brand-blue bg-brand-surface cursor-pointer"
                  />
                  <label htmlFor="useLocalAI" className="text-sm font-bold text-brand-white cursor-pointer select-none">
                    Use Local AI (Ollama)
                  </label>
                </div>

                {!useLocalAI ? (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">Gemini API Key (BYOK)</label>
                      <input 
                        type="password" 
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors"
                      />
                      <p className="text-[10px] text-brand-dim mt-1.5 leading-relaxed">
                        Your key is stored locally in your browser and sent securely via standard HTTP headers. If left blank, it will use the default server key or Mock mode.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">Ollama Endpoint</label>
                      <input 
                        type="text" 
                        value={ollamaEndpoint}
                        onChange={(e) => setOllamaEndpoint(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-brand-dim text-[10px] uppercase font-mono font-bold mb-1.5 tracking-wider">Ollama Model</label>
                      <input 
                        type="text" 
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="llama3"
                        className="w-full bg-brand-white/[0.03] border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-white placeholder:text-brand-muted focus:outline-none focus:border-brand-blue/50 transition-colors"
                      />
                      <p className="text-[10px] text-brand-dim mt-1.5 leading-relaxed">
                        Ensure the Ollama daemon is running locally and the model is installed.
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button 
                    onClick={() => {
                      setHasSeenSetup(true);
                      setShowSettingsModal(false);
                    }}
                    className="w-full btn-primary bg-brand-blue text-brand-black rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer hover:brightness-110 transition-all"
                  >
                    {hasSeenSetup ? 'SAVE SETTINGS' : 'START INVESTIGATION'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
