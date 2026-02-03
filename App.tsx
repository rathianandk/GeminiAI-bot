import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import FoodMap from './components/Map';
import AgentCoordinationScene from './components/AgentCoordinationScene';
import { 
  discoveryAgent, 
  spatialAlertAgent, 
  getTamilTextSummary, 
  getTamilAudioSummary, 
  generateVendorBio, 
  spatialChatAgent, 
  spatialChatAgent as chatAgent, 
  spatialChatAgent as chatAgentAlias, 
  spatialLensAnalysis, 
  generateSpatialAnalytics,
  getFlavorGenealogy,
  parseOrderAgent,
  predictFootfallAgent,
  analyzeFoodImage
} from './services/geminiService';
import { 
  Shop, 
  LatLng, 
  AgentLog, 
  VendorStatus, 
  VendorProfile, 
  MenuItem, 
  ChatMessage, 
  GroundingSource, 
  LensObservation, 
  LensAnalysis, 
  SpatialAnalytics,
  FlavorGenealogy,
  FoodAnalysis,
  Review,
  SafetyMetrics,
  UrbanLogistics,
  FootfallPoint
} from './types';

// Register Chart.js components
Chart.register(...registerables);

const SEED_SHOPS: Shop[] = [
  { 
    id: 'seed-1', 
    name: 'Jannal Kadai', 
    coords: { lat: 13.0336, lng: 80.2697 }, 
    isVendor: false, 
    emoji: '🥘', 
    cuisine: 'Bajjis', 
    description: 'Legendary window-service spot in Mylapore.', 
    address: 'Mylapore, Chennai', 
    reviews: [], 
    hygieneScore: 82,
    safetyMetrics: { 
      crimeSafety: 92, 
      policeProximity: 65, 
      footfallIntensity: 88, 
      lighting: 70, 
      vibe: 95, 
      nearestPoliceStations: ["Mylapore Police Station", "Abhiramapuram Police Station"] 
    },
    urbanLogistics: { 
      transitAccessibility: 75, 
      walkabilityScore: 90, 
      parkingAvailability: 30, 
      publicTransportNodes: ["Mylapore Bus Terminus", "Thirumayilai Railway Station"] 
    },
    predictedFootfall: [
      { period: "6am-10am", volume: 20 },
      { period: "11am-2pm", volume: 45 },
      { period: "3pm-6pm", volume: 95 },
      { period: "7pm-10pm", volume: 80 },
      { period: "11pm-2am", volume: 10 }
    ]
  },
  { 
    id: 'seed-2', 
    name: 'Kalathi Rose Milk', 
    coords: { lat: 13.0333, lng: 80.2685 }, 
    isVendor: false, 
    emoji: '🥤', 
    cuisine: 'Drinks', 
    description: 'The most iconic Rose Milk in the city.', 
    address: 'South Mada St, Chennai', 
    reviews: [], 
    hygieneScore: 94,
    safetyMetrics: { 
      crimeSafety: 95, 
      policeProximity: 85, 
      footfallIntensity: 60, 
      lighting: 95, 
      vibe: 90, 
      nearestPoliceStations: ["Mylapore Police Station"] 
    },
    urbanLogistics: { 
      transitAccessibility: 80, 
      walkabilityScore: 95, 
      parkingAvailability: 20, 
      publicTransportNodes: ["South Mada St Bus Stop", "Thirumayilai Railway Station"] 
    },
    predictedFootfall: [
      { period: "6am-10am", volume: 10 },
      { period: "11am-2pm", volume: 60 },
      { period: "3pm-6pm", volume: 90 },
      { period: "7pm-10pm", volume: 75 },
      { period: "11pm-2am", volume: 5 }
    ]
  }
];

const SEED_PROFILES: VendorProfile[] = [
  { 
    id: 'profile-1', 
    name: "Mamu's Biryani", 
    emoji: '🍗', 
    cuisine: 'Biryani', 
    description: 'Triplicane wood-fired legacy.', 
    lastLocation: { lat: 13.0585, lng: 80.2730 }, 
    menu: [{ name: 'Mutton Biryani', price: 250, isSoldOut: false }, { name: 'Chicken 65', price: 120, isSoldOut: false }],
    hours: '12:00 - 23:00',
    reviews: [],
    hygieneScore: 78,
    safetyMetrics: { crimeSafety: 75, policeProximity: 60, footfallIntensity: 95, lighting: 65, vibe: 85, nearestPoliceStations: ["Triplicane Police Station"] },
    urbanLogistics: { transitAccessibility: 85, walkabilityScore: 70, parkingAvailability: 45, publicTransportNodes: ["Triplicane High Road Bus Stop", "Government Estate Metro"] },
    predictedFootfall: [
      { period: "6am-10am", volume: 5 },
      { period: "11am-2pm", volume: 80 },
      { period: "3pm-6pm", volume: 40 },
      { period: "7pm-10pm", volume: 100 },
      { period: "11pm-2am", volume: 60 }
    ]
  }
];

// --- Success Reasoning Chart Component ---
const SuccessReasoningChart = ({ shop }: { shop: Shop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    // Data aggregation for "Success Reasoning"
    const sanitation = shop.hygieneScore || 0;
    const safety = shop.safetyMetrics ? 
      (shop.safetyMetrics.crimeSafety + shop.safetyMetrics.vibe + shop.safetyMetrics.lighting) / 3 : 0;
    const logistics = shop.urbanLogistics ? 
      (shop.urbanLogistics.transitAccessibility + shop.urbanLogistics.walkabilityScore + shop.urbanLogistics.parkingAvailability) / 3 : 0;
    const vitality = shop.predictedFootfall ? 
      shop.predictedFootfall.reduce((acc, curr) => acc + curr.volume, 0) / shop.predictedFootfall.length : 0;

    chartRef.current = new Chart(ctx, {
      type: 'polarArea',
      data: {
        labels: ['Sanitation', 'Safety', 'Logistics', 'Vitality'],
        datasets: [{
          data: [sanitation, safety, logistics, vitality],
          backgroundColor: [
            'rgba(16, 185, 129, 0.85)', // Emerald
            'rgba(99, 102, 241, 0.85)', // Indigo
            'rgba(245, 158, 11, 0.85)', // Amber
            'rgba(244, 63, 94, 0.85)'   // Rose
          ],
          borderColor: '#ffffff',
          borderWidth: 1.5,
        }]
      },
      options: {
        scales: {
          r: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { display: false },
            angleLines: { display: true, color: 'rgba(255, 255, 255, 0.1)' },
            suggestedMax: 100
          }
        },
        plugins: {
          legend: { display: false }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => chartRef.current?.destroy();
  }, [shop]);

  const logicPoints = [
    { label: 'Sanitation', outcome: 'Trust Focus', icon: '✨', color: 'text-emerald-400' },
    { label: 'Safety', outcome: 'Stay Duration', icon: '🛡️', color: 'text-indigo-400' },
    { label: 'Logistics', outcome: 'Grid Access', icon: '🚛', color: 'text-amber-400' },
    { label: 'Vitality', outcome: 'Node Density', icon: '📈', color: 'text-rose-400' }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full h-40 md:h-48 relative">
        <canvas ref={canvasRef} />
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 bg-black/40 rounded-2xl border border-white/5">
        <p className="col-span-2 text-[7px] font-black text-white/40 uppercase tracking-[0.3em] text-center mb-1">Success Logic: Cause & Effect</p>
        {logicPoints.map((point) => (
          <div key={point.label} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl">
            <span className="text-[10px]">{point.icon}</span>
            <div className="flex flex-col">
              <span className={`text-[8px] font-black uppercase ${point.color}`}>{point.label}</span>
              <span className="text-[7px] font-bold text-white/60 leading-none">→ {point.outcome}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Hygiene Gauge Component ---
const HygieneGauge = ({ score }: { score: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    const color = score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#f43f5e';

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [score, 100 - score],
          backgroundColor: [color, 'rgba(255, 255, 255, 0.05)'],
          borderWidth: 0,
          circumference: 240,
          rotation: 240,
          cutout: '85%',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });

    return () => chartRef.current?.destroy();
  }, [score]);

  return (
    <div className="relative w-24 h-24">
      <canvas ref={canvasRef} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-[14px] font-black text-white">{score}%</span>
        <span className="text-[6px] font-black text-white/40 uppercase tracking-widest text-center">S-Sanitation</span>
      </div>
    </div>
  );
};

// --- Regional Hygiene Chart Component ---
const RegionalHygieneChart = ({ shops }: { shops: Shop[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || shops.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    const sortedShops = [...shops].sort((a, b) => (b.hygieneScore || 0) - (a.hygieneScore || 0)).slice(0, 6);
    const labels = sortedShops.map(s => s.name);
    const data = sortedShops.map(s => s.hygieneScore || 0);

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Spatial Sanitation Index',
          data: data,
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 5,
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 8 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.8)', font: { size: 9, family: 'monospace', weight: 'bold' } }
          }
        },
        plugins: {
          legend: { display: false }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => chartRef.current?.destroy();
  }, [shops]);

  return <div className="w-full h-48 relative"><canvas ref={canvasRef} /></div>;
};

// --- Radar Chart Component ---
const SafetyRadar = ({ metrics }: { metrics: SafetyMetrics }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Crime', 'Police', 'Footfall', 'Light', 'Vibe'],
        datasets: [{
          label: 'Safety Score',
          data: [metrics.crimeSafety, metrics.policeProximity, metrics.footfallIntensity, metrics.lighting, metrics.vibe],
          backgroundColor: 'rgba(99, 102, 241, 0.25)',
          borderColor: 'rgba(99, 102, 241, 0.8)',
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#818cf8',
          borderWidth: 2,
        }]
      },
      options: {
        scales: {
          r: {
            angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            pointLabels: { 
              color: 'rgba(255, 255, 255, 0.9)', 
              font: { size: 8, weight: 'bold', family: 'monospace' } 
            },
            ticks: { display: false, stepSize: 20 },
            suggestedMin: 0,
            suggestedMax: 100
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { size: 10, weight: 'bold' },
            bodyFont: { size: 10 },
            padding: 8,
            displayColors: false
          }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => chartRef.current?.destroy();
  }, [metrics]);

  return (
    <div className="w-full h-40 md:h-48 relative">
      <canvas ref={canvasRef} />
    </div>
  );
};

// --- Logistics Radar Component ---
const LogisticsRadar = ({ logistics }: { logistics: UrbanLogistics }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Transit', 'Walkability', 'Parking'],
        datasets: [{
          label: 'Logistics Score',
          data: [logistics.transitAccessibility, logistics.walkabilityScore, logistics.parkingAvailability],
          backgroundColor: 'rgba(16, 185, 129, 0.25)',
          borderColor: 'rgba(16, 185, 129, 0.8)',
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#10b981',
          borderWidth: 2,
        }]
      },
      options: {
        scales: {
          r: {
            angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            pointLabels: { 
              color: 'rgba(16, 185, 129, 0.9)', 
              font: { size: 8, weight: 'bold', family: 'monospace' } 
            },
            ticks: { display: false, stepSize: 20 },
            suggestedMin: 0,
            suggestedMax: 100
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { size: 10, weight: 'bold' },
            bodyFont: { size: 10 },
            padding: 8,
            displayColors: false
          }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => chartRef.current?.destroy();
  }, [logistics]);

  return (
    <div className="w-full h-40 md:h-48 relative">
      <canvas ref={canvasRef} />
    </div>
  );
};

