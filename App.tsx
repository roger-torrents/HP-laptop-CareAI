import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Laptop, 
  RefreshCcw,
  X,
  Loader2,
  ShieldCheck,
  Info,
  User,
  LogOut,
  History,
  Shield,
  Download,
  Plus,
  ArrowRight
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeLaptopImage, type AnalysisResult } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HP_MODELS = [
  "HP Spectre x360",
  "HP Envy",
  "HP Pavilion",
  "HP EliteBook",
  "HP ProBook",
  "HP OMEN",
  "HP Victus",
  "HP ZBook"
];

const HP_LOGO = "https://upload.wikimedia.org/wikipedia/commons/a/ad/HP_logo_2012.svg";
const LAPTOP_HERO = "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?auto=format&fit=crop&q=80&w=1000";

interface UserProfile {
  id: number;
  email: string;
  name: string;
}

interface InspectionRecord {
  id: number;
  model: string;
  date: string;
  results: AnalysisResult;
  summary: string;
  overall_health: string;
}

interface WarrantyRecord {
  id: number;
  model: string;
  serial_number: string;
  expiry_date: string;
}

export default function App() {
  const [step, setStep] = useState(0); // 0: Hero, 1: Model, 2: Upload, 3: Analysis, 4: Profile
  const [selectedModel, setSelectedModel] = useState("");
  const [images, setImages] = useState<{ file: File; preview: string; result?: AnalysisResult; loading?: boolean; error?: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('hp_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');

  // Profile Data
  const [pastInspections, setPastInspections] = useState<InspectionRecord[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);

  useEffect(() => {
    if (user) {
      fetchProfileData();
    }
  }, [user]);

  const fetchProfileData = async () => {
    if (!user) return;
    try {
      const [inspRes, warRes] = await Promise.all([
        fetch(`/api/inspections/${user.id}`),
        fetch(`/api/warranties/${user.id}`)
      ]);
      const inspections = await inspRes.json();
      const warranties = await warRes.json();
      setPastInspections(inspections);
      setWarranties(warranties);
    } catch (err) {
      console.error("Failed to fetch profile data", err);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      loading: false
    }));
    setImages(prev => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true
  } as any);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    setStep(3);

    const updatedImages = [...images];
    
    for (let i = 0; i < updatedImages.length; i++) {
      if (updatedImages[i].result) continue;
      
      updatedImages[i].loading = true;
      setImages([...updatedImages]);

      try {
        const base64 = await fileToBase64(updatedImages[i].file);
        const result = await analyzeLaptopImage(base64, selectedModel);
        updatedImages[i].result = result;
        updatedImages[i].loading = false;
        
        if (result.isBlurry) {
          updatedImages[i].error = result.blurReason || "Image is too blurry to analyze.";
        } else if (user) {
          // Save to backend if user is logged in
          await fetch('/api/inspections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              model: selectedModel,
              results: result,
              summary: result.summary,
              overall_health: result.overallHealth
            })
          });
        }
      } catch (err) {
        console.error(err);
        updatedImages[i].error = "Analysis failed. Please try again.";
        updatedImages[i].loading = false;
      }
      setImages([...updatedImages]);
    }
    
    setIsAnalyzing(false);
    if (user) fetchProfileData();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('hp_user', JSON.stringify(data));
        setShowAuthModal(false);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Server error');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('hp_user');
    setStep(0);
  };

  const downloadReport = () => {
    const reportData = {
      model: selectedModel,
      date: new Date().toLocaleString(),
      results: images.map(img => ({
        health: img.result?.overallHealth,
        summary: img.result?.summary,
        errors: img.result?.errors
      }))
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HP_Care_Report_${selectedModel.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep(0);
    setSelectedModel("");
    setImages([]);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
            <img src={HP_LOGO} alt="HP Logo" className="h-8 w-8" referrerPolicy="no-referrer" />
            <span className="text-xl font-semibold tracking-tight text-hp-dark">Care AI</span>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <User className="w-5 h-5 text-hp-blue" />
                  <span className="font-medium text-sm hidden sm:block">{user.name}</span>
                </button>
                <button onClick={logout} className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                className="px-6 py-2 bg-hp-blue text-white rounded-full text-sm font-bold hover:bg-hp-blue/90 transition-all shadow-lg shadow-hp-blue/20"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative overflow-hidden"
            >
              <div className="max-w-7xl mx-auto px-4 py-20 sm:py-32 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-8 text-center lg:text-left">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <span className="px-4 py-1.5 bg-hp-blue/10 text-hp-blue rounded-full text-sm font-bold tracking-wider uppercase">
                      AI-Powered Diagnostics
                    </span>
                    <h1 className="mt-6 text-5xl sm:text-7xl font-bold text-hp-dark tracking-tighter leading-tight">
                      The Future of <br />
                      <span className="text-hp-blue">Laptop Care</span>
                    </h1>
                    <p className="mt-6 text-xl text-slate-500 max-w-xl mx-auto lg:mx-0">
                      Professional-grade external inspection for your HP device. 
                      Detect damage, screen defects, and keyboard issues in seconds.
                    </p>
                  </motion.div>

                  <motion.div 
                    className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <button 
                      onClick={() => setStep(1)}
                      className="px-10 py-4 bg-hp-blue text-white rounded-full font-bold text-lg shadow-xl shadow-hp-blue/30 hover:scale-105 transition-all flex items-center gap-2"
                    >
                      Start Inspection
                      <ArrowRight className="w-5 h-5" />
                    </button>
                    {!user && (
                      <button 
                        onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                        className="px-10 py-4 bg-white text-hp-dark border-2 border-slate-200 rounded-full font-bold text-lg hover:bg-slate-50 transition-all"
                      >
                        Create Account
                      </button>
                    )}
                  </motion.div>
                </div>

                <motion.div
                  className="relative"
                  initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    rotateY: [0, 10, 0, -10, 0] 
                  }}
                  transition={{ 
                    opacity: { duration: 1 },
                    scale: { duration: 1 },
                    rotateY: { 
                      duration: 10, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }
                  }}
                  style={{ perspective: "1200px", transformStyle: "preserve-3d" }}
                >
                  <div className="relative z-10 rounded-3xl overflow-hidden shadow-2xl shadow-hp-blue/20 border border-white/20 bg-white">
                    <img 
                      src={LAPTOP_HERO} 
                      alt="HP Laptop" 
                      className="w-full h-64 sm:h-96 object-contain p-8"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-hp-dark/5 to-transparent" />
                  </div>
                  {/* Decorative Elements */}
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-hp-blue/20 rounded-full blur-3xl animate-pulse" />
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl animate-pulse delay-700" />
                </motion.div>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto px-4 py-12 space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-hp-dark tracking-tight">Select Your Model</h2>
                <p className="text-lg text-slate-500">Choose your device to calibrate the AI scanner.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HP_MODELS.map((model) => (
                  <button
                    key={model}
                    onClick={() => { setSelectedModel(model); setStep(2); }}
                    className={cn(
                      "group p-6 text-left rounded-2xl border-2 transition-all duration-300 hover:shadow-lg",
                      selectedModel === model ? "border-hp-blue bg-hp-blue/5" : "border-slate-200 bg-white hover:border-hp-blue/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-slate-100 group-hover:bg-hp-blue/10 transition-colors">
                          <Laptop className="w-6 h-6 text-slate-600 group-hover:text-hp-blue" />
                        </div>
                        <span className="font-semibold text-lg">{model}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-hp-blue" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto px-4 py-12 space-y-8"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setStep(1)} className="flex items-center gap-2 text-slate-500 hover:text-hp-dark">
                  <RefreshCcw className="w-4 h-4" /> Change Model
                </button>
                <div className="px-3 py-1 bg-hp-blue/10 text-hp-blue rounded-full text-sm font-bold">{selectedModel}</div>
              </div>

              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-hp-dark">Capture or Upload Photos</h2>
                <p className="text-slate-500">Take clear photos of the shell, screen, and keyboard.</p>
              </div>

              <div {...getRootProps()} className={cn(
                "border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer",
                isDragActive ? "border-hp-blue bg-hp-blue/5" : "border-slate-200 bg-white hover:border-hp-blue/30"
              )}>
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-hp-blue/10 rounded-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-hp-blue" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Drop images here or click to upload</p>
                    <p className="text-sm text-slate-400">Supports JPG, PNG (Max 10MB)</p>
                  </div>
                </div>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 group">
                      <img src={img.preview} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx)} className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-center">
                <button
                  disabled={images.length === 0}
                  onClick={handleAnalyze}
                  className="px-10 py-4 bg-hp-blue text-white rounded-full font-bold text-lg shadow-xl shadow-hp-blue/30 hover:bg-hp-blue/90 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  Start AI Analysis
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto px-4 py-12 space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-hp-dark">Diagnostic Results</h2>
                <div className="flex gap-3">
                  <button onClick={downloadReport} className="flex items-center gap-2 px-4 py-2 border-2 border-slate-200 rounded-full font-bold hover:bg-slate-50 transition-all">
                    <Download className="w-4 h-4" /> Report
                  </button>
                  <button onClick={reset} className="text-hp-blue font-bold hover:underline">New Diagnostic</button>
                </div>
              </div>

              <div className="space-y-12">
                {images.map((img, idx) => (
                  <div key={idx} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                      <div className="relative aspect-video md:aspect-auto bg-slate-900 flex items-center justify-center overflow-hidden">
                        <img src={img.preview} alt="Analyzed" className={cn("max-w-full max-h-full object-contain", img.loading && "opacity-50")} />
                        {img.loading && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
                            <Loader2 className="w-10 h-10 animate-spin" />
                            <p className="font-medium">AI is analyzing image {idx + 1}...</p>
                          </div>
                        )}
                        {img.result && !img.result.isBlurry && (
                          <svg viewBox="0 0 1000 1000" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                            {img.result.errors.map((error, eIdx) => (
                              <rect key={eIdx} x={error.coordinates.x} y={error.coordinates.y} width={error.coordinates.width} height={error.coordinates.height} fill="none" stroke="#EF4444" strokeWidth="4" className="animate-pulse" />
                            ))}
                          </svg>
                        )}
                        {img.error && (
                          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                            <div className="bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3 max-w-[80%]">
                              <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                              <p className="text-sm font-medium text-red-600">{img.error}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-8 space-y-6">
                        {img.loading ? (
                          <div className="space-y-4">
                            <div className="h-8 w-32 bg-slate-100 animate-pulse rounded" />
                            <div className="h-24 w-full bg-slate-100 animate-pulse rounded-xl" />
                          </div>
                        ) : img.result ? (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {img.result.isBlurry ? <AlertCircle className="w-5 h-5 text-amber-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                <span className="font-bold text-lg">{img.result.isBlurry ? "Inconclusive" : "Analysis Complete"}</span>
                              </div>
                              {!img.result.isBlurry && (
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                  img.result.overallHealth === "Excellent" ? "bg-emerald-100 text-emerald-700" :
                                  img.result.overallHealth === "Good" ? "bg-blue-100 text-blue-700" :
                                  img.result.overallHealth === "Fair" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                )}>Health: {img.result.overallHealth}</span>
                              )}
                            </div>

                            {img.result.isBlurry ? (
                              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                                <p className="font-semibold text-amber-800">Retake Required</p>
                                <p className="text-sm text-amber-700">{img.result.blurReason}</p>
                                <button onClick={() => { removeImage(idx); setStep(2); }} className="mt-2 text-sm font-bold text-amber-800 flex items-center gap-1 hover:underline">
                                  <Camera className="w-4 h-4" /> Try Again
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-slate-900 flex items-center gap-2"><Info className="w-4 h-4 text-hp-blue" /> Summary</h4>
                                  <p className="text-slate-600 text-sm leading-relaxed">{img.result.summary}</p>
                                </div>
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-slate-900">Detected Issues ({img.result.errors.length})</h4>
                                  {img.result.errors.length > 0 ? (
                                    <div className="space-y-2">
                                      {img.result.errors.map((error, eIdx) => (
                                        <div key={eIdx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
                                          <div className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0" />
                                          <div>
                                            <p className="font-bold text-sm text-hp-dark">{error.type}</p>
                                            <p className="text-xs text-slate-500">{error.description}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                      <p className="text-sm font-medium text-emerald-700">No external defects detected.</p>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 4 && user && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-6xl mx-auto px-4 py-12 space-y-12"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-hp-blue rounded-full flex items-center justify-center text-white text-3xl font-bold">
                    {user.name[0]}
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-hp-dark">{user.name}</h2>
                    <p className="text-slate-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={reset} className="px-6 py-2 bg-hp-blue text-white rounded-full font-bold shadow-lg shadow-hp-blue/20">New Inspection</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Past Inspections */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <History className="w-5 h-5 text-hp-blue" />
                      Inspection History
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {pastInspections.length > 0 ? pastInspections.map((record) => (
                      <div key={record.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="font-bold text-lg">{record.model}</p>
                            <p className="text-sm text-slate-400">{new Date(record.date).toLocaleDateString()}</p>
                          </div>
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-bold uppercase",
                            record.overall_health === "Excellent" ? "bg-emerald-100 text-emerald-700" :
                            record.overall_health === "Good" ? "bg-blue-100 text-blue-700" :
                            record.overall_health === "Fair" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {record.overall_health}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">{record.summary}</p>
                      </div>
                    )) : (
                      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                        <p className="text-slate-400">No inspections found. Start your first one!</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warranties */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Shield className="w-5 h-5 text-hp-blue" />
                      Warranties
                    </h3>
                    <button className="p-2 bg-hp-blue/10 text-hp-blue rounded-full hover:bg-hp-blue/20">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {warranties.length > 0 ? warranties.map((war) => (
                      <div key={war.id} className="bg-hp-dark text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
                        <div className="relative z-10">
                          <p className="text-xs font-bold text-hp-blue uppercase tracking-widest mb-1">Active Warranty</p>
                          <p className="font-bold text-lg mb-4">{war.model}</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">Serial No.</span>
                              <span className="font-mono">{war.serial_number}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">Expires</span>
                              <span className="font-bold text-emerald-400">{war.expiry_date}</span>
                            </div>
                          </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 opacity-10">
                          <Shield className="w-24 h-24" />
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                        <p className="text-slate-400">No active warranties registered.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-hp-dark/60 backdrop-blur-sm"
              onClick={() => setShowAuthModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="text-center space-y-2">
                  <img src={HP_LOGO} alt="HP" className="h-10 w-10 mx-auto" referrerPolicy="no-referrer" />
                  <h3 className="text-2xl font-bold">{authMode === 'login' ? 'Welcome Back' : 'Join HP Care AI'}</h3>
                  <p className="text-slate-500 text-sm">Access personalized diagnostics and history.</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === 'signup' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                      <input 
                        required type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-hp-blue outline-none transition-all"
                        value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                    <input 
                      required type="email" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-hp-blue outline-none transition-all"
                      value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                    <input 
                      required type="password" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-hp-blue outline-none transition-all"
                      value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    />
                  </div>

                  {authError && <p className="text-sm text-red-500 font-medium">{authError}</p>}

                  <button className="w-full py-4 bg-hp-blue text-white rounded-xl font-bold shadow-lg shadow-hp-blue/20 hover:bg-hp-blue/90 transition-all">
                    {authMode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </form>

                <div className="text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="text-sm font-bold text-hp-blue hover:underline"
                  >
                    {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
          <img src={HP_LOGO} alt="HP Logo" className="h-8 w-8 mx-auto opacity-30 grayscale" referrerPolicy="no-referrer" />
          <div className="flex justify-center gap-8 text-sm font-bold text-slate-400 uppercase tracking-widest">
            <a href="#" className="hover:text-hp-blue transition-colors">Privacy</a>
            <a href="#" className="hover:text-hp-blue transition-colors">Terms</a>
            <a href="#" className="hover:text-hp-blue transition-colors">Support</a>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} HP Development Company, L.P. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
