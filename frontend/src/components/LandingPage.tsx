import { ArrowRight, Fingerprint } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-auto bg-brand-black/60 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6 pointer-events-auto text-center px-4 max-w-2xl">
        
        <div className="flex items-center gap-3 mb-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="w-12 h-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center border border-brand-blue/20">
            <Fingerprint className="w-6 h-6 text-brand-blue" />
          </div>
          <h1 className="font-syne font-extrabold text-5xl md:text-7xl text-brand-white tracking-tight">
            TRACE<span className="text-brand-blue">.</span>
          </h1>
        </div>

        <p className="font-mono text-brand-muted text-sm md:text-base leading-relaxed animate-fade-in" style={{ animationDelay: '0.4s' }}>
          The next generation of autonomous digital forensics and cryptographic evidence verification.
        </p>

        <button
          onClick={onEnter}
          className="group relative mt-8 flex items-center gap-3 px-8 py-4 bg-brand-white/[0.03] hover:bg-brand-blue/10 border border-brand-border hover:border-brand-blue/50 rounded-2xl transition-all duration-500 overflow-hidden animate-scale-in"
          style={{ animationDelay: '0.6s' }}
        >
          {/* Glow effect behind button */}
          <div className="absolute inset-0 bg-brand-blue/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
          
          <span className="relative z-10 font-syne font-bold tracking-widest text-brand-white text-sm">
            ENTER SYSTEM
          </span>
          <div className="relative z-10 w-8 h-8 rounded-full bg-brand-blue text-brand-black flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
}