// --- Footfall Bar Chart Component ---
const FootfallChart = ({ data }: { data: FootfallPoint[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    const labels = data.map(d => d.period);
    const values = data.map(d => d.volume);

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Predicted Density',
          data: values,
          backgroundColor: values.map(v => v >= 80 ? 'rgba(244, 63, 94, 0.6)' : v >= 50 ? 'rgba(245, 158, 11, 0.6)' : 'rgba(16, 185, 129, 0.6)'),
          borderColor: values.map(v => v >= 80 ? '#fb7185' : v >= 50 ? '#fbbf24' : '#34d399'),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { display: false }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.95)',
              font: { size: 7, family: 'monospace', weight: 'bold' }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: 6,
            titleFont: { size: 9 },
            bodyFont: { size: 9 }
          }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  return (
    <div className="w-full h-32 relative">
      <canvas ref={canvasRef} />
    </div>
  );
};

// --- Progress Indicator Component ---
const MetricBar = ({ label, value, colorClass, textColorClass, glowClass }: { label: string, value: number, colorClass: string, textColorClass: string, glowClass: string }) => {
  return (
    <div className="space-y-1 flex flex-col">
      <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-widest px-0.5">
        <span className="text-white/80">{label}</span>
        <span className={textColorClass}>{value}%</span>
      </div>
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div 
          className={`h-full ${colorClass} ${glowClass} transition-all duration-1000 ease-out`} 
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

const SafetyMetricBar = ({ label, value }: { label: string, value: number }) => {
  const barColor = value >= 80 ? 'bg-indigo-500' : value >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  const textColor = value >= 80 ? 'text-indigo-400' : value >= 60 ? 'text-amber-400' : 'text-rose-400';
  const glowColor = value >= 80 ? 'shadow-[0_0_8px_rgba(99,102,241,0.3)]' : value >= 60 ? 'shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'shadow-[0_0_8px_rgba(244,63,94,0.3)]';
  return <MetricBar label={label} value={value} colorClass={barColor} textColorClass={textColor} glowClass={glowColor} />;
};

const LogisticsMetricBar = ({ label, value }: { label: string, value: number }) => {
  const barColor = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  const textColor = value >= 80 ? 'text-emerald-400' : value >= 60 ? 'text-amber-400' : 'text-rose-400';
  const glowColor = value >= 80 ? 'shadow-[0_0_8px_rgba(16,185,129,0.3)]' : value >= 60 ? 'shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'shadow-[0_0_8px_rgba(244,63,94,0.3)]';
  return <MetricBar label={label} value={value} colorClass={barColor} textColorClass={textColor} glowClass={glowColor} />;
};

// --- Global Audio Helpers ---
let persistentAudioCtx: AudioContext | null = null;
let activeVoiceSource: AudioBufferSourceNode | null = null;

const getAudioCtx = () => {
  if (!persistentAudioCtx) {
    persistentAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return persistentAudioCtx;
};

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePCM(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  let workingBuffer = data.buffer;
  let offset = data.byteOffset;
  if (offset % 2 !== 0) {
    const aligned = new Uint8Array(data.length);
    aligned.set(data);
    workingBuffer = aligned.buffer;
    offset = 0;
  }
  const dataInt16 = new Int16Array(workingBuffer, offset, data.length / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const parseDMS = (dmsString: string): LatLng | null => {
  try {
    const regex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["]?\s*([NSEW])/gi;
    const matches = [...dmsString.matchAll(regex)];
    if (matches.length !== 2) return null;
    const results = matches.map(match => {
      const degrees = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      const direction = match[4].toUpperCase();
      let decimal = degrees + minutes / 60 + seconds / 3600;
      if (direction === 'S' || direction === 'W') decimal = decimal * -1;
      return decimal;
    });
    return { lat: results[0], lng: results[1] };
  } catch (e) {
    console.error("DMS Parsing Error:", e);
    return null;
  }
};

const VoiceWave = ({ isActive, isSpeaking, onStop }: { isActive: boolean; isSpeaking: boolean; onStop?: () => void }) => {
  if (!isActive) return null;
  const palette = isSpeaking 
    ? ["from-rose-500 via-amber-400 to-emerald-400", "from-emerald-400 via-cyan-400 to-pink-500", "from-yellow-300 via-white to-orange-400"]
    : ["from-indigo-600 via-purple-600 to-blue-400", "from-purple-500 via-blue-600 to-indigo-400", "from-blue-400 via-white to-purple-400"];
  const glow = isSpeaking ? "bg-emerald-500/20" : "bg-indigo-500/20";
  return (
    <div className="relative flex items-center justify-center w-12 h-12 overflow-visible animate-in fade-in zoom-in-95 duration-1000">
      <div className={`absolute inset-[-4px] ${glow} rounded-full blur-2xl animate-pulse transition-colors duration-700`}></div>
      <div className={`absolute inset-0 bg-gradient-to-tr ${palette[0]} opacity-90 blur-lg animate-siri-liquid mix-blend-screen transition-all duration-700`}></div>
      <div className={`absolute inset-1 bg-gradient-to-bl ${palette[1]} opacity-90 blur-md animate-siri-liquid-alt mix-blend-screen transition-all duration-700`}></div>
      {onStop && isSpeaking ? (
        <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="relative z-10 w-7 h-7 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/80 transition-all border border-white/20 hover:scale-110 active:scale-90" title="Stop Audio">
          <span className="text-[9px]">■</span>
        </button>
      ) : (
        <div className="relative w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)] border border-white/40 animate-pulse"></div>
      )}
    </div>
  );
};

const SetupAnimation = () => (
  <div className="flex items-center justify-center gap-2">
    <div className="flex gap-1 items-center">
      <span className="animate-bounce delay-75 duration-700">🥘</span>
      <span className="animate-bounce delay-200 duration-700">🍳</span>
      <span className="animate-bounce delay-500 duration-700">🚚</span>
    </div>
    <span className="text-[7px] font-black uppercase tracking-widest animate-pulse">Establishing Link...</span>
  </div>
);

export default function App() {
  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [logs, setLogs] = useState<AgentLog[]>([{
    id: 'init-1',
    agent: 'Linguistic',
    message: 'Vanakkam! gStrEats EyAI initialized with street-level accuracy.',
    status: 'resolved'
  }]);
  const [lastSources, setLastSources] = useState<GroundingSource[]>([]);
  const [isMining, setIsMining] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false); 
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [lensShopData, setLensShopData] = useState<Shop | null>(null); // State to persist data for Lens tab
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 });
  const [userMode, setUserMode] = useState<'explorer' | 'vendor' | 'history'>('explorer');
  const [explorerTab, setExplorerTab] = useState<'logs' | 'discovery' | 'live_vendors' | 'lens' | 'impact'>('logs');
  const [discoverySubTab, setDiscoverySubTab] = useState<'nodes' | 'intelligence'>('nodes');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Menu State
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatLang, setChatLang] = useState<'en-US' | 'ta-IN'>('en-US');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ id: '1', role: 'model', text: 'Vanakkam! Ask me anything about street food or landmarks.' }]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyFileInputRef = useRef<HTMLInputElement>(null);
  const currentShopIdRef = useRef<string | null>(null);
  const activeAgentTimeoutRef = useRef<number | null>(null);

  const [analytics, setAnalytics] = useState<SpatialAnalytics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isLensAnalyzing, setIsLensAnalyzing] = useState(false);
  const [lensTargetName, setLensTargetName] = useState<string>('');
  const [lensAnalysis, setLensAnalysis] = useState<LensAnalysis | null>(null);
  const [lensTab, setLensTab] = useState<'observations' | 'extractedFrames' | 'synthesis'>('extractedFrames');

  const [flavorHistory, setFlavorHistory] = useState<FlavorGenealogy | null>(null);
  const [isHistoryMining, setIsHistoryMining] = useState(false);
  const [imageFlavorAnalysis, setImageFlavorAnalysis] = useState<FoodAnalysis | null>(null);

  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);

  // --- Review State ---
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState({ author: 'Machi Explorer', rating: 5, comment: '' });

  // --- Predictive Footfall State ---
  const [footfallPrediction, setFootfallPrediction] = useState<string | null>(null);
  const [isPredictingFootfall, setIsPredictingFootfall] = useState(false);

  // --- Ordering Flow States ---
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderStep, setOrderStep] = useState<'menu' | 'verifying' | 'placed'>('menu');
  const [orderInput, setOrderInput] = useState('');
  const [parsedOrder, setParsedOrder] = useState<{ orderItems: any[], totalPrice: number } | null>(null);
  const [isParsingOrder, setIsParsingOrder] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});

  const [myProfiles, setMyProfiles] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geomind_profiles');
    return saved ? JSON.parse(saved) : SEED_PROFILES;
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  const activeProfile = myProfiles.find(p => p.id === activeProfileId);

  const [isRegistering, setIsRegistering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isUpdatingGPS, setIsUpdatingGPS] = useState(false);
  const [regForm, setRegForm] = useState({ 
    name: '', 
    cuisine: '', 
    emoji: '🥘', 
    description: '', 
    startHour: 9, 
    endHour: 22, 
    menu: [] as MenuItem[],
    youtubeLink: '',
    manualDMS: '',
    hygieneScore: 85
  });
  const [newItem, setNewItem] = useState({ name: '', price: '' });

  useEffect(() => {
    localStorage.setItem('geomind_profiles', JSON.stringify(myProfiles));
    setShops(prev => {
      const baseShops = prev.filter(s => !s.id.startsWith('sync-') && !s.isVendor);
      const syncShops = prev.filter(s => s.id.startsWith('sync-'));
      const vendorShops = myProfiles.map(p => {
        const liveId = `live-${p.id}`;
        const prevLiveInstance = prev.find(s => s.id === liveId && s.status === VendorStatus.ONLINE);
        return {
          id: prevLiveInstance ? liveId : p.id,
          name: p.name,
          coords: prevLiveInstance ? prevLiveInstance.coords : (p.lastLocation || location),
          isVendor: true,
          status: prevLiveInstance ? VendorStatus.ONLINE : VendorStatus.OFFLINE,
          emoji: p.emoji,
          cuisine: p.cuisine,
          description: p.description,
          menu: p.menu,
          hours: p.hours,
          youtubeLink: p.youtubeLink,
          reviews: p.reviews || [],
          hygieneScore: p.hygieneScore || 85,
          safetyMetrics: p.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
          urbanLogistics: p.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
          predictedFootfall: p.predictedFootfall || [
            { period: "6am-10am", volume: 30 },
            { period: "11am-2pm", volume: 70 },
            { period: "3pm-6pm", volume: 50 },
            { period: "7pm-10pm", volume: 85 },
            { period: "11pm-2am", volume: 15 }
          ]
        };
      });
      return [...baseShops, ...syncShops, ...vendorShops];
    });
  }, [myProfiles]);

  // Reactive Bridge: Ensure activeShop always reflects the latest inventory (Sold Out status) from the shops grid
  useEffect(() => {
    if (activeShop) {
      const latest = shops.find(s => s.id === activeShop.id);
      if (latest && JSON.stringify(latest.menu) !== JSON.stringify(activeShop.menu)) {
        setActiveShop(latest);
      }
    }
  }, [shops, activeShop]);

  // Audio Safety Layer: Immediately stop audio when the activeShop popup is closed or cleared
  useEffect(() => {
    if (!activeShop) {
      stopAudio();
      currentShopIdRef.current = null;
    }
  }, [activeShop]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 50)]);
    
    // Neural Highlight Integration: Reflect any log activity in the Coordination Mesh
    if (!isVerifying) {
      setActiveAgentName(agent);
      if (activeAgentTimeoutRef.current) window.clearTimeout(activeAgentTimeoutRef.current);
      activeAgentTimeoutRef.current = window.setTimeout(() => {
        setActiveAgentName(null);
      }, 4000);
    }
  };

  const runVerificationSuite = async () => {
    setIsVerifying(true);
    setExplorerTab('logs');
    setLogs([]); // Clear logs for the fresh coordination simulation
    
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      setActiveAgentName('Spatial');
      addLog('Spatial', 'Neural Grid Scan initiated. Seeking high-density anomalies in the current sector...', 'processing');
      await sleep(1000);
      addLog('Spatial', 'Spatial anomaly detected at Triplicane sector. Handing over mission to Discovery Agent.', 'resolved');
      await sleep(800);

      setActiveAgentName('Discovery');
      addLog('Discovery', 'Handoff received. Synchronizing with Google Maps API for historical culinary nodes...', 'processing');
      await sleep(1500);
      addLog('Discovery', '14 potential legendary nodes identified in the cluster. Requesting structural verification from Lens Agent.', 'resolved');
      await sleep(800);

      setActiveAgentName('Lens');
      addLog('Lens', 'Visual Node Scrape active. Reasoning over structural elevation and architectural authenticity...', 'processing');
      await sleep(2000);
      addLog('Lens', 'Authenticity confirmed. Node integration matches "Rooftop Grill" profile. Triggering Analytics Agent.', 'resolved');
      await sleep(800);

      setActiveAgentName('Analytics');
      addLog('Analytics', 'Analyzing neighborhood price variance and foot traffic gravity patterns...', 'processing');
      await sleep(1500);
      addLog('Analytics', 'Safety Score: 94. Competition Synergy: High. Market entry approved. Alerting Linguistic Agent.', 'resolved');
      await sleep(800);

      setActiveAgentName('Linguistic');
      addLog('Linguistic', 'Initializing Tamil-English dialect calibration. Synthesizing hyper-local bios for field explorers...', 'processing');
      await sleep(1200);
      addLog('Linguistic', 'Dialect "Madras Bashai" mapping successful. Summary ready for local broadcast.', 'resolved');
      await sleep(1000);

      setActiveAgentName(null);
      addLog('Spatial', 'AGENT COORDINATION LOOP COMPLETE. Sector synchronized. Grid is LIVE for exploration.', 'resolved');
    } catch (err) {
      setActiveAgentName(null);
      addLog('Spatial', `CRITICAL COLLISION: Agent handoff failure. ${err instanceof Error ? err.message : 'Unknown Anomaly'}`, 'failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const stopAudio = () => {
    if (activeVoiceSource) {
      try { activeVoiceSource.stop(); } catch (e) { console.warn("Audio stop error:", e); }
      activeVoiceSource = null;
    }
    setIsSpeaking(false);
    setIsVoiceActive(false);
  };

  const playVoice = async (base64: string) => {
    if (!base64) { setIsVoiceActive(false); return; }
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      if (activeVoiceSource) { try { activeVoiceSource.stop(); } catch(e) {} }
      const bytes = decode(base64);
      const audioBuffer = await decodePCM(bytes, ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { 
        if (activeVoiceSource === source) {
           setIsSpeaking(false); 
           setIsVoiceActive(false); 
           activeVoiceSource = null; 
        }
      };
      activeVoiceSource = source;
      setIsSpeaking(true);
      source.start();
    } catch (err) { setIsSpeaking(false); setIsVoiceActive(false); }
  };

  const handleToggleSignal = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    const liveId = `live-${profile.id}`;
    const isNowOnline = !shops.some(s => s.id === liveId && s.status === VendorStatus.ONLINE);
    
    if (isNowOnline) {
      const optimisticShop: Shop = { 
        id: liveId, 
        name: profile.name, 
        coords: location, 
        isVendor: true, 
        status: VendorStatus.ONLINE, 
        emoji: profile.emoji, 
        cuisine: profile.cuisine, 
        description: "Establishing neural link and local broadcast...", 
        hours: profile.hours, 
        menu: profile.menu,
        youtubeLink: profile.youtubeLink,
        reviews: profile.reviews || [],
        hygieneScore: profile.hygieneScore || 85,
        safetyMetrics: profile.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
        urbanLogistics: profile.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
        predictedFootfall: profile.predictedFootfall || [
          { period: "6am-10am", volume: 30 },
          { period: "11am-2pm", volume: 70 },
          { period: "3pm-6pm", volume: 50 },
          { period: "7pm-10pm", volume: 85 },
          { period: "11pm-2am", volume: 15 }
        ]
      };
      setShops(prev => [optimisticShop, ...prev.filter(s => s.id !== optimisticShop.id && s.id !== profile.id)]);
      addLog('Spatial', `Signal activation initiated for ${profile.name}. Broadcasting to local grid...`, 'processing');

      try {
        const alert = await spatialAlertAgent(profile.name, location);
        setShops(prev => prev.map(s => s.id === liveId ? { ...s, description: alert.tamilSummary } : s));
        addLog('Spatial', `Signal locked for ${profile.name}. Metadata synchronized.`, 'resolved');
      } catch (err) {
        setShops(prev => prev.map(s => s.id === liveId ? { ...s, description: profile.description } : s));
        addLog('Spatial', `Signal established, but metadata sync failed. Using registry bio.`, 'failed');
      }
    } else {
      setShops(prev => prev.filter(s => s.id !== liveId));
      addLog('Spatial', `Signal deactivated for ${profile.name}. Node is now offline.`, 'failed');
    }
  };

