import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Radar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import noUiSlider from 'nouislider';
import type { API as NoUiSliderAPI } from 'nouislider';
import 'nouislider/dist/nouislider.css';
import Papa from 'papaparse';
import { makers, type FursuitMaker } from '../data/makers';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, CategoryScale, LinearScale);

const platformIcons: Record<string, string> = {
  twitter: '𝕏',
  instagram: '📷',
  telegram: '✈',
  furaffinity: '🎨',
};

const statusColors = {
  Open: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500', pulse: 'status-open' },
  Closed: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500', pulse: 'status-closed' },
  Waitlist: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500', pulse: 'status-waitlist' },
};

const typeColors: Record<string, string> = {
  Fullsuit: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Partial: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Head: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Paws: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Tail: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

const statusTranslation: Record<string, string> = {
  Open: 'BUKA',
  Closed: 'TUTUP',
  Waitlist: 'ANTRIAN',
};

function formatCurrency(n: number) {
  if (n >= 1000) {
    return 'Rp ' + (n / 1000).toLocaleString('id-ID') + ' K';
  }
  return 'Rp ' + n.toLocaleString('id-ID');
}

function gaussianKernel(x: number) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

function calculateKDE(data: number[], points: number[], bandwidth: number) {
  return points.map(x => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += gaussianKernel((x - data[i]) / bandwidth);
    }
    return sum / (data.length * bandwidth);
  });
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default function Home() {
  const [dataMakers, setDataMakers] = useState<FursuitMaker[]>(makers);
  const [filteredMakers, setFilteredMakers] = useState<FursuitMaker[]>(makers);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [hoveredImage, setHoveredImage] = useState<{ src: string; index: number } | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [showAnalytics, setShowAnalytics] = useState(true);
  const sliderRef = useRef<HTMLDivElement>(null);
  const sliderInstanceRef = useRef<NoUiSliderAPI | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000000]);

  // Initialize noUiSlider
  useEffect(() => {
    if (!sliderRef.current) return;

    // Clean up existing slider if HMR triggers
    if ((sliderRef.current as any).noUiSlider) {
      (sliderRef.current as any).noUiSlider.destroy();
    }

    const slider = noUiSlider.create(sliderRef.current, {
      start: [0, 50000000],
      connect: true,
      range: { min: 0, max: 50000000 },
      step: 500000,
      tooltips: [
        { to: (v: number) => formatCurrency(Math.round(v)) },
        { to: (v: number) => formatCurrency(Math.round(v)) },
      ],
    });

    slider.on('update', (values) => {
      setPriceRange([Math.round(Number(values[0])), Math.round(Number(values[1]))]);
    });

    sliderInstanceRef.current = slider;

    return () => {
      if (sliderRef.current && (sliderRef.current as any).noUiSlider) {
        (sliderRef.current as any).noUiSlider.destroy();
      }
    };
  }, []);

  // Fetch data from CSV
  useEffect(() => {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4MTxvGMBn4G7F0ShGzB22Gf_8vT0YH2BUsDX8XIuXwie8aVu9QBpJx3v_AYXs_jr8xKBzTvfdMgx8/pub?gid=149054116&single=true&output=csv';

    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row: any, i) => {
          let socials = [];
          try { socials = row.Link ? JSON.parse(row.Link) : []; } catch (e) { }
          let previews = [];
          try { previews = row.Preview ? JSON.parse(row.Preview) : []; } catch (e) { }
          let types = [];
          try { types = row.Type ? JSON.parse(row.Type) : []; } catch (e) { }

          return {
            id: (row.Maker || '').toLowerCase().replace(/\s+/g, '-') + '-' + i,
            name: row.Maker || 'Unknown',
            logo: row.Logo || '',
            socials: socials.map((s: any) => ({ platform: s.name, url: s.url, handle: s.url })),
            previews: previews,
            status: row.Status || 'Waitlist',
            types: types,
            priceMin: Number(row.PriceMin) || 0,
            priceMax: Number(row.PriceMax) || 0,
            priceUpdatedAt: row.PriceUpdatedAt || new Date().toISOString(),
            followers: Number(row.Followers) || 0,
            commissionsFinished: Number(row.CommisionFinishedCount) || 0,
          };
        });
        setDataMakers(parsed);
      },
      error: (error) => {
        console.error("Error fetching makers CSV:", error);
      }
    });
  }, []);

  // Apply filters
  useEffect(() => {
    let result = [...dataMakers];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.types.some((t) => t.toLowerCase().includes(q)) ||
          m.socials.some((s) => s.handle.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'All') {
      result = result.filter((m) => m.status === statusFilter);
    }
    if (typeFilter !== 'All') {
      result = result.filter((m) => m.types.includes(typeFilter));
    }
    result = result.filter((m) => m.priceMin <= priceRange[1] && m.priceMax >= priceRange[0]);

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.key) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = ((a.priceMin + a.priceMax) / 2) - ((b.priceMin + b.priceMax) / 2);
          break;
        case 'followers':
          comparison = a.followers - b.followers;
          break;
        case 'commissions':
          comparison = a.commissionsFinished - b.commissionsFinished;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    setFilteredMakers(result);
  }, [searchQuery, statusFilter, typeFilter, priceRange, sortConfig, dataMakers]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredMakers.length;
    const validPriceMakers = filteredMakers.filter(m => m.priceMin > 0 || m.priceMax > 0);
    const validPriceCount = validPriceMakers.length;
    const avgFollowers = total > 0 ? Math.round(filteredMakers.reduce((s, m) => s + m.followers, 0) / total) : 0;
    const avgPriceMin = validPriceCount > 0 ? Math.round(validPriceMakers.reduce((s, m) => s + m.priceMin, 0) / validPriceCount) : 0;
    const avgPriceMax = validPriceCount > 0 ? Math.round(validPriceMakers.reduce((s, m) => s + m.priceMax, 0) / validPriceCount) : 0;
    const openCount = filteredMakers.filter((m) => m.status === 'Open').length;
    const closedCount = filteredMakers.filter((m) => m.status === 'Closed').length;
    const waitlistCount = filteredMakers.filter((m) => m.status === 'Waitlist').length;
    return { total, avgFollowers, avgPriceMin, avgPriceMax, openCount, closedCount, waitlistCount };
  }, [filteredMakers]);

  // Chart data
  const chartData = useMemo(() => {
    const labels = filteredMakers.map((m) => m.name.split(' ')[0]);
    const prices = filteredMakers.map((m) => {
      const p = (m.priceMin + m.priceMax) / 2;
      return p > 0 ? p : null;
    });
    const followers = filteredMakers.map((m) => m.followers / 100);
    const commissions = filteredMakers.map((m) => m.commissionsFinished);
    return {
      labels,
      datasets: [
        {
          label: 'Rata-rata Harga (Rp)',
          data: prices as any[],
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          borderColor: 'rgba(34, 197, 94, 0.8)',
          borderWidth: 1,
          pointBackgroundColor: 'rgba(34, 197, 94, 1)',
          pointBorderColor: '#000',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(34, 197, 94, 1)',
        },
        {
          label: 'Followers (÷100)',
          data: followers,
          backgroundColor: 'rgba(168, 85, 247, 0.2)',
          borderColor: 'rgba(168, 85, 247, 0.8)',
          borderWidth: 1,
          pointBackgroundColor: 'rgba(168, 85, 247, 1)',
          pointBorderColor: '#000',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(168, 85, 247, 1)',
        },
        {
          label: 'Selesai',
          data: commissions,
          backgroundColor: 'rgba(234, 179, 8, 0.2)',
          borderColor: 'rgba(234, 179, 8, 0.8)',
          borderWidth: 1,
          pointBackgroundColor: 'rgba(234, 179, 8, 1)',
          pointBorderColor: '#000',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(234, 179, 8, 1)',
        },
      ],
    };
  }, [filteredMakers]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          angleLines: { color: 'rgba(255,255,255,0.05)' },
          pointLabels: { color: 'rgba(255,255,255,0.4)', font: { family: "'Fira Code', monospace", size: 9 } },
          ticks: { display: false },
        },
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: 'rgba(255,255,255,0.5)', font: { family: "'Fira Code', monospace", size: 10 }, boxWidth: 10 },
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.9)',
          titleFont: { family: "'Fira Code', monospace", size: 11 },
          bodyFont: { family: "'Fira Code', monospace", size: 10 },
          borderColor: 'rgba(34, 197, 94, 0.3)',
          borderWidth: 1,
        },
      },
    }),
    []
  );

  // KDE Data
  const kdeChart = useMemo(() => {
    const validMakers = filteredMakers.filter(m => m.priceMin > 0 || m.priceMax > 0);
    if (validMakers.length === 0) return null;

    const prices = validMakers.map((m) => (m.priceMin + m.priceMax) / 2);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const padding = (maxPrice - minPrice) * 0.2 || 10000000;
    const startX = Math.max(0, minPrice - padding);
    const endX = maxPrice + padding;
    const steps = 100;
    const stepSize = (endX - startX) / steps;

    const xPoints: number[] = [];
    for (let i = 0; i <= steps; i++) xPoints.push(startX + i * stepSize);

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance) || 10000000;
    const bandwidth = 1.06 * stdDev * Math.pow(prices.length, -0.2);

    const density = calculateKDE(prices, xPoints, bandwidth);

    let maxDensity = 0;
    let peakX = 0;
    for (let i = 0; i < density.length; i++) {
      if (density[i] > maxDensity) {
        maxDensity = density[i];
        peakX = xPoints[i];
      }
    }

    const labels = xPoints.map(x => formatCurrency(x));

    return {
      peakX,
      minPrice,
      maxPrice,
      data: {
        labels,
        datasets: [
          {
            label: 'Kepadatan Harga',
            data: density,
            borderColor: 'rgba(34, 197, 94, 0.8)',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            fill: true,
            pointRadius: xPoints.map(x => {
              if (Math.abs(x - minPrice) <= stepSize) return 6;
              if (Math.abs(x - maxPrice) <= stepSize) return 6;
              return 0;
            }),
            pointBackgroundColor: xPoints.map(x => {
              if (Math.abs(x - minPrice) <= stepSize) return 'rgba(56, 189, 248, 1)';
              if (Math.abs(x - maxPrice) <= stepSize) return 'rgba(239, 68, 68, 1)';
              return 'rgba(34, 197, 94, 1)';
            }),
            pointBorderColor: '#000',
            tension: 0.4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { display: false }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (ctx: any) => labels[ctx[0].dataIndex],
              label: (ctx: any) => {
                const x = xPoints[ctx.dataIndex];
                if (Math.abs(x - minPrice) <= stepSize) return 'Harga Minimum';
                if (Math.abs(x - maxPrice) <= stepSize) return 'Harga Maksimum';
                if (x === peakX) return 'Harga Paling Umum';
                return '';
              }
            }
          }
        }
      }
    };
  }, [filteredMakers]);

  const handleImageHover = useCallback((e: React.MouseEvent, src: string, index: number) => {
    setHoveredImage({ src, index });
    setHoverPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleImageMove = useCallback((e: React.MouseEvent) => {
    setHoverPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleImageLeave = useCallback(() => {
    setHoveredImage(null);
  }, []);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    makers.forEach((m) => m.types.forEach((t) => types.add(t)));
    return ['All', ...Array.from(types)];
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) {
      return <span className="ml-1 text-gray-600 opacity-50 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return <span className="ml-1 text-green-400 font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-300 grid-bg overflow-x-hidden">
      <div className="scanline-overlay" />

      {/* Header */}
      <header className="border-b border-gray-800 bg-[#080808]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <span className="text-green-400 text-sm">◈</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100 tracking-wider uppercase">
                DATASET FURSUIT MAKER INDONESIA
              </h1>
              <p className="text-[10px] text-gray-500 font-mono">
                BY TATSUYA RYU - WITH UWU + AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
            <span className="hidden sm:inline">
            </span>
            <span>
              {new Date().toISOString().split('T')[0]} {' '}
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Stats Board */}
        <section className="border border-gray-800 bg-[#0a0a0a] rounded-sm overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-2 flex items-center justify-between bg-[#080808]">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs">▸</span>
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Modul Analitik</span>
            </div>
            <div className="flex items-center gap-3 bg-[#0a0a0f] border border-gray-800 rounded-sm px-3 py-1">
              <span className={`font-mono text-[10px] tracking-widest ${showAnalytics ? 'text-green-400 font-bold drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]' : 'text-gray-600'}`}>
                ON
              </span>
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`relative w-12 h-3 bg-[#050505] border transition-colors duration-300 flex items-center rounded-full cursor-pointer ${showAnalytics ? 'border-green-500/30' : 'border-red-500/30'
                  }`}
              >
                {/* Track line */}
                <div className={`absolute left-1 right-1 h-px top-1/2 -translate-y-1/2 transition-colors duration-300 ${showAnalytics ? 'bg-green-500/30' : 'bg-red-500/30'}`} />
                {/* Slider Thumb */}
                <div
                  className={`absolute w-4 h-4 rounded-full border-2 border-[#0a0a0f] transition-all duration-300 ease-out ${showAnalytics
                    ? 'left-[32px] bg-green-400 shadow-[0_0_8px_#4ade80]'
                    : 'left-0 bg-red-500 shadow-[0_0_8px_#ef4444]'
                    }`}
                />
              </button>
              <span className={`font-mono text-[10px] tracking-widest ${!showAnalytics ? 'text-red-500 font-bold drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'text-gray-600'}`}>
                OFF
              </span>
            </div>
          </div>
          <div className={`transition-all duration-500 ease-in-out origin-top ${showAnalytics ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0 overflow-hidden'}`}>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-gray-800">
              <div className="bg-[#0a0a0a] p-3">
                <div className="text-[10px] text-gray-500 font-mono mb-1">TOTAL FURSUIT MAKER</div>
                <div className="text-xl font-mono text-gray-100">{stats.total}</div>
              </div>
              <div className="bg-[#0a0a0a] p-3">
                <div className="text-[10px] text-gray-500 font-mono mb-1">RATA-RATA FOLLOWERS</div>
                <div className="text-xl font-mono text-purple-400">{formatNumber(stats.avgFollowers)}</div>
              </div>
              <div className="bg-[#0a0a0a] p-3">
                <div className="text-[10px] text-gray-500 font-mono mb-1">RATA-RATA HARGA TERENDAH</div>
                <div className="text-xl font-mono text-green-400">{formatCurrency(stats.avgPriceMin)}</div>
              </div>
              <div className="bg-[#0a0a0a] p-3">
                <div className="text-[10px] text-gray-500 font-mono mb-1">RATA-RATA HARGA TERTINGGI</div>
                <div className="text-xl font-mono text-green-400">{formatCurrency(stats.avgPriceMax)}</div>
              </div>
              <div className="bg-[#0a0a0a] p-3">
                <div className="text-[10px] text-gray-500 font-mono mb-1">STATUS BUKA</div>
                <div className="text-xl font-mono text-green-400">{stats.openCount}</div>
              </div>
              <div className="bg-[#0a0a0a] p-3 col-span-2 md:col-span-1">
                <div className="text-[10px] text-gray-500 font-mono mb-1">TUTUP/ANTRIAN</div>
                <div className="text-xl font-mono">
                  <span className="text-red-400">{stats.closedCount}</span>
                  <span className="text-gray-600 mx-1">/</span>
                  <span className="text-yellow-400">{stats.waitlistCount}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kiri: Graph + Legend */}
              <div className="flex flex-col h-64 lg:h-72 lg:pr-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Distribusi Metrik</span>
                  <span className="text-[10px] text-gray-600 font-mono border border-gray-800 px-2 py-0.5 rounded-sm">RADAR ANALYSIS</span>
                </div>
                <div className="flex-1 relative">
                  <Radar data={chartData} options={chartOptions} />
                </div>
              </div>
              {/* Kanan: KDE Graph */}
              <div className="flex flex-col lg:border-l border-gray-800 lg:pl-6 h-64 lg:h-72">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Range Harga Fursuit</span>
                  <span className="text-[10px] text-gray-600 font-mono border border-gray-800 px-2 py-0.5 rounded-sm">KERNEL DENSITY ESTIMATION</span>
                </div>

                {kdeChart ? (
                  <>
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <div className="text-[10px] text-gray-500 font-mono mb-1">HARGA PALING UMUM</div>
                        <div className="text-2xl lg:text-3xl font-mono text-green-400 tracking-tighter">{formatCurrency(kdeChart.peakX)}</div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-[10px] text-gray-500 font-mono">
                          <span className="text-blue-400 font-bold mr-1">MIN:</span> {formatCurrency(kdeChart.minPrice)}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          <span className="text-red-400 font-bold mr-1">MAX:</span> {formatCurrency(kdeChart.maxPrice)}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 relative mt-2">
                      <Line data={kdeChart.data} options={kdeChart.options} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center border border-dashed border-gray-800/50 rounded-sm bg-[#080808]/50">
                    <span className="text-gray-700 font-mono text-[10px]">INSUFFICIENT DATA</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Filter Bar */}
        <section className="border border-gray-800 bg-[#0a0a0a] rounded-sm overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-2 bg-[#080808]">
            <span className="text-green-400 text-xs">▸</span>
            <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Kontrol Filter</span>
          </div>
          <div className="p-4 px-6 border-b border-gray-800">
            <label className="text-[10px] text-gray-500 font-mono uppercase block mb-6">
              Rentang Harga
            </label>
            <div className="flex flex-col md:flex-row items-center gap-6 mb-2">
              <div className="w-full md:w-1/4">
                <div ref={sliderRef} className="mx-2" />
              </div>
              <div className="text-lg lg:text-2xl font-mono text-green-400 tracking-tighter mt-4 md:mt-0 shrink-0">
                {formatCurrency(priceRange[0])} <span className="text-gray-600 mx-2">-</span> {formatCurrency(priceRange[1])}
              </div>

              {/* Call to action */}
              <div className="md:ml-auto flex flex-col items-center md:items-end w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-gray-800 md:border-t-0">
                <div className="text-[10px] text-gray-400 font-mono mb-2 text-center md:text-right">
                  Apakah Kamu Maker Fursuit? Hubungi developer kami untuk<br className="hidden md:block" />
                  menambahkan katalog Anda ke web ini:
                </div>
                <div className="flex items-center gap-2">
                  <a href="https://x.com/AxyenTheDutchie" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0a0a] border border-gray-700 hover:border-white hover:bg-[#111] rounded-sm transition-all group">
                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    <span className="text-[10px] font-mono text-gray-400 group-hover:text-white transition-colors hidden sm:inline">Twitter</span>
                  </a>
                  <a href="https://t.me/AxyenDutchie" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0a0a] border border-gray-700 hover:border-[#229ED9] hover:bg-[#111] rounded-sm transition-all group">
                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#229ED9] transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
                    <span className="text-[10px] font-mono text-gray-400 group-hover:text-[#229ED9] transition-colors hidden sm:inline">Telegram</span>
                  </a>
                  <a href="https://discordapp.com/users/865591175943684097" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0a0a] border border-gray-700 hover:border-[#5865F2] hover:bg-[#111] rounded-sm transition-all group">
                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#5865F2] transition-colors" fill="currentColor" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77.13,77.13,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.1,46,96,53,91,65.69,84.69,65.69Z" /></svg>
                    <span className="text-[10px] font-mono text-gray-400 group-hover:text-[#5865F2] transition-colors hidden sm:inline">Discord</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1.5">Cari</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs">⌕</span>
                <input
                  type="text"
                  placeholder="Nama maker, tipe, handle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-sm pl-7 pr-3 py-1.5 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 rounded-sm px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all appearance-none cursor-pointer"
              >
                <option value="All">Semua Status</option>
                <option value="Open">Buka</option>
                <option value="Closed">Tutup</option>
                <option value="Waitlist">Antrian</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1.5">Tipe</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 rounded-sm px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all appearance-none cursor-pointer"
              >
                {allTypes.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'Semua Tipe' : t}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1.5">Urutkan Berdasarkan</label>
              <select
                value={`${sortConfig.key}-${sortConfig.direction}`}
                onChange={(e) => {
                  const [key, direction] = e.target.value.split('-');
                  setSortConfig({ key, direction: direction as 'asc' | 'desc' });
                }}
                className="w-full bg-[#0f0f0f] border border-gray-700 rounded-sm px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all appearance-none cursor-pointer"
              >
                <option value="name-asc">Nama (A-Z)</option>
                <option value="name-desc">Nama (Z-A)</option>
                <option value="price-asc">Harga: Rendah ke Tinggi</option>
                <option value="price-desc">Harga: Tinggi ke Rendah</option>
                <option value="followers-desc">Followers (Banyak ke Sedikit)</option>
                <option value="followers-asc">Followers (Sedikit ke Banyak)</option>
                <option value="commissions-desc">Komisi Selesai (Banyak ke Sedikit)</option>
                <option value="commissions-asc">Komisi Selesai (Sedikit ke Banyak)</option>
                <option value="status-asc">Status (A-Z)</option>
                <option value="status-desc">Status (Z-A)</option>
              </select>
            </div>


          </div>
        </section>

        {/* Data Grid */}
        <section className="border border-gray-800 bg-[#0a0a0a] rounded-sm">
          <div className="border-b border-gray-800 px-4 py-2 flex items-center justify-between bg-[#080808]">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs">▸</span>
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Log Intelijen</span>
              <span className="text-[10px] text-gray-600 font-mono ml-2">{filteredMakers.length} ENTRI</span>
            </div>
          </div>

          {/* Table Header */}
          <div className="overflow-x-auto w-full custom-scrollbar pb-2">
            <div className="min-w-[1000px] flex flex-col">
              <div className="grid grid-cols-[60px_2.5fr_2fr_1.5fr_2fr_1.5fr_1fr_1fr] gap-px bg-gray-800 border-b border-gray-800">
                <div className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase">Logo</div>
                <div
                  className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase cursor-pointer hover:bg-[#111] select-none group"
                  onClick={() => handleSort('name')}
                >
                  FURSUIT MAKER / Sosial{renderSortIcon('name')}
                </div>
                <div className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase">Pratinjau</div>
                <div
                  className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase cursor-pointer hover:bg-[#111] select-none group"
                  onClick={() => handleSort('status')}
                >
                  Status{renderSortIcon('status')}
                </div>
                <div className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase">Tipe</div>
                <div
                  className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase cursor-pointer hover:bg-[#111] select-none group"
                  onClick={() => handleSort('price')}
                >
                  Rentang Harga{renderSortIcon('price')}
                </div>
                <div
                  className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase cursor-pointer hover:bg-[#111] select-none group"
                  onClick={() => handleSort('followers')}
                >
                  Followers{renderSortIcon('followers')}
                </div>
                <div
                  className="bg-[#080808] px-3 py-2 text-[10px] font-mono text-gray-500 uppercase cursor-pointer hover:bg-[#111] select-none group"
                  onClick={() => handleSort('commissions')}
                >
                  Selesai{renderSortIcon('commissions')}
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-gray-800">
                {filteredMakers.map((maker) => {
                  const sc = statusColors[maker.status];
                  return (
                    <div
                      key={maker.id}
                      className="group relative hover:z-50 grid grid-cols-[60px_2.5fr_2fr_1.5fr_2fr_1.5fr_1fr_1fr] gap-px bg-[#0a0a0a] hover:bg-[#0f1115] transition-colors duration-150 items-center"
                    >
                      {/* Logo */}
                      <div className="bg-[#0a0a0a] px-3 py-2 flex items-center justify-center">
                        <img
                          src={maker.logo}
                          alt={maker.name}
                          className="w-10 h-10 rounded-sm object-cover border border-gray-700 transition-all duration-200 hover:scale-[3] hover:z-50 relative hover:border-green-400 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                        />
                      </div>

                      {/* Name & Socials */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <div className="text-sm font-mono text-gray-200 group-hover:text-white transition-colors">
                          {maker.name}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {maker.socials.map((s) => (
                            <a
                              key={s.platform}
                              href={s.url}
                              className="text-[10px] font-mono text-gray-500 hover:text-green-400 transition-colors inline-flex items-center gap-1"
                              title={`${s.platform}: ${s.handle}`}
                            >
                              <span>{platformIcons[s.platform] || '●'}</span>
                              <span className="hidden sm:inline">{s.handle}</span>
                            </a>
                          ))}
                        </div>
                        <div className="text-[10px] text-gray-600 font-mono mt-1">
                          Last Update: {maker.priceUpdatedAt.split('T')[0]}
                        </div>
                      </div>

                      {/* Previews */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <div className="flex gap-1 flex-wrap max-h-[104px] overflow-y-auto pr-1 custom-scrollbar">
                          {maker.previews.map((p, i) => (
                            <div
                              key={i}
                              className="relative w-10 h-10 rounded-sm overflow-hidden border border-gray-700 cursor-pointer preview-thumbnail flex-shrink-0"
                              onMouseEnter={(e) => handleImageHover(e, p, i)}
                              onMouseMove={handleImageMove}
                              onMouseLeave={handleImageLeave}
                            >
                              <img src={p} alt={`Pratinjau ${i + 1}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm ${sc.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${sc.dot} ${sc.pulse}`} />
                          <span className={`text-xs font-mono ${sc.text}`}>{statusTranslation[maker.status]}</span>
                        </div>
                      </div>

                      {/* Types */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {maker.types.map((t) => (
                            <span
                              key={t}
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${typeColors[t] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Price Range */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <div className="font-mono text-xs">
                          {maker.priceMin === 0 && maker.priceMax === 0 ? (
                            <span className="text-gray-500">Unknown</span>
                          ) : (
                            <>
                              <span className="text-green-400">{maker.priceMin === 0 ? 'Unknown' : formatCurrency(maker.priceMin)}</span>
                              <span className="text-gray-600 mx-1">-</span>
                              <span className="text-green-400">{maker.priceMax === 0 ? 'Unknown' : formatCurrency(maker.priceMax)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Followers */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <span className="font-mono text-xs text-purple-400">{formatNumber(maker.followers)}</span>
                      </div>

                      {/* Commissions */}
                      <div className="bg-[#0a0a0a] px-3 py-2">
                        <span className="font-mono text-xs text-yellow-400">{maker.commissionsFinished}</span>
                      </div>


                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {filteredMakers.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-4xl text-gray-700 mb-2">∅</div>
              <p className="text-xs font-mono text-gray-500">Tidak ada entri yang cocok dengan kriteria filter saat ini.</p>
              <p className="text-[10px] font-mono text-gray-600 mt-1">Sesuaikan filter untuk memperluas pencarian.</p>
            </div>
          )}
        </section>
      </main>

      {/* Floating Image Preview */}
      {hoveredImage && (
        <div
          className="fixed pointer-events-none z-[100] transition-opacity duration-150"
          style={{
            left: Math.min(hoverPos.x + 20, window.innerWidth - 340),
            top: Math.max(hoverPos.y - 160, 10),
          }}
        >
          <div className="bg-[#0a0a0a] border border-green-500/30 rounded-sm overflow-hidden shadow-2xl shadow-black/80">
            <img
              src={hoveredImage.src}
              alt="Preview"
              className="w-80 h-80 object-cover"
            />
            <div className="px-2 py-1 bg-[#080808] border-t border-gray-800">
              <span className="text-[10px] font-mono text-gray-500">PRATINJAU {hoveredImage.index + 1}</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-[#080808] mt-8">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-600">
            Terinspirasi dari <a href="https://skipasnow.github.io/fursuit/">skipasnow.github.io/fursuit/</a>
          </span>
          <span className="text-[10px] font-mono text-gray-600">
            Website ini hanya menampilkan kisaran harga. Untuk harga pasti, hubungi maker secara langsung.
          </span>
        </div>
      </footer>
    </div>
  );
}