const handleShopSelect = async (shop: Shop) => {
  setActiveShop(shop);
  setLensShopData(shop); // Set persistent data for Lens tab metrics
  currentShopIdRef.current = shop.id; // Lock current audio session
  setLensTargetName(shop.name);
  setLocation(shop.coords);
  setIsVoiceActive(true);
  setIsPredictingFootfall(true);
  setIsSidebarOpen(false); 

  getTamilTextSummary(shop).then(summary => {
    addLog('Linguistic', `Spatial Insight: ${summary.tamil}\n\n${summary.english}`, 'resolved');
  });

  getTamilAudioSummary(shop).then(data => {
      // Session Integrity Check: Ensure we only play if the user hasn't closed the node
      if (data && currentShopIdRef.current === shop.id) {
        playVoice(data);
      }
      if (!data) setIsVoiceActive(false);
    }).catch(() => setIsVoiceActive(false));
    
  predictFootfallAgent(shop, shop.coords).then(prediction => {
    setFootfallPrediction(prediction);
    setIsPredictingFootfall(false);
  });

  startLensAnalysisInternal(shop);
};

  const startLensAnalysisInternal = async (shop: Shop) => {
    setIsLensAnalyzing(true);
    setExplorerTab('lens');
    setLensAnalysis(null);
    setLensTab('extractedFrames');
    addLog('Lens', `Performing intensive visual scrape for ${shop.name}...`, 'processing');
    try {
      const analysis = await spatialLensAnalysis(shop.coords, shop.name);
      setLensAnalysis(analysis);
      addLog('Lens', `Visual frames analysis complete. Urban integration nodes identified.`, 'resolved');
    } catch (err) {
      addLog('Lens', `Visual node interference detected. Scraping failed.`, 'failed');
    } finally {
      setIsLensAnalyzing(false);
    }
  };

  const handleHistoryImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsHistoryMining(true);
    setImageFlavorAnalysis(null);
    setFlavorHistory(null);
    addLog('Historian', `Initiating multimodal fragment genealogy for visual node...`, 'processing');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        const res = await analyzeFoodImage(base64, file.type);
        
        if (res.error === "NOT_FOOD_DETECTED") {
          addLog('Historian', res.narrative, 'failed');
        } else {
          setImageFlavorAnalysis(res);
          addLog('Historian', `Identification: ${res.name}. Cross-temporal spice migration sync complete.`, 'resolved');
        }
        setIsHistoryMining(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      addLog('Historian', `History vision malfunction. Temporal scan aborted.`, 'failed');
      setIsHistoryMining(false);
    }
  };

  const fetchFlavorHistory = async (e: React.MouseEvent) => {
    setIsHistoryMining(true);
    setUserMode('history');
    setImageFlavorAnalysis(null);
    addLog('Historian', 'Scanning 1.2M historical tokens for culinary migration patterns...', 'processing');
    try {
      const result = await getFlavorGenealogy(location);
      setFlavorHistory(result);
      addLog('Historian', `Cross-temporal synthesis complete for ${result.neighborhood}.`, 'resolved');
    } catch (err) {
      addLog('Historian', 'Anomaly detected in historical records. Registry inaccessible.', 'failed');
    } finally {
      setIsHistoryMining(false);
    }
  };

  const computeAnalytics = async (shopData?: Shop[]) => {
    const targetShops = shopData || shops;
    const discoveredOnly = targetShops.filter(s => s.id.startsWith('sync'));
    if (discoveredOnly.length === 0) {
      addLog('Analytics', 'Insufficient spatial nodes for analytics. Discovery required.', 'failed');
      return;
    }
    setIsAnalyzing(true);
    addLog('Analytics', 'Processing food grid metrics and customer segmentation...', 'processing');
    try {
      const res = await generateSpatialAnalytics(discoveredOnly);
      setAnalytics(res);
      addLog('Analytics', 'Spatial intelligence dashboard synchronized.', 'resolved');
    } catch (err) {
      addLog('Analytics', 'Telemetry parsing failed. Visual subsystem offline.', 'failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const syncGPS = () => {
    setIsUpdatingGPS(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setLocation(newLoc);
          setIsUpdatingGPS(false);
          if (activeProfileId) {
            setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, lastLocation: newLoc } : p));
          }
          addLog('Spatial', `High-precision GPS sync complete at ${newLoc.lat.toFixed(6)}, ${newLoc.lng.toFixed(6)}.`, 'resolved');
        },
        (error) => {
          console.error("GPS Sync Error:", error);
          setIsUpdatingGPS(false);
          addLog('Spatial', `GPS sync failed: ${error.message}`, 'failed');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsUpdatingGPS(false);
      addLog('Spatial', `Geolocation API not available in this environment.`, 'failed');
    }
  };

  const handleApplyDMS = () => {
    const coords = parseDMS(regForm.manualDMS);
    if (coords) {
      setLocation(coords);
      addLog('Spatial', `Manual coordinates applied: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}.`, 'resolved');
    } else {
      addLog('Spatial', `Invalid DMS format. Use 13°05'41.5"N 80°10'30.2"E`, 'failed');
    }
  };

  const startEditHub = (profile: VendorProfile) => {
    const [start, end] = (profile.hours || "9:00 - 22:00").split(' - ').map(h => parseInt(h));
    setRegForm({
      name: profile.name,
      cuisine: profile.cuisine,
      emoji: profile.emoji,
      description: profile.description,
      startHour: start || 9,
      endHour: end || 22,
      menu: [...(profile.menu || [])],
      youtubeLink: profile.youtubeLink || '',
      manualDMS: '',
      hygieneScore: profile.hygieneScore || 85
    });
    setIsEditing(true);
    setIsRegistering(true);
  };

  const handleSaveHub = () => {
    if (!regForm.name || !regForm.cuisine) {
      alert("Name and Cuisine are required to establish a node.");
      return;
    }
    let targetId = activeProfileId;
    if (isEditing && activeProfileId) {
      setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? {
        ...p,
        name: regForm.name,
        cuisine: regForm.cuisine,
        emoji: regForm.emoji,
        description: regForm.description,
        hours: `${regForm.startHour}:00 - ${regForm.endHour}:00`,
        menu: regForm.menu,
        youtubeLink: regForm.youtubeLink,
        hygieneScore: regForm.hygieneScore
      } : p));
      addLog('Spatial', `Node "${regForm.name}" updated in central registry.`, 'resolved');
    } else {
      const newId = Date.now().toString();
      const newProfile: VendorProfile = {
        id: newId,
        name: regForm.name,
        cuisine: regForm.cuisine,
        emoji: regForm.emoji, 
        description: regForm.description,
        lastLocation: location,
        hours: `${regForm.startHour}:00 - ${regForm.endHour}:00`,
        menu: regForm.menu,
        youtubeLink: regForm.youtubeLink,
        reviews: [],
        hygieneScore: regForm.hygieneScore,
        safetyMetrics: { crimeSafety: 80, policeProximity: 80, footfallIntensity: 80, lighting: 80, vibe: 80, nearestPoliceStations: [] },
        urbanLogistics: { transitAccessibility: 80, walkabilityScore: 80, parkingAvailability: 80, publicTransportNodes: [] },
        predictedFootfall: [
          { period: "6am-10am", volume: 30 },
          { period: "11am-2pm", volume: 70 },
          { period: "3pm-6pm", volume: 50 },
          { period: "7pm-10pm", volume: 85 },
          { period: "11pm-2am", volume: 15 }
        ]
      };
      setMyProfiles(prev => [...prev, newProfile]);
      addLog('Spatial', `Initial signal for "${regForm.name}" established.`, 'resolved');
      targetId = newId;
    }
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] as MenuItem[], youtubeLink: '', manualDMS: '', hygieneScore: 85 });
    setIsRegistering(false);
    setIsEditing(false);
    if (targetId) setActiveProfileId(targetId);
  };

  const deleteHub = (id: string) => {
    if (!confirm("Confirm decommissioning? All spatial history will be purged.")) return;
    setMyProfiles(prev => prev.filter(p => p.id !== id));
    setShops(prev => prev.filter(s => s.id !== id && s.id !== `live-${id}`));
    setActiveProfileId(null);
    addLog('Spatial', `Node decommissioned. Signal severed from the grid.`, 'failed');
  };

  const addMenuItem = () => {
    if (!newItem.name || !newItem.price) return;
    setRegForm(prev => ({
      ...prev,
      menu: [...prev.menu, { name: newItem.name, price: parseInt(newItem.price), isSoldOut: false }]
    }));
    setNewItem({ name: '', price: '' });
  };

  const removeMenuItem = (index: number) => {
    setRegForm(prev => ({ ...prev, menu: prev.menu.filter((_, i) => i !== index) }));
  };

  const toggleMenuItemSoldOut = (index: number) => {
    setRegForm(prev => {
      const newMenu = [...prev.menu];
      newMenu[index] = { ...newMenu[index], isSoldOut: !newMenu[index].isSoldOut };
      return { ...prev, menu: newMenu };
    });
  };

  const handleSaveReview = () => {
    if (!reviewForm.comment.trim() || !activeShop) return;
    
    const newReview: Review = {
      id: Date.now().toString(),
      author: reviewForm.author,
      rating: reviewForm.rating,
      comment: reviewForm.comment,
      timestamp: new Date().toLocaleDateString()
    };

    setShops(prev => prev.map(s => {
      if (s.id === activeShop.id) {
        const updatedReviews = [newReview, ...(s.reviews || [])];
        return { ...s, reviews: updatedReviews };
      }
      return s;
    }));

    const profileId = activeShop.id.replace('live-', '');
    if (myProfiles.some(p => p.id === profileId)) {
      setMyProfiles(prev => prev.map(p => {
        if (p.id === profileId) {
          return { ...p, reviews: [newReview, ...(p.reviews || [])] };
        }
        return p;
      }));
    }

    setActiveShop(prev => prev ? { ...prev, reviews: [newReview, ...(prev.reviews || [])] } : null);

    addLog('Linguistic', `Exploration feedback logged for ${activeShop.name}. Authenticity confirmed.`, 'resolved');
    setIsReviewing(false);
    setReviewForm({ author: 'Machi Explorer', rating: 5, comment: '' });
  };

  const generateBio = async () => {
    if (!regForm.name || !regForm.cuisine) return;
    setIsGeneratingBio(true);
    const bio = await generateVendorBio(regForm.name, regForm.cuisine);
    setRegForm(prev => ({ ...prev, description: bio }));
    setIsGeneratingBio(false);
  };

  const startDiscovery = async () => {
    setIsMining(true);
    setExplorerTab('discovery');
    setDiscoverySubTab('nodes');
    addLog('Discovery', 'Initiating wide-band spatial food scrape...', 'processing');
    try {
      const result = await discoveryAgent("Legendary street food and hidden gems", location);
      
      if (!result.shops || result.shops.length === 0) {
        addLog('Discovery', 'Minimal signals detected in current sector. Retry spatial sweep.', 'failed');
        setIsMining(false);
        return;
      }

      const updatedShops = [...shops.filter(s => !s.id.startsWith('sync-')), ...result.shops];
      setShops(updatedShops);
      setLastSources(result.sources);
      
      computeAnalytics(updatedShops);

      if (result.logs && result.logs.length > 0) {
        result.logs.forEach(msg => addLog('Discovery', msg, 'resolved'));
      }
      
      addLog('Discovery', `Discovery Complete: Identified ${result.shops.length} legends in this sector.`, 'resolved');
      setIsMining(false);
    } catch (err) {
      console.error("Scrape Error:", err);
      addLog('Discovery', 'Discovery node timeout. Atmospheric interference suspected.', 'failed');
      setIsMining(false);
    }
  };

  const handleChatSubmit = async (text: string) => {
    if (!text.trim()) return;
    const i = text;
    setChatInput(''); 
    const nowTs = Date.now();
    setChatHistory(prev => [
      ...prev, 
      { id: nowTs.toString(), role: 'user', text: i }, 
      { id: (nowTs + 1).toString(), role: 'model', text: '', isThinking: true }
    ]);
    const res = await chatAgent(i, location);
    setChatHistory(prev => prev.map(m => m.isThinking ? { ...m, text: res.text, sources: res.sources, isThinking: false } : m));
  };

  const handleChatVoice = () => {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!R) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const r = new R();
    r.lang = chatLang;
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      handleChatSubmit(transcript);
    };
    r.start();
  };

  const liveVendors = shops.filter(s => s.isVendor && s.status === VendorStatus.ONLINE);
  const discoveredShops = shops.filter(s => s.id.startsWith('sync'));
  const isCurrentlyLive = activeProfileId && shops.some(s => s.id === `live-${activeProfileId}` && s.status === VendorStatus.ONLINE);
  
  const cartValues = Object.values(cart) as number[];
  const cartTotalItems: number = cartValues.reduce((a: number, b: number) => a + b, 0);

  const initiateOrder = () => {
    if (!activeShop?.menu || activeShop.menu.length === 0) {
      alert("This partner node has no menu registered in the grid.");
      return;
    }
    setOrderStep('menu');
    setOrderInput('');
    setParsedOrder(null);
    setCart({}); 
    setIsOrdering(true);
  };

  const updateCart = (itemName: string, delta: number) => {
    const menuItem = activeShop?.menu?.find(m => m.name === itemName);
    if (menuItem?.isSoldOut && delta > 0) return; 

    setCart((prev: Record<string, number>) => {
      const current = prev[itemName] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemName]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemName]: next };
    });
  };

  const processOrderInput = async (input?: string) => {
    const textToParse = input || orderInput;
    if (!textToParse.trim() || !activeShop?.menu) return;
    setIsParsingOrder(true);
    addLog('Linguistic', `Processing signal: "${textToParse}"`, 'processing');
    try {
      const res = await parseOrderAgent(textToParse, activeShop.menu);
      setCart((prev: Record<string, number>) => {
        const next = { ...prev };
        res.orderItems.forEach((item: any) => {
          const actualItem = activeShop?.menu?.find(m => m.name === item.name);
          if (actualItem && !actualItem.isSoldOut) {
            next[item.name] = (next[item.name] || 0) + item.quantity;
          }
        });
        return next;
      });
      addLog('Linguistic', `Manifest updated from voice grid. Added entities.`, 'resolved');
      setOrderInput(''); 
    } catch (e) {
      addLog('Linguistic', `Signal decoding failed. Re-state requirements.`, 'failed');
    } finally {
      setIsParsingOrder(false);
    }
  };

  const proceedToVerify = () => {
    if (Object.keys(cart).length === 0) {
      alert("Cart is empty. Select items or state your order.");
      return;
    }
    const orderItems = (Object.entries(cart) as [string, number][]).map(([name, quantity]) => {
      const menuItem = activeShop?.menu?.find(m => m.name === name);
      return { 
        name, 
        quantity, 
        price: menuItem?.price || 0,
        isSoldOut: menuItem?.isSoldOut || false 
      };
    }).filter(it => !it.isSoldOut); 

    if (orderItems.length === 0) {
      alert("The selected items are currently unavailable (Sold Out).");
      setCart({});
      return;
    }

    const totalPrice = orderItems.reduce((acc: number, curr) => acc + (curr.price * curr.quantity), 0);
    setParsedOrder({ orderItems, totalPrice });
    setOrderStep('verifying');
  };

  const confirmFinalOrder = () => {
    setOrderStep('placed');
    addLog('Spatial', `Order transmitted successfully to ${activeShop?.name}. Signal locked.`, 'resolved');
    setTimeout(() => {
      setIsOrdering(false);
      setParsedOrder(null);
      setOrderInput('');
      setCart({});
      setActiveShop(null); 
    }, 4000);
  };

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden selection:bg-indigo-500/30">
      <style>{`
        @keyframes siri-liquid { 0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); } 33% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(120deg) scale(1.1); } 66% { border-radius: 100% 60% 60% 100% / 100% 100% 60% 60%; transform: rotate(240deg) scale(0.9); } 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(360deg) scale(1); } }
        @keyframes siri-liquid-alt { 0% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(360deg) scale(1.1); } 50% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(180deg) scale(0.9); } 100% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(0deg) scale(1.1); } }
        @keyframes scan { 0% { top: -10%; opacity: 0; } 50% { opacity: 1; } 100% { top: 110%; opacity: 0; } }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-siri-liquid { animation: siri-liquid 8s linear infinite; }
        .animate-siri-liquid-alt { animation: siri-liquid-alt 12s ease-in-out infinite; }
        .animate-scan { animation: scan 2s linear infinite; }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>

      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        className="md:hidden fixed top-4 left-4 z-[100] w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl border border-white/20 active:scale-90 transition-transform"
      >
        <span className="text-2xl">{isSidebarOpen ? '✕' : '☰'}</span>
      </button>

      <div className={`fixed md:relative inset-y-0 left-0 z-50 w-[88%] sm:w-[450px] md:w-[450px] border-r border-white/5 bg-[#080808] flex flex-col shadow-2xl overflow-hidden transform transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-8 border-b border-white/5 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-black tracking-[0.4em] text-white">gStrEats EyAI</h1>
              <button 
                onClick={() => { setUserMode('explorer'); setExplorerTab('impact'); }}
                className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-500 overflow-hidden group shadow-[0_0_15px_rgba(99,102,241,0.2)] ${userMode === 'explorer' && explorerTab === 'impact' ? 'bg-indigo-600 text-white shadow-indigo-600/40 scale-110' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                title="Mission Impact"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span className="text-lg relative z-10 group-hover:animate-spin-slow">🌍</span>
                {userMode === 'explorer' && explorerTab === 'impact' && (
                  <span className="absolute inset-0 rounded-xl border border-indigo-400 animate-ping opacity-20"></span>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchFlavorHistory} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'history' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Flavor Genealogy</button>
            </div>
          </div>

          <div className="relative flex bg-[#1a1a1a] p-1 rounded-[1.25rem] mb-6 border border-white/5 shadow-inner overflow-hidden group">
            <div 
               className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-gradient-to-tr transition-all duration-500 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.5)] ${userMode === 'vendor' ? 'translate-x-full from-emerald-600 to-emerald-500 shadow-emerald-500/20' : 'translate-x-0 from-indigo-600 to-indigo-500 shadow-indigo-500/20'}`} 
            />
            <button 
              onClick={() => setUserMode('explorer')} 
              className={`relative z-10 flex-1 py-2.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-[0.2em] ${userMode === 'explorer' || userMode === 'history' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
            >
              Explorer
            </button>
            <button 
              onClick={() => setUserMode('vendor')} 
              className={`relative z-10 flex-1 py-2.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-[0.2em] ${userMode === 'vendor' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
            >
              Hub
            </button>
          </div>
          
          {(userMode === 'explorer' || userMode === 'history') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={startDiscovery} disabled={isMining} className="py-4 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] shadow-lg">
                  {isMining ? <SetupAnimation /> : 'Run Food Scrape'}
                </button>
                <button onClick={() => { setExplorerTab('live_vendors'); }} className={`py-4 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/20 text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] ${explorerTab === 'live_vendors' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20' : ''}`}>
                   Live Signals ({liveVendors.length})
                </button>
              </div>
              
              <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-white/5 shadow-inner">
                <button 
                  onClick={() => { setUserMode('explorer'); setExplorerTab('logs'); }} 
                  className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all duration-300 ${userMode === 'explorer' && explorerTab === 'logs' ? 'bg-white/10 text-white shadow-[0_0_10px_rgba(255, 255, 255, 0.05)]' : 'text-white/20 hover:text-white/40'}`}
                >
                  Intel
                </button>
                <button 
                  onClick={() => { setUserMode('explorer'); setExplorerTab('discovery'); }} 
                  className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all duration-300 ${userMode === 'explorer' && explorerTab === 'discovery' ? 'bg-white/10 text-white shadow-[0_0_10px_rgba(255, 255, 255, 0.05)]' : 'text-white/20 hover:text-white/40'}`}
                >
                  Legends
                </button>
                <button 
                  onClick={() => { setUserMode('explorer'); setExplorerTab('lens'); }} 
                  className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all duration-300 ${userMode === 'explorer' && explorerTab === 'lens' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
                >
                  Lens
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfileId ? (
                <div className="p-5 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-4 animate-in fade-in duration-500 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center gap-4 relative z-10">
                    <span className="text-3xl bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">{activeProfile?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white uppercase truncate tracking-tight">{activeProfile?.name}</p>
                      <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest">{activeProfile?.cuisine} Expertise</p>
                    </div>
                    <button onClick={() => setActiveProfileId(null)} className="text-[10px] text-white/20 hover:text-white transition-colors p-2">✕</button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 relative z-10">
                    <button onClick={handleToggleSignal} className={`py-4 text-[10px] font-black rounded-2xl transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${isCurrentlyLive ? 'bg-rose-600 text-white shadow-rose-600/30' : 'bg-emerald-600 text-white shadow-emerald-600/30'}`}>
                      {isCurrentlyLive ? 'DEACTIVATE LIVE SIGNAL' : 'ACTIVATE LIVE SIGNAL'}
                    </button>
                    <div className="space-y-1.5">
                       <div className="text-[8px] text-indigo-300 font-black uppercase tracking-[0.2em] px-1 text-center">
                         Fix: {location.lat.toFixed(6)} N, {location.lng.toFixed(6)} E
                       </div>
                       <div className="flex gap-2">
                         <button onClick={() => syncGPS()} disabled={isUpdatingGPS} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-[9px] font-black uppercase rounded-2xl border border-white/5 transition-all">
                           {isUpdatingGPS ? '...' : '🛰️ Sync GPS'}
                         </button>
                         <button onClick={() => activeProfile && startEditHub(activeProfile)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-[9px] font-black uppercase rounded-2xl border border-white/5 transition-all">Edit Node</button>
                       </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => { 
                  setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] as MenuItem[], youtubeLink: '', manualDMS: '', hygieneScore: 85 });
                  setIsEditing(false); 
                  setIsRegistering(true); 
                }} className="w-full py-12 border border-dashed border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 text-indigo-400/60 hover:text-indigo-400 text-[10px] font-black uppercase rounded-[3rem] transition-all group overflow-hidden relative shadow-inner">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="flex flex-col items-center gap-3 relative z-10">
                    <span className="text-4xl opacity-40 group-hover:opacity-100 transition-all duration-700">🏬</span>
                    <span className="tracking-[0.3em]">Initialize Partner Node</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {userMode === 'history' ? (
            <div className="space-y-8 animate-in fade-in duration-700 pb-20">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[11px] font-black text-amber-400 uppercase tracking-[0.3em]">Cross-Temporal Synthesis</span>
                </div>
                <button 
                  onClick={() => historyFileInputRef.current?.click()}
                  className="w-full py-4 bg-amber-600/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase rounded-2xl shadow-lg hover:bg-amber-600 hover:text-white transition-all flex items-center justify-center gap-3"
                >
                  📷 Trace Visual Genealogy
                </button>
                <input 
                  type="file" 
                  ref={historyFileInputRef} 
                  onChange={handleHistoryImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>

              {isHistoryMining ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                  <div className="text-5xl animate-bounce">🕰️</div>
                  <p className="text-[11px] font-black text-amber-400 uppercase tracking-[0.5em] text-center animate-pulse">REASONING OVER HISTORICAL TOKENS...</p>
                </div>
              ) : (
                <>
                  {imageFlavorAnalysis && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="p-6 bg-amber-950/40 border border-amber-500/40 rounded-3xl space-y-4 shadow-2xl relative overflow-hidden">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">{imageFlavorAnalysis.name}</h3>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Authenticity Grid: {imageFlavorAnalysis.authenticity_score}</p>
                          </div>
                        </div>
                        <p className="text-[12px] font-black text-white leading-relaxed italic border-l-2 border-amber-500/40 pl-4 py-1">"{imageFlavorAnalysis.narrative}"</p>
                        
                        <div className="grid grid-cols-3 gap-3 pt-2">
                           <div className="p-3 bg-black/40 border border-amber-500/20 rounded-2xl text-center">
                              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Protein</p>
                              <p className="text-[11px] font-bold text-white">{imageFlavorAnalysis.protein}</p>
                           </div>
                           <div className="p-3 bg-black/40 border border-amber-500/20 rounded-2xl text-center">
                              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Energy</p>
                              <p className="text-[11px] font-bold text-white">{imageFlavorAnalysis.calories}</p>
                           </div>
                           <div className="p-3 bg-black/40 border border-amber-500/20 rounded-2xl text-center">
                              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Carbs</p>
                              <p className="text-[11px] font-bold text-white">{imageFlavorAnalysis.carbs}</p>
                           </div>
                        </div>

                        <p className="text-[9px] text-amber-300 font-bold italic mt-2 animate-pulse">* Nutritional data is an AI estimate for educational purposes</p>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {imageFlavorAnalysis.history_tags.map((tag, i) => (
                            <span key={i} className="text-[8px] px-3 py-1.5 bg-amber-500/10 text-amber-300 font-black uppercase rounded-xl border border-amber-500/20">#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {flavorHistory && !imageFlavorAnalysis && (
                    <div className="space-y-12 pb-20 animate-in fade-in duration-700">
                      <div className="p-6 bg-amber-950/40 border border-amber-500/40 rounded-3xl relative overflow-hidden group shadow-2xl">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-3">{flavorHistory.neighborhood} Evolution</h3>
                        <p className="text-[12px] font-black text-white leading-relaxed italic border-l-2 border-amber-500/40 pl-4 py-1">"{flavorHistory.summary}"</p>
                      </div>
                      <div className="relative pl-10 space-y-12">
                        <div className="absolute left-3 top-2 bottom-2 w-1 bg-gradient-to-b from-amber-400 via-amber-400/40 to-transparent rounded-full"></div>
                        {flavorHistory.timeline.map((era, i) => (
                          <div key={i} className="relative group">
                            <div className="absolute -left-10 top-1.5 w-7 h-7 bg-amber-950 border-4 border-amber-400 rounded-full z-10 shadow-[0_0_15px_rgba(245,158,11,0.8)]"></div>
                            <div className="space-y-4">
                              <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em] block">{era.period}</span>
                              <h4 className="text-[16px] font-black text-white uppercase tracking-tight">{era.profile}</h4>
                              <p className="text-[11px] font-black text-slate-100 leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/10">{era.description}</p>
                              <div className="bg-amber-950/20 p-5 rounded-3xl border border-amber-500/20 space-y-5">
                                <div className="space-y-3">
                                  <p className="text-[9px] font-black text-amber-300 uppercase tracking-widest">Notable Staples</p>
                                  <div className="flex flex-wrap gap-2.5">
                                    {era.popularItems.map((item, j) => (
                                      <span key={j} className="text-[9px] px-3 py-1.5 rounded-xl bg-amber-400 text-black font-black uppercase">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="pb-20">
              {userMode === 'explorer' ? (
                <>
                  {explorerTab === 'impact' ? (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="p-6 bg-indigo-950/20 border border-indigo-500/20 rounded-[2rem] space-y-4">
                         <div className="flex items-center gap-3">
                            <span className="text-2xl">🌍</span>
                            <h3 className="text-[14px] font-black text-white uppercase tracking-tighter">Mission: Street Visibility</h3>
                         </div>
                         <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                           In Tamil Nadu, street vendors are the backbone of the urban grid. However, a massive digital divide exists.
                         </p>
                         <div className="grid grid-cols-2 gap-3 pt-2">
                           <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-1">
                             <p className="text-[18px] font-black text-rose-500 leading-none">300K</p>
                             <p className="text-[7px] font-black uppercase text-rose-400/60 tracking-widest">Govt Identified</p>
                           </div>
                           <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1">
                             <p className="text-[18px] font-black text-emerald-500 leading-none">500K+</p>
                             <p className="text-[7px] font-black uppercase text-emerald-400/60 tracking-widest">Estimated Total</p>
                           </div>
                         </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em] px-2">The Solution: EyAI</h4>
                        <div className="space-y-3">
                          {[
                            { icon: '📡', title: 'Live Grid Sync', desc: 'Allowing half a million vendors to broadcast their location.' },
                            { icon: '🧠', title: 'Spatial Reasoning', desc: 'Gemini-powered wait time and footfall predictions.' },
                            { icon: '📜', title: 'Flavor Genealogy', desc: 'Tracing the cultural migration of street food icons.' }
                          ].map((item, i) => (
                            <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex gap-4 items-start">
                              <span className="text-xl bg-white/5 p-2 rounded-xl">{item.icon}</span>
                              <div className="space-y-1">
                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{item.title}</p>
                                <p className="text-[9px] text-slate-500 leading-relaxed">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-6 bg-gradient-to-br from-indigo-600/20 to-transparent border border-indigo-500/30 rounded-[2.5rem] text-center space-y-2 shadow-2xl">
                         <p className="text-[8px] font-black text-indigo-300 uppercase tracking-widest">Target Objective</p>
                         <p className="text-[14px] font-black text-white uppercase tracking-tighter italic">"Syncing 500,000 Micro-Economies"</p>
                      </div>
                    </div>
                  ) : explorerTab === 'logs' ? (
                    <div className="space-y-4">
                      <button onClick={runVerificationSuite} disabled={isVerifying} className="w-full py-4 mb-4 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg flex items-center justify-center gap-3">
                        {isVerifying ? "Running Coordination Loop..." : "🚀 Run Autonomous Verification"}
                      </button>
                      
                      <AgentCoordinationScene activeAgent={activeAgentName} />

                      {logs.map(l => (
                        <div key={l.id} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0a] animate-in slide-in-from-left-4 duration-300">
                          <span className={`text-[7px] font-black px-2 py-0.5 rounded border uppercase ${l.agent === 'Linguistic' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>{l.agent}</span>
                          <p className="text-[10px] font-bold leading-relaxed mt-2 text-slate-400 whitespace-pre-line">{l.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : explorerTab === 'discovery' ? (
                    <div className="space-y-6">
                      {isMining ? (
                        <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                          <div className="relative text-6xl animate-bounce drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">🛰️</div>
                          <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em] animate-pulse">CALIBRATING SPATIAL GRID...</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex bg-[#0a0a0a] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                            <button onClick={() => setDiscoverySubTab('nodes')} className={`flex-1 py-3 text-[9px] font-black uppercase rounded-xl transition-all ${discoverySubTab === 'nodes' ? 'bg-indigo-600 text-white' : 'text-white/30'}`}>Nodes</button>
                            <button onClick={() => { setDiscoverySubTab('intelligence'); computeAnalytics(); }} className={`flex-1 py-3 text-[9px] font-black uppercase rounded-xl transition-all ${discoverySubTab === 'intelligence' ? 'bg-indigo-600 text-white' : 'text-white/30'}`}>Intelligence</button>
                          </div>
                          {discoverySubTab === 'intelligence' && (
                            <div className="space-y-8 animate-in fade-in duration-700">
                              {isAnalyzing ? (
                                <div className="py-20 flex flex-col items-center justify-center space-y-8">
                                  <div className="text-6xl animate-spin">📊</div>
                                  <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em] animate-pulse text-center">GENERATING SPATIAL INSIGHTS...</p>
                                </div>
                              ) : analytics ? (
                                <div className="space-y-10 pb-20">
                                  <div className="p-6 bg-indigo-950/40 border border-indigo-500/40 rounded-[2.5rem] space-y-3 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl">📈</div>
                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Sector Synthesis</p>
                                    <p className="text-[11px] font-bold text-slate-100 leading-relaxed italic">"{analytics.sectorSummary}"</p>
                                  </div>

                                  <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-2">Flavor Variance</p>
                                    <div className="grid grid-cols-1 gap-3">
                                      {analytics.cuisineDistribution.map((c, i) => (
                                        <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                                          <div className="flex justify-between items-center text-[11px] font-black uppercase">
                                            <span className="text-white">{c.label}</span>
                                            <span className="text-indigo-400">{c.percentage}%</span>
                                          </div>
                                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.percentage}%` }}></div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-2">S-Sanitation Index (Infra + Env)</p>
                                    <div className="p-6 bg-white/5 border border-white/5 rounded-[2rem] space-y-4 shadow-inner">
                                       <RegionalHygieneChart shops={discoveredShops} />
                                       <p className="text-[8px] font-bold text-slate-500 uppercase text-center tracking-widest">Regional Stress-Weighted Health Spectrum</p>
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-2">Economic Zoning</p>
                                    <div className="grid grid-cols-1 gap-4">
                                      {analytics.priceSpectrum.map((p, i) => (
                                        <div key={i} className="p-5 bg-white/5 border border-white/5 rounded-[2rem] space-y-3">
                                          <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">{p.range}</h4>
                                          <div className="flex flex-wrap gap-2">
                                            {p.nodes.map((node, j) => (
                                              <span key={j} className="text-[9px] px-3 py-1 bg-white/5 border border-white/10 text-white/60 rounded-lg">{node}</span>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-2">Legendary Calibration</p>
                                    <div className="space-y-4">
                                      {analytics.legendaryIndex.map((l, i) => (
                                        <div key={i} className="p-5 bg-indigo-600/5 border border-indigo-500/20 rounded-[2rem] space-y-2 transition-all hover:bg-indigo-600/10">
                                          <div className="flex justify-between items-center">
                                            <span className="text-[13px] font-black text-white uppercase tracking-tight">{l.name}</span>
                                            <span className="text-[14px] font-black text-indigo-400">{l.score}</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 italic leading-relaxed">"{l.reasoning}"</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-2">Grid Demographics</p>
                                    <div className="grid grid-cols-1 gap-3">
                                      {analytics.customerSegmentation.map((s, i) => (
                                        <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4">
                                          <div className="w-10 h-10 shrink-0 bg-white/10 rounded-xl flex items-center justify-center font-black text-white text-[10px]">{s.volume}%</div>
                                          <div className="flex-1 min-w-0">
                                             <p className="text-[11px] font-black text-white uppercase truncate">{s.segment}</p>
                                             <p className="text-[9px] text-slate-500 truncate">{s.description}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="py-20 text-center opacity-20">
                                  <p className="text-[10px] font-black uppercase tracking-widest">No Intelligence Data available in this sector.</p>
                                  <button onClick={() => computeAnalytics()} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-black uppercase transition-all">Manual Sync</button>
                                </div>
                              )}
                            </div>
                          )}
                          {discoverySubTab === 'nodes' && (
                            <div className="space-y-4 pt-4">
                              {discoveredShops.map((s, i) => (
                                <button key={s.id} onClick={() => handleShopSelect(s)} className="w-full p-6 rounded-[2.5rem] bg-indigo-950/10 hover:bg-indigo-600/20 border border-indigo-500/10 text-left transition-all group flex items-center gap-5">
                                  <div className="shrink-0 w-16 h-16 bg-gradient-to-br from-indigo-600/20 to-indigo-900/40 rounded-[1.25rem] flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-2xl">
                                    <span>{s.emoji}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-black text-white uppercase truncate tracking-tighter">{s.name}</p>
                                    <p className="text-[10px] text-indigo-400/60 font-black uppercase truncate tracking-[0.2em]">{s.cuisine}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : explorerTab === 'lens' ? (
                    <div className="space-y-6 h-full flex flex-col">
                      <div className="px-2 py-4 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1 items-center justify-center text-center">
                         <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Active Lens Target</p>
                         <h4 className="text-[14px] font-black text-white uppercase tracking-tighter">
                           {lensTargetName || "Select a Food Node"}
                         </h4>
                      </div>
                      {isLensAnalyzing ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
                          <div className="relative w-40 h-40 bg-indigo-600/5 rounded-3xl border border-indigo-500/20 overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/20 to-transparent h-1/2 animate-scan"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-5xl animate-pulse">👁️</span>
                            </div>
                          </div>
                          <div className="text-center space-y-2">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] animate-pulse">Analyzing Visual Nodes...</p>
                            <p className="text-[8px] text-white/20 uppercase tracking-widest">Cross-referencing spatial metadata</p>
                          </div>
                        </div>
                      ) : lensAnalysis ? (
                        <div className="space-y-8 overflow-y-auto custom-scrollbar pb-10">
                          <div className="space-y-4">
                            <p className="text-[10px] font-black text-white uppercase tracking-[0.4em] px-2">Spatial Observations</p>
                            {lensAnalysis.observations.map((obs, i) => (
                              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2 animate-in slide-in-from-left-4 duration-300">
                                <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase ${obs.type === 'bottleneck' ? 'bg-rose-500/10 text-rose-500' : 'bg-indigo-500/10 text-indigo-400'}`}>{obs.type}</span>
                                <h5 className="text-[11px] font-black text-white uppercase leading-relaxed tracking-tight">{obs.detail}</h5>
                                <p className="text-[9px] text-slate-400 leading-relaxed italic border-l border-indigo-500/30 pl-3">"{obs.causalBottleneck}"</p>
                              </div>
                            ))}
                          </div>

                          {lensShopData?.safetyMetrics && (
                            <div className="p-6 bg-indigo-600/5 border border-indigo-500/20 rounded-[2.5rem] space-y-6 animate-in fade-in duration-700">
                              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.4em] text-center border-b border-indigo-500/10 pb-4">Safety Intelligence</p>
                              <SafetyRadar metrics={lensShopData.safetyMetrics} />
                              <div className="space-y-3 pt-2">
                                <SafetyMetricBar label="Crime" value={lensShopData.safetyMetrics.crimeSafety} />
                                <SafetyMetricBar label="Police" value={lensShopData.safetyMetrics.policeProximity} />
                                <SafetyMetricBar label="Lighting" value={lensShopData.safetyMetrics.lighting} />
                              </div>
                              {lensShopData.safetyMetrics.nearestPoliceStations && lensShopData.safetyMetrics.nearestPoliceStations.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-indigo-500/10">
                                  <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Nearest Police Precincts</p>
                                  <div className="flex flex-col gap-1.5">
                                    {lensShopData.safetyMetrics.nearestPoliceStations.map((station, i) => (
                                      <div key={i} className="px-3 py-2 bg-indigo-500/10 rounded-xl border border-indigo-500/10 flex items-center gap-2">
                                        <span className="text-10px]">👮</span>
                                        <span className="text-[10px] font-black text-indigo-300 uppercase tracking-tight">{station}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {lensShopData?.urbanLogistics && (
                            <div className="p-6 bg-emerald-600/5 border border-emerald-500/20 rounded-[2.5rem] space-y-6 animate-in fade-in duration-700">
                              <p className="text-[10px] font-black text-emerald-300 uppercase tracking-[0.4em] text-center border-b border-emerald-500/10 pb-4">Urban Logistics</p>
                              <LogisticsRadar logistics={lensShopData.urbanLogistics} />
                              <div className="space-y-3 pt-2">
                                <LogisticsMetricBar label="Transit" value={lensShopData.urbanLogistics.transitAccessibility} />
                                <LogisticsMetricBar label="Walkability" value={lensShopData.urbanLogistics.walkabilityScore} />
                                <LogisticsMetricBar label="Parking" value={lensShopData.urbanLogistics.parkingAvailability} />
                              </div>
                              {lensShopData.urbanLogistics.publicTransportNodes && lensShopData.urbanLogistics.publicTransportNodes.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-emerald-500/10">
                                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Nearby Transport Nodes</p>
                                  <div className="flex flex-col gap-1.5">
                                    {lensShopData.urbanLogistics.publicTransportNodes.map((node, i) => (
                                      <div key={i} className="px-3 py-2 bg-emerald-500/10 rounded-xl border border-indigo-500/10 flex items-center gap-2">
                                        <span className="text-10px]">🚌</span>
                                        <span className="text-[10px] font-black text-emerald-300 uppercase tracking-tight">{node}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {lensShopData?.predictedFootfall && (
                            <div className="p-6 bg-rose-600/5 border border-rose-500/20 rounded-[2.5rem] space-y-6 animate-in fade-in duration-700">
                              <p className="text-[10px] font-black text-rose-300 uppercase tracking-[0.4em] text-center border-b border-rose-500/10 pb-4">Traffic Intelligence</p>
                              <FootfallChart data={lensShopData.predictedFootfall} />
                              <p className="text-[8px] text-rose-300/95 uppercase font-black tracking-widest text-center">Temporal Density Analysis</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-20 text-center opacity-20">
                          <p className="text-[10px] font-black uppercase tracking-widest">Lens System Idle.</p>
                        </div>
                      )}
                    </div>
                  ) : explorerTab === 'live_vendors' ? (
                    <div className="space-y-6">
                      {liveVendors.map((v, i) => (
                        <button key={v.id} onClick={() => handleShopSelect(v)} className="w-full p-5 rounded-[2rem] bg-emerald-600/5 border border-emerald-500/20 text-left transition-all hover:bg-emerald-600/10 flex items-center gap-4 animate-in slide-in-from-right-4">
                          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{v.emoji}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-black text-white uppercase truncate">{v.name}</p>
                            <p className="text-[9px] text-emerald-400 font-black uppercase">Live Signal</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-4">
                  {!activeProfileId && myProfiles.map(p => (
                    <div key={p.id} className="w-full p-5 rounded-[2rem] bg-[#0a0a0a] border border-white/10 hover:border-white/20 flex justify-between items-center transition-all group shadow-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">{p.emoji}</span>
                        <div>
                          <p className="text-[12px] font-black text-white uppercase leading-none">{p.name}</p>
                          <p className="text-[9px] text-white/40 font-black uppercase mt-1">{p.cuisine}</p>
                        </div>
                      </div>
                      <button onClick={() => setActiveProfileId(p.id)} className="px-6 py-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-[9px] font-black uppercase rounded-2xl transition-all shadow-inner">Manage</button>
                    </div>
                  ))}
                  {activeProfileId && (
                    <div className="p-6 bg-indigo-600/5 border border-indigo-500/10 rounded-3xl">
                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center">Node Under Active Management</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-[#020202]">
        <FoodMap center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {isOrdering && activeShop && (
          <div className="fixed inset-0 z-[7000] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-500">
            <div className="max-w-3xl w-full bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] md:rounded-[4rem] p-6 md:p-16 space-y-8 md:space-y-12 shadow-2xl relative overflow-y-auto max-h-[95vh] custom-scrollbar">
              <button onClick={() => setIsOrdering(false)} className="absolute top-6 right-6 md:top-12 md:right-12 text-2xl text-white/40 hover:text-white p-2 transition-colors">✕</button>
              <div className="flex flex-col items-center gap-4 md:gap-6">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-white/5 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-3xl md:text-5xl border border-white/10">{activeShop.emoji}</div>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tighter">{activeShop.name}</h2>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setChatLang('en-US')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black border transition-all ${chatLang === 'en-US' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40'}`}>English</button>
                    <button onClick={() => setChatLang('ta-IN')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black border transition-all ${chatLang === 'ta-IN' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40'}`}>தமிழ்</button>
                  </div>
                </div>
              </div>
              
              {orderStep === 'menu' && (
                <div className="space-y-8 md:space-y-12 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 gap-3 md:gap-4 max-h-[300px] md:max-h-[400px] overflow-y-auto custom-scrollbar pr-2 md:pr-4">
                    {activeShop.menu?.map((item, idx) => (
                      <div key={idx} className={`flex justify-between items-center p-4 md:p-6 bg-white/5 border border-white/5 rounded-[1.5rem] md:rounded-[2rem] hover:bg-white/10 transition-all ${item.isSoldOut ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex flex-col">
                          <span className="text-[14px] md:text-[16px] font-black text-white uppercase tracking-tight">
                            {item.name} {item.isSoldOut && <span className="ml-2 text-[10px] px-2 py-0.5 bg-rose-600 text-white rounded-lg">SOLD OUT</span>}
                          </span>
                          <span className="text-[12px] md:text-[13px] font-black text-emerald-400">₹{item.price}</span>
                        </div>
                        <div className="flex items-center gap-4 md:gap-6">
                          <button onClick={() => updateCart(item.name, -1)} className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-white active:scale-90" disabled={item.isSoldOut}>-</button>
                          <span className={`text-lg md:text-xl font-black w-6 md:w-8 text-center ${cart[item.name] ? 'text-indigo-400' : 'text-white/20'}`}>{cart[item.name] || 0}</span>
                          <button onClick={() => updateCart(item.name, 1)} className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-white active:scale-90" disabled={item.isSoldOut}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-6 bg-black/40 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border border-white/5 shadow-inner">
                    <div className="flex flex-col items-center gap-4 mb-4">
                       <VoiceWave isActive={isListening || isParsingOrder} isSpeaking={isParsingOrder} />
                       <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest text-center">
                         {isParsingOrder ? (chatLang === 'ta-IN' ? "முகவர் உங்கள் ஆர்டரை எழுதுகிறார்..." : "Agent is writing down your order...") : 
                          isListening ? (chatLang === 'ta-IN' ? "கேட்கிறது..." : "Listening to Signal...") : 
                          (chatLang === 'ta-IN' ? "உங்கள் ஆர்டரைச் சொல்லுங்கள் (எ.கா. 'biryani rendu venum')" : "State items to ADD via voice (e.g. 'Add 2 Biryanis')")}
                       </p>
                    </div>
                    <div className="flex gap-4">
                       <button onClick={() => {
                          const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                          if (R) {
                            const r = new R();
                            r.lang = chatLang;
                            r.onstart = () => setIsListening(true);
                            r.onend = () => setIsListening(false);
                            r.onresult = (e: any) => {
                              const transcript = e.results[0][0].transcript;
                              setOrderInput(transcript);
                              processOrderInput(transcript);
                            };
                            r.start();
                          }
                       }} disabled={isParsingOrder} className={`p-6 md:p-8 rounded-2xl md:rounded-[2rem] transition-all shadow-2xl active:scale-95 border flex flex-col items-center gap-2 min-w-[100px] md:min-w-[120px] ${isListening ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50' : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'}`}>
                         <span className="text-2xl md:text-3xl">{isListening ? '⏹️' : '🎤'}</span>
                         <span className="text-[9px] font-black uppercase">{isListening ? 'REC' : 'MIC'}</span>
                       </button>
                       <div className="flex-1 flex flex-col gap-4">
                          <input value={orderInput} onChange={e => setOrderInput(e.target.value)} placeholder={chatLang === 'ta-IN' ? "எ.கா. 2 பிரியாணி..." : "e.g. 2 Biryanis..."} className="w-full bg-black/60 border border-white/10 rounded-2xl md:rounded-[2rem] px-6 md:px-10 py-5 md:py-8 text-lg md:text-xl text-white outline-none focus:border-indigo-500 transition-all shadow-inner placeholder:text-white/10" />
                          <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => processOrderInput()} disabled={isParsingOrder || !orderInput} className="py-4 md:py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.25rem] md:rounded-[1.5rem] font-black text-[12px] md:text-[14px] uppercase shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30">
                              {isParsingOrder ? (chatLang === 'ta-IN' ? 'சரிபார்க்கிறது...' : 'Processing...') : (chatLang === 'ta-IN' ? 'பட்டியலில் சேர்' : 'Voice/Text Add')}
                            </button>
                            <button onClick={proceedToVerify} disabled={isParsingOrder || Object.keys(cart).length === 0} className="py-4 md:py-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.25rem] md:rounded-[1.5rem] font-black text-[12px] md:text-[14px] uppercase shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2">
                              {chatLang === 'ta-IN' ? `சரிபார்க்கவும் (${cartTotalItems})` : `Finalize (${cartTotalItems})`}
                            </button>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              )}
              {orderStep === 'verifying' && parsedOrder && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                   <div className="bg-white/5 p-6 md:p-10 rounded-[2rem] border border-white/10 space-y-6">
                     {parsedOrder.orderItems.map((it: any, i: number) => (
                       <div key={i} className="flex justify-between items-center border-b border-white/5 pb-4">
                         <span className="text-white font-black uppercase text-sm md:text-base">{it.quantity}x {it.name}</span>
                         <span className="text-slate-400 tabular-nums font-bold">₹{it.price * it.quantity}</span>
                       </div>
                     ))}
                     <div className="flex justify-between items-center pt-4">
                        <span className="text-[10px] md:text-[12px] font-black text-indigo-400 uppercase tracking-widest">Grid Energy Total</span>
                        <span className="text-2xl md:text-4xl font-black text-white">₹{parsedOrder.totalPrice}</span>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setOrderStep('menu')} className="py-5 bg-white/5 text-white/40 uppercase font-black text-[12px] rounded-3xl border border-white/5">Back</button>
                      <button onClick={confirmFinalOrder} className="py-5 bg-emerald-600 text-white uppercase font-black text-[12px] rounded-3xl shadow-2xl">Place Order</button>
                   </div>
                </div>
              )}
              {orderStep === 'placed' && (
                <div className="py-24 flex flex-col items-center justify-center space-y-12 animate-in zoom-in-95">
                   <div className="w-32 h-32 md:w-40 md:h-40 bg-emerald-600 rounded-full flex items-center justify-center text-6xl md:text-8xl text-white animate-bounce shadow-[0_0_80px_rgba(16,185,129,0.5)]">✓</div>
                   <h3 className="text-3xl md:text-5xl font-black text-white uppercase text-center tracking-tighter">Order Transmitted</h3>
                </div>
              )}
            </div>
          </div>
        )}

        {isRegistering && (
          <div className="fixed inset-0 z-[7500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-500 overflow-y-auto">
            <div className="max-w-4xl w-full bg-[#080808] border border-white/10 rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-12 space-y-10 shadow-[0_50px_150px_rgba(0,0,0,1)] border-t-white/20 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">{isEditing ? 'Modify Node Data' : 'Establish Node Signal'}</h2>
                  <p className="text-[11px] text-white/40 font-black uppercase tracking-[0.3em] mt-1">{isEditing ? 'Updating live manifest' : 'Onboarding legend'}</p>
                </div>
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white/60 transition-all hover:rotate-90">✕</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
                <div className="space-y-8">
                  <div className="grid grid-cols-4 gap-6">
                    <div className="col-span-1 space-y-2">
                      <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Symbol</label>
                      <input value={regForm.emoji} onChange={e => setRegForm({...regForm, emoji: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-5 text-center text-2xl shadow-inner focus:border-indigo-500 transition-all outline-none text-white" />
                    </div>
                    <div className="col-span-3 space-y-2">
                      <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Hub Alias</label>
                      <input placeholder="E.g. Murali's Snacks" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[15px] outline-none focus:border-indigo-500 shadow-inner transition-all font-bold text-white placeholder:text-white/30" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Cuisine Specialty</label>
                    <input placeholder="E.g. Authentic Rose Milk" value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[12px] shadow-inner focus:border-indigo-500 outline-none transition-all text-white placeholder:text-white/30" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">S-Sanitation Index (Infra/Env) ({regForm.hygieneScore}%)</label>
                    <input type="range" min="0" max="100" value={regForm.hygieneScore} onChange={e => setRegForm({...regForm, hygieneScore: parseInt(e.target.value)})} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    <div className="flex justify-between text-[7px] font-black uppercase text-white/40 tracking-widest px-1">
                       <span>Low Alpha</span>
                       <span>Mid Range</span>
                       <span>Optimal</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Manual Coordinates (DMS)</label>
                    <div className="flex gap-2">
                      <input placeholder={`13°05'41.5"N 80°10'30.2"E`} value={regForm.manualDMS} onChange={e => setRegForm({...regForm, manualDMS: e.target.value})} className="flex-1 bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[11px] shadow-inner focus:border-indigo-500 outline-none transition-all text-white placeholder:text-white/20" />
                      <button onClick={handleApplyDMS} className="px-6 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase rounded-2xl border border-white/10 transition-all">Apply</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black uppercase text-indigo-400">Broadcast Bio</label>
                      <button onClick={generateBio} disabled={isGeneratingBio} className="text-[9px] font-black uppercase text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-2">{isGeneratingBio ? '...' : '✨ Gemini Bio'}</button>
                    </div>
                    <textarea rows={4} value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[12px] resize-none focus:border-indigo-500 outline-none transition-all leading-relaxed text-white placeholder:text-white/30" />
                  </div>
                </div>
                <div className="flex flex-col h-full space-y-8">
                  <div className="space-y-4 flex-1">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Inventory Manifest (Menu)</label>
                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 min-h-[200px] flex flex-col gap-3 custom-scrollbar overflow-y-auto max-h-[350px]">
                      {regForm.menu.map((item, idx) => (
                        <div key={idx} className={`flex justify-between items-center bg-white/10 p-4 rounded-2xl group animate-in slide-in-from-left-2 transition-all ${item.isSoldOut ? 'border-rose-500/50' : 'border-transparent'}`}>
                          <div className="flex flex-col">
                            <span className={`text-[12px] font-black uppercase tracking-tight ${item.isSoldOut ? 'text-slate-500 line-through' : 'text-white'}`}>{item.name} <span className="text-emerald-400 ml-2">₹{item.price}</span></span>
                            {item.isSoldOut && <span className="text-[8px] font-black text-rose-500 uppercase">OFF-SHELF</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <button onClick={() => toggleMenuItemSoldOut(idx)} className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase transition-all ${item.isSoldOut ? 'bg-rose-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}>
                              {item.isSoldOut ? 'Restock' : 'Sold Out'}
                            </button>
                            <button onClick={() => removeMenuItem(idx)} className="text-white/20 group-hover:text-rose-500 p-1 transition-colors">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4 bg-white/10 p-6 rounded-[2.5rem] border border-white/5 shadow-inner">
                    <div className="grid grid-cols-3 gap-3">
                      <input placeholder="Item" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="col-span-2 bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none" />
                      <input placeholder="Price" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none" />
                    </div>
                    <button onClick={addMenuItem} className="w-full py-4 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg">+ Add to Manifest</button>
                  </div>
                </div>
              </div>
              <div className="pt-10 flex flex-col sm:flex-row gap-6 border-t border-white/5">
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="flex-1 py-6 text-[12px] font-black uppercase text-white/40 bg-white/10 rounded-2xl transition-all hover:bg-white/20">Cancel</button>
                <button onClick={handleSaveHub} className="flex-1 py-6 text-[12px] font-black uppercase text-white bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20">Activate Partner Node</button>
              </div>
            </div>
          </div>
        )}

        {isReviewing && activeShop && (
          <div className="fixed inset-0 z-[8000] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
            <div className="max-w-xl w-full bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-8 md:p-12 space-y-8 shadow-[0_50px_100px_rgba(0,0,0,0.8)]">
              <div className="flex justify-between items-center">
                <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Add Exploratory Review</h2>
                <button onClick={() => setIsReviewing(false)} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Alias</label>
                  <input value={reviewForm.author} onChange={e => setReviewForm({...reviewForm, author: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setReviewForm({...reviewForm, rating: star})} className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all ${reviewForm.rating >= star ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30' : 'bg-white/5 text-white/20'}`}>
                        ⭐
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Commentary</label>
                  <textarea rows={4} value={reviewForm.comment} onChange={e => setReviewForm({...reviewForm, comment: e.target.value})} placeholder="Shared knowledge regarding flavor profile..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-indigo-500 resize-none" />
                </div>
                <button onClick={handleSaveReview} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[12px] shadow-2xl shadow-indigo-600/20 transition-all active:scale-95">Commit Review</button>
              </div>
            </div>
          </div>
        )}

        {activeShop && !isOrdering && (
          <div className="absolute bottom-6 left-4 right-4 md:bottom-10 md:left-10 md:right-10 z-[1000] animate-in slide-in-from-bottom-10 duration-700">
            <div className="max-w-4xl mx-auto bg-black/95 backdrop-blur-3xl p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border border-white/10 shadow-[0_25px_100px_rgba(0,0,0,0.8)] flex flex-col md:flex-row gap-6 md:gap-8 relative overflow-hidden border-t-white/20">
              <button onClick={() => { stopAudio(); setActiveShop(null); }} className="absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/60 p-2 transition-all z-[30]">✕</button>
              
              <div className="flex flex-col gap-4 shrink-0 mx-auto md:mx-0 w-full md:w-32 items-center md:items-start">
                <div className="text-5xl md:text-7xl bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border border-white/5 h-fit shadow-2xl flex items-center justify-center shrink-0">
                   <span>{activeShop.emoji}</span>
                </div>
                
                <div className="mt-2 group relative">
                   <HygieneGauge score={activeShop.hygieneScore || 85} />
                   <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-lg text-[7px] font-black text-white/60 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none z-30">
                     Infra + Env Sanitation Health
                   </div>
                </div>

                {activeShop.reviews && activeShop.reviews.length > 0 && (
                  <div className="bg-amber-600/10 border border-amber-600/30 px-3 py-1.5 rounded-xl flex items-center justify-center gap-2 shrink-0 w-full">
                    <span className="text-amber-500 text-sm">⭐</span>
                    <span className="text-white font-black text-xs">{(activeShop.reviews.reduce((a, b) => a + b.rating, 0) / activeShop.reviews.length).toFixed(1)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 min-w-0 flex flex-col">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xl md:text-3xl font-black text-white uppercase tracking tight truncate leading-tight">{activeShop.name}</h3>
                    <p className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{activeShop.cuisine}</p>
                  </div>
                  <div className="shrink-0 pt-1">
                    <VoiceWave isActive={isVoiceActive} isSpeaking={isSpeaking} onStop={stopAudio} />
                  </div>
                </div>
                
                <div className="flex-1 space-y-4 overflow-y-auto max-h-[320px] md:max-h-[420px] custom-scrollbar pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs md:text-sm text-white/80 leading-relaxed italic">"{activeShop.description}"</p>
                      {footfallPrediction && (
                        <div className="bg-indigo-600/10 border border-indigo-500/20 p-3 md:p-4 rounded-2xl">
                          <p className="text-[7px] md:text-[8px] font-black uppercase text-indigo-400/60 mb-1 tracking-widest">Predictive Footfall engine</p>
                          <p className="text-[10px] md:text-[11px] font-bold text-slate-100 italic">"{footfallPrediction}"</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Success Reasoning Chart for Every Vendor Location */}
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-4 space-y-2">
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em] text-center mb-1">Success Breakdown Index</p>
                      <SuccessReasoningChart shop={activeShop} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center sticky top-0 bg-black/10 backdrop-blur-md py-1">
                      <p className="text-[8px] font-black text-white uppercase tracking-[0.3em]">Field Intelligence ({activeShop.reviews?.length || 0})</p>
                      <button onClick={() => setIsReviewing(true)} className="text-[8px] font-black text-amber-500 uppercase hover:text-amber-400 transition-colors">+ Add Review</button>
                    </div>
                    <div className="space-y-3">
                      {activeShop.reviews && activeShop.reviews.length > 0 ? (
                        activeShop.reviews.map((rev, i) => (
                          <div key={rev.id} className="bg-white/5 border border-white/5 p-3 rounded-2xl space-y-1.5 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-black text-white uppercase">{rev.author}</span>
                              <span className="text-[9px] text-amber-500">{'⭐'.repeat(rev.rating)}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 italic">"{rev.comment}"</p>
                            <p className="text-[7px] text-slate-600 uppercase font-black text-right">{rev.timestamp}</p>
                          </div>
                        ))
                      ) : (
                        <div className="py-4 border border-dashed border-white/5 rounded-2xl text-center opacity-30">
                          <p className="text-[9px] font-black uppercase tracking-widest">No exploration logs yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5 mt-auto shrink-0">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="px-6 py-4 bg-white text-black text-[10px] md:text-[11px] font-black uppercase rounded-2xl shadow-2xl text-center active:scale-95 transition-transform">🛰️ Navigate</a>
                  {activeShop.isVendor && activeShop.status === VendorStatus.ONLINE && (
                    <button onClick={initiateOrder} className="flex-1 py-4 bg-emerald-600 text-white text-[10px] md:text-[11px] font-black uppercase rounded-2xl shadow-2xl active:scale-95 transition-transform border border-emerald-400/20">🛒 Order Now</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`fixed bottom-6 right-6 md:bottom-10 md:right-10 z-[4000] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isChatOpen ? 'w-[calc(100vw-48px)] sm:w-[480px] h-[75vh] sm:h-[720px]' : 'w-16 h-16 md:w-24 md:h-24'}`}>
          {!isChatOpen ? (
            <button onClick={() => setIsChatOpen(true)} className="w-full h-full bg-indigo-600 rounded-[2rem] md:rounded-[3rem] flex items-center justify-center text-white text-3xl md:text-4xl shadow-[0_25px_60px_rgba(79,70,229,0.5)] transition-all group overflow-hidden active:scale-90">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <span className="relative z-10">💬</span>
            </button>
          ) : (
            <div className="w-full h-full bg-[#080808]/98 backdrop-blur-3xl border border-white/10 rounded-[3rem] md:rounded-[4rem] flex flex-col overflow-hidden shadow-[0_60px_180px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-500 border-t-white/20">
              <div className="p-8 md:p-12 bg-white/5 border-b border-white/5 flex justify-between items-center shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-[12px] md:text-[14px] font-black text-white tracking-[0.4em] uppercase">gStrEats Voice</h3>
                  <p className="hidden md:block text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-2 opacity-60">Spatial Reasoning Engine</p>
                </div>
                <div className="bg-black/50 p-1.5 md:p-2 rounded-2xl flex border border-white/10 shadow-inner mr-4">
                  <button onClick={() => setChatLang('en-US')} className={`px-4 md:px-5 py-1.5 md:py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'en-US' ? 'bg-indigo-600 text-white' : 'text-white/20 hover:text-white/40'}`}>EN</button>
                  <button onClick={() => setChatLang('ta-IN')} className={`px-4 md:px-5 py-1.5 md:py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'ta-IN' ? 'bg-indigo-600 text-white' : 'text-white/20 hover:text-white/40'}`}>TA</button>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white/60 p-2 transition-all">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8 md:space-y-10 custom-scrollbar">
                {chatHistory.map(m => (
                  <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`max-w-[92%] p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] text-[14px] md:text-[15px] font-bold leading-relaxed shadow-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white/10 text-white border border-white/10 rounded-bl-none shadow-black/40'}`}>
                      {m.isThinking ? <p className="animate-pulse">Thinking...</p> : <p>{m.text}</p>}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-6 md:p-10 bg-black/60 border-t border-white/10 flex flex-col gap-4 shrink-0">
                <div className="flex gap-3 md:gap-4 items-center">
                  <button 
                    onClick={handleChatVoice} 
                    className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full flex items-center justify-center transition-all shadow-xl border ${isListening ? 'bg-rose-600 border-rose-500 animate-pulse text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}
                  >
                    <span className="text-xl md:text-2xl">{isListening ? '⏹️' : '🎤'}</span>
                  </button>
                  <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(chatInput); }} className="flex-1 flex gap-3 md:gap-4">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Query grid..." className="flex-1 bg-white/10 border border-white/10 rounded-2xl md:rounded-3xl px-5 md:px-8 py-4 md:py-6 text-sm md:text-base text-white outline-none focus:border-indigo-500 shadow-inner" />
                    <button type="submit" className="px-6 md:px-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl md:rounded-3xl font-black text-[12px] md:text-[14px] uppercase shadow-lg transition-all active:scale-95">Send</button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
