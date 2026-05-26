/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, ComponentType, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Sparkles,
  Crown,
  Gem,
  Shield,
  Flame,
  Cpu,
  Database,
  Globe,
  Zap,
  Atom,
  Terminal,
  Hexagon,
  Compass,
  Infinity as InfinityIcon,
  Box,
  CircleDot,
  Crosshair,
  Coffee,
  ShoppingBag,
  Wine,
  Package,
  Scissors,
  Key,
  Leaf,
  Sun,
  Moon,
  Sprout,
  Wind,
  Heart,
  Star,
  Palette,
  Type,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  LayoutGrid,
  FileText,
  Image as ImageIcon,
  Briefcase,
  ChevronRight,
  HelpCircle,
  RotateCcw,
  Sliders,
  Maximize2,
  Calendar,
  DollarSign,
  Lock,
  Mail
} from 'lucide-react';
import { LogoConfig, ColorPalette, LayoutType, FontFamilyType, TrackingType, BadgeShapeType } from './types';
import { COLOR_PALETTES, SYMBOLS, STYLE_PRESETS } from './data';
import { translations, SYMBOL_TRANSLATIONS, PRESET_TRANSLATIONS, PALETTE_TRANSLATIONS, CATEGORY_TRANSLATIONS, TIMEPACE_TRANSLATIONS, GEOMETRY_TRANSLATIONS, BORDER_TRANSLATIONS } from './translations';

import ScheduleModule from './components/ScheduleModule';
import FinanceModule from './components/FinanceModule';
import PasswordModule from './components/PasswordModule';
import MailModule from './components/MailModule';
import ChatModule from './components/ChatModule';
import VintageCar from './components/VintageCar';
import LandingHero from './components/LandingHero';

// Map symbol ids to Lucide components
const iconMap: Record<string, ComponentType<any>> = {
  Layers,
  Sparkles,
  VintageCar,
  Crown,
  Gem,
  Shield,
  Flame,
  Cpu,
  Database,
  Globe,
  Zap,
  Atom,
  Terminal,
  Hexagon,
  Compass,
  Infinity: InfinityIcon,
  Box,
  CircleDot,
  Crosshair,
  Coffee,
  ShoppingBag,
  Wine,
  Package,
  Scissors,
  Key,
  Leaf,
  Sun,
  Moon,
  Sprout,
  Wind,
  Heart,
  Star
};

// Returns exact vector paths for custom rendered icons inside exported vector formats
function getIconPaths(iconName: string): string {
  switch (iconName) {
    case 'VintageCar':
      return `
        <!-- Clean horizontal chassis line -->
        <line x1="3" y1="17" x2="21" y2="17" />

        <!-- Classic vertical radiator grille (Now Front Left) -->
        <rect x="3" y="11" width="3" height="6" rx="0.5" />
        <line x1="4.5" y1="11" x2="4.5" y2="17" />

        <!-- Elegant headlight / vintage glass carriage lamp pointing forward Left -->
        <circle cx="2.5" cy="11.5" r="1.2" />
        <line x1="3.5" y1="12" x2="2.5" y2="12" />

        <!-- Sleek straight engine bonnet / hood line -->
        <path d="M6 12.5h6v4.5H6z" />

        <!-- High-society back-angled windshield -->
        <line x1="12" y1="12.5" x2="13.5" y2="8" />

        <!-- Steering column and tilted vintage steering wheel -->
        <line x1="13" y1="11" x2="14.5" y2="11.5" />
        <circle cx="13.8" cy="11.2" r="0.8" />

        <!-- Luxurious upright luxury carriage canopy (遮挡棚 / Carriage hood shelter on right) -->
        <!-- Rounded fabric frame top covering the rear bench -->
        <path d="M12.5 7.5c2.5-1 5.5-1 7 1v4" />
        <!-- Canopy structure ribs/tensioners radiating beautifully -->
        <line x1="19.5" y1="12.5" x2="15.5" y2="7" />
        <line x1="19.5" y1="12.5" x2="17.5" y2="6.8" />
        <line x1="19.5" y1="12.5" x2="19.5" y2="8.5" />

        <!-- Luxurious passenger compartment tub / high back seat panel -->
        <path d="M12.5 12.5h6.5v4.5h-6.5c-1 0-1.5-.5-1.5-1.5v-3" />

        <!-- Custom curved separate front and rear fenders / mudguards -->
        <!-- Front Fender: sweeps gracefully over the front wheel -->
        <path d="M10.5 17.5c0-3.5-1.5-4.5-4.5-4.5" />
        <!-- Rear Fender: sweeps elegantly behind the rear wheel -->
        <path d="M22 17.5c0-3.5-1.8-4.5-4.3-4.5" />

        <!-- Front Wheel (cx=8, cy=18.5, r=3.5) -->
        <circle cx="8" cy="18.5" r="3.5" />
        <circle cx="8" cy="18.5" r="0.7" />
        <line x1="8" y1="15" x2="8" y2="22" />
        <line x1="4.5" y1="18.5" x2="11.5" y2="18.5" />

        <!-- Rear Wheel (cx=18, cy=18.5, r=3.5) -->
        <circle cx="18" cy="18.5" r="3.5" />
        <circle cx="18" cy="18.5" r="0.7" />
        <line x1="18" y1="15" x2="18" y2="22" />
        <line x1="14.5" y1="18.5" x2="21.5" y2="18.5" />
      `;
    case 'Sparkles':
      return `
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5z" />
        <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
      `;
    case 'Crown':
      return `
        <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" />
        <path d="M5 20h14" />
      `;
    case 'Gem':
      return `
        <path d="M6 3h12l4 6-10 13L2 9z" />
        <path d="M11 3 8 9l4 13 4-13-3-6" />
        <path d="M2 9h20" />
      `;
    case 'Shield':
      return `
        <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8.24-2a1 1 0 0 1 .5 0l8.24 2A1 1 0 0 1 20 6v7z" />
      `;
    case 'Layers':
      return `
        <path d="m12 3-10 5 10 5 10-5-10-5z" />
        <path d="m2 17 10 5 10-5" />
        <path d="m2 12 10 5 10-5" />
      `;
    case 'Flame':
      return `
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      `;
    case 'Cpu':
      return `
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
      `;
    case 'Database':
      return `
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
      `;
    case 'Globe':
      return `
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      `;
    case 'Zap':
      return `
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      `;
    case 'Atom':
      return `
        <circle cx="12" cy="12" r="1" />
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <ellipse cx="12" cy="12" rx="3" ry="10" transform="rotate(45 12 12)" />
        <ellipse cx="12" cy="12" rx="3" ry="10" transform="rotate(-45 12 12)" />
      `;
    case 'Terminal':
      return `
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      `;
    case 'Hexagon':
      return `
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      `;
    case 'Compass':
      return `
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      `;
    case 'Infinity':
      return `
        <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4z" />
      `;
    case 'Box':
      return `
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      `;
    case 'CircleDot':
      return `
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="1" />
      `;
    case 'Crosshair':
      return `
        <circle cx="12" cy="12" r="10" />
        <line x1="22" y1="12" x2="18" y2="12" />
        <line x1="6" y1="12" x2="2" y2="12" />
        <line x1="12" y1="6" x2="12" y2="2" />
        <line x1="12" y1="22" x2="12" y2="18" />
      `;
    case 'Coffee':
      return `
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <line x1="6" y1="2" x2="6" y2="4" />
        <line x1="10" y1="2" x2="10" y2="4" />
        <line x1="14" y1="2" x2="14" y2="4" />
      `;
    case 'ShoppingBag':
      return `
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      `;
    case 'Wine':
      return `
        <path d="M15 11A5 5 0 0 1 5 11V3h10Z" />
        <path d="M10 16v5" />
        <path d="M19 11c0 3.314-2.686 6-6 6M7 21h6" />
      `;
    case 'Package':
      return `
        <path d="M16.5 9.4 7.55 4.24a1.79 1.79 0 0 0-1.83 0L3.5 5.5a1.8 1.8 0 0 0-.91 1.56v6.88a1.8 1.8 0 0 0 .9 1.56L12 21.3a1.78 1.78 0 0 0 1.83 0l6.67-3.85a1.8 1.8 0 0 0 .91-1.56V9.4A1.8 1.8 0 0 0 21 7.82l-5.4-3.12" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      `;
    case 'Scissors':
      return `
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="9.8" y1="8.2" x2="20" y2="18" />
        <line x1="9.8" y1="15.8" x2="20" y2="6" />
      `;
    case 'Key':
      return `
        <circle cx="7.5" cy="16.5" r="4.5" />
        <path d="m21 3-6.75 6.75" />
        <path d="m11.5 12.5 1 1" />
        <path d="m16 8.5 2 2" />
      `;
    case 'Leaf':
      return `
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.58-.1 11.3A7 7 0 0 1 11 20z" />
        <path d="M19 2c-4 3.6-7 7.6-9 13" />
      `;
    case 'Sun':
      return `
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      `;
    case 'Moon':
      return `
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      `;
    case 'Sprout':
      return `
        <path d="M7 20h10" />
        <path d="M12 20V12" />
        <path d="M12 12a5 5 0 0 0-5-5H3" />
        <path d="M12 14a5 5 0 0 1 5-5h4" />
      `;
    case 'Wind':
      return `
        <path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A1.5 1.5 0 1 1 11 7H2" />
      `;
    case 'Heart':
      return `
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2a5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      `;
    case 'Star':
      return `
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      `;
    default:
      return `
        <path d="M-12 0 L12 0 M0 -12 L0 12 M-8 -8 L8 8 M-8 8 L8 -8" />
        <circle cx="0" cy="0" r="10" />
      `;
  }
}

const fontClassMap: Record<FontFamilyType, string> = {
  sans: 'font-sans',
  display: 'font-display',
  space: 'font-space',
  serif: 'font-serif',
  cinzel: 'font-cinzel',
  mono: 'font-mono'
};

const trackingClassMap: Record<TrackingType, string> = {
  tight: 'tracking-tight',
  normal: 'tracking-normal',
  wide: 'tracking-wide',
  widest: 'tracking-widest'
};

export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [showLanding, setShowLanding] = useState(true);
  const t = translations[lang];

  // App primary state
  const [activeSpace, setActiveSpace] = useState<'chat' | 'mail' | 'schedule' | 'calendar' | 'finance' | 'password' | 'brand'>('chat');
  const [activeTab, setActiveTab] = useState<'studio' | 'collateral' | 'expert' | 'gallery'>('studio');
  const [config, setConfig] = useState<LogoConfig>({
    brandName: 'GSYEN',
    tagline: 'CENTURY CARRIAGE ATELIER',
    layout: 'horizontal',
    fontFamily: 'cinzel',
    taglineFontFamily: 'sans',
    fontTracking: 'widest',
    taglineTracking: 'widest',
    colorPaletteId: 'midnight-gold',
    iconName: 'VintageCar',
    iconSize: 84,
    iconRotation: 0,
    iconStrokeWidth: 1.5,
    badgeShape: 'none',
    textUppercase: true,
    taglineUppercase: true,
    gridOverlay: false,
    contrastMode: false
  });

  const [activeSymbolCategory, setActiveSymbolCategory] = useState<'all' | 'core' | 'tech' | 'abstract' | 'retail' | 'nature'>('all');
  const [customHexColor, setCustomHexColor] = useState<string>('#E5C158');
  const [isCopied, setIsCopied] = useState(false);
  const [customSlogan, setCustomSlogan] = useState<string>('');

  // Active color palette object
  const activePalette = useMemo(() => {
    return COLOR_PALETTES.find(p => p.id === config.colorPaletteId) || COLOR_PALETTES[0];
  }, [config.colorPaletteId]);

  // Apply style preset
  const handleApplyPreset = (presetId: string) => {
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setConfig(prev => ({
        ...prev,
        ...preset.config
      }));
    }
  };

  // Filtered symbols list
  const filteredSymbols = useMemo(() => {
    if (activeSymbolCategory === 'all') return SYMBOLS;
    return SYMBOLS.filter(sym => sym.category === activeSymbolCategory);
  }, [activeSymbolCategory]);

  // Color Swapping based on Contrast Tweak
  const palettePrimary = config.contrastMode ? activePalette.bgHex : activePalette.primaryHex;
  const paletteSecondary = config.contrastMode ? activePalette.textSecondary : activePalette.secondaryHex;
  const paletteBg = config.contrastMode ? activePalette.primaryHex : activePalette.bgHex;
  const paletteTextColor = config.contrastMode ? activePalette.secondaryHex : activePalette.textPrimary;
  const paletteTaglineColor = config.contrastMode ? activePalette.bgHex : activePalette.secondaryHex;

  // Retrieve logo SVG element markup code for copying
  const svgMarkupString = useMemo(() => {
    const colorP = palettePrimary;
    const colorS = paletteSecondary;
    const colorText = paletteTextColor;
    const colorTagline = paletteTaglineColor;
    const isDark = activePalette.darkContrast;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="100%" height="100%" style="background-color: ${paletteBg};">
  <style>
    .brand-title {
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 700;
      fill: ${colorText};
      text-anchor: middle;
    }
    .brand-tagline {
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      font-size: 11px;
      letter-spacing: 0.15em;
      fill: ${colorTagline};
      text-anchor: middle;
    }
    .logo-icon {
      stroke: ${colorP};
      stroke-width: ${config.iconStrokeWidth};
      fill: none;
      transform-origin: center;
    }
  </style>

  <!-- Background Grid Decorator if desired -->
  ${config.gridOverlay ? `
  <g opacity="0.1" stroke="${colorP}" stroke-width="0.5">
    <line x1="50" y1="0" x2="50" y2="400" />
    <line x1="150" y1="0" x2="150" y2="400" />
    <line x1="250" y1="0" x2="250" y2="400" />
    <line x1="350" y1="0" x2="350" y2="400" />
    <line x1="450" y1="0" x2="450" y2="400" />
    <line x1="0" y1="100" x2="500" y2="100" />
    <line x1="0" y1="200" x2="500" y2="200" />
    <line x1="0" y1="300" x2="500" y2="300" />
  </g>` : ''}

  <!-- Badge / Framing element -->
  ${config.badgeShape !== 'none' ? `
  <g transform="translate(250, 160)" fill="none" stroke="${colorS}" stroke-width="2" opacity="0.8">
    ${config.badgeShape === 'circle' ? `<circle r="75" fill="${paletteBg}" stroke-width="3" />` : ''}
    ${config.badgeShape === 'square' ? `<rect x="-65" y="-65" width="130" height="130" rx="12" fill="${paletteBg}" />` : ''}
    ${config.badgeShape === 'hexagon' ? `<polygon points="0,-75 65,-37.5 65,37.5 0,75 -65,37.5 -65,-37.5" fill="${paletteBg}" />` : ''}
    ${config.badgeShape === 'shield' ? `<path d="M-60,-65 L60,-65 C60,-65 60,10 0,65 C-60,10 -60,-65 -60,-65 Z" fill="${paletteBg}" />` : ''}
  </g>` : ''}

  <!-- Core Icon -->
  <g transform="translate(250, 160)" stroke="${colorP}" stroke-width="${config.iconStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <g transform="rotate(${config.iconRotation}) scale(${config.iconSize / 24})">
      <g transform="translate(-12, -12)">
        ${getIconPaths(config.iconName)}
      </g>
    </g>
  </g>

  <!-- Typography -->
  <text x="250" y="275" font-size="28" letter-spacing="1.5" class="brand-title">${config.brandName}</text>
  <text x="250" y="305" class="brand-tagline">${config.tagline}</text>
</svg>`;
  }, [config, activePalette, palettePrimary, paletteSecondary, paletteBg, paletteTextColor, paletteTaglineColor]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(svgMarkupString);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  // Render the selected Lucide Icon beautifully inside the interactive canvas
  const renderIcon = (cl: string, customSize?: number) => {
    const IconComp = iconMap[config.iconName] || logoFallbackIcon;
    const finalSize = customSize !== undefined ? customSize : config.iconSize;
    return (
      <div 
        style={{ transform: `rotate(${config.iconRotation}deg)` }} 
        className={`transition-all duration-300 transform ease-out flex items-center justify-center`}
      >
        <IconComp 
          size={finalSize} 
          strokeWidth={config.iconStrokeWidth} 
          className={cl}
        />
      </div>
    );
  };

  // Render Badge Framing
  const renderBadgeStart = (children: ReactNode, customBg?: string) => {
    if (config.badgeShape === 'none') {
      return <div className="p-4 flex items-center justify-center">{children}</div>;
    }

    const appliedBg = customBg || (config.contrastMode ? 'bg-transparent' : '');

    const badgeClasses = {
      circle: `rounded-full border-3 px-12 py-12 aspect-square flex items-center justify-center transition-all duration-300`,
      square: `rounded-3xl border-3 p-10 aspect-square flex items-center justify-center transition-all duration-300`,
      shield: `border-3 p-10 aspect-square flex items-center justify-center transition-all duration-300 [clip-path:polygon(0%_0%,100%_0%,100%_60%,50%_100%,0%_60%)]`,
      hexagon: `border-3 p-10 aspect-square flex items-center justify-center transition-all duration-300 [clip-path:polygon(25%_0%,75%_0%,100%_50%,75%_100%,25%_100%,0%_50%)]`,
      'outline-circle': `rounded-full border-1 border-dashed px-10 py-10 aspect-square flex items-center justify-center transition-all duration-300`
    };

    const paletteBorder = config.contrastMode ? 'border-amber-400' : 'border-current';

    return (
      <div className="flex items-center justify-center p-3">
        <div 
          className={`${badgeClasses[config.badgeShape]} ${paletteBorder} ${appliedBg}`}
          style={{ 
            borderColor: config.contrastMode ? paletteSecondary : paletteSecondary,
            minWidth: `${config.iconSize * 1.9}px`,
            minHeight: `${config.iconSize * 1.9}px`
          }}
        >
          {children}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] flex flex-col font-sans selection:bg-[#1A1A1A] selection:text-[#F9F8F6] overflow-x-hidden" id="logo-designer-root">
      <AnimatePresence>
        {showLanding && (
          <LandingHero lang={lang} onEnter={() => setShowLanding(false)} />
        )}
      </AnimatePresence>
      
      {/* Upper Navigation Bar */}
      <header className="border-b border-[#1A1A1A]/10 bg-[#F9F8F6]/90 backdrop-blur-md sticky top-0 z-40 px-8 py-6 flex items-center justify-between" id="app-header">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-transparent rounded-none border border-[#1A1A1A]/15 shadow-[1px_1px_0px_rgba(26,26,26,0.06)] shrink-0 transition-transform duration-500 hover:rotate-6">
            <VintageCar size={44} className="text-[#1A1A1A]/95" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2.5 flex-nowrap whitespace-nowrap">
              {/* Commands deep presence with 900-weight Chinese traditional serif SC */}
              <span className="text-xl md:text-2xl font-black font-serif-sc tracking-[0.12em] text-[#111111] leading-none select-none">
                疆域
              </span>
              
              {/* Elegant Royal Roman GSYEN with high tracking */}
              <span className="font-cinzel text-xs md:text-[14px] font-bold tracking-[0.22em] text-[#111111]/85 uppercase leading-none select-none ml-0.5">
                GSYEN
              </span>
            </div>
            <p className="text-[7.5px] md:text-[8px] text-[#1A1A1A]/50 font-serif-sc tracking-[0.22em] font-medium leading-none uppercase mt-2.5">
              {t.headerSubtitle}
            </p>
          </div>
        </div>

        {/* Mobile: native picker — shows one tab, tap to spin */}
        <div className="flex md:hidden items-center border border-[#1A1A1A]/15 bg-[#F4F2EE] relative">
          <select
            value={activeSpace}
            onChange={e => setActiveSpace(e.target.value as typeof activeSpace)}
            className="appearance-none bg-transparent pl-3.5 pr-8 py-2 text-[11px] font-bold tracking-widest uppercase text-[#1A1A1A] font-mono outline-none cursor-pointer w-full"
          >
            <option value="chat">{lang === 'zh' ? '疆域灵阁' : 'GSYEN MUSE'}</option>
            <option value="mail">{lang === 'zh' ? '工作邮件' : 'MAILBOX'}</option>
            <option value="schedule">{lang === 'zh' ? '项目看板' : 'KANBAN'}</option>
            <option value="calendar">{lang === 'zh' ? '日程日历' : 'CALENDAR'}</option>
            <option value="finance">{lang === 'zh' ? '复式财务账簿' : 'LEDGER'}</option>
            <option value="password">{lang === 'zh' ? '军事级密钥库' : 'CITADEL KEY'}</option>
            <option value="brand">{lang === 'zh' ? '品牌实验室' : 'BRAND LAB'}</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 text-[#1A1A1A]/40 text-[10px]">▾</span>
        </div>

        {/* Desktop: full tab bar */}
        <div className="hidden md:flex bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10 gap-1">
          <button
            onClick={() => setActiveSpace('chat')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'chat' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>{lang === 'zh' ? '疆域灵阁' : 'GSYEN Muse'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('mail')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'mail' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '工作邮件' : 'Mailbox'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('schedule')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'schedule' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 animate-pulse" />
            <span>{lang === 'zh' ? '项目看板' : 'Kanban'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('calendar')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'calendar' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '日程日历' : 'Calendar'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('finance')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'finance' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '复式财务账簿' : 'Atelier Ledger'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('password')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'password' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '军事级密钥库' : 'Citadel Key'}</span>
          </button>

          <button
            onClick={() => setActiveSpace('brand')}
            className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
              activeSpace === 'brand' 
                ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' 
                : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '品牌实验室' : 'Brand Lab'}</span>
          </button>
        </div>

        {/* Quick Language Toggle & Status */}
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex bg-[#1A1A1A]/5 p-0.5 rounded-none border border-[#1A1A1A]/10">
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${
                lang === 'en'
                  ? 'bg-[#1A1A1A] text-[#F9F8F6]'
                  : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('zh')}
              className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${
                lang === 'zh'
                  ? 'bg-[#1A1A1A] text-[#F9F8F6]'
                  : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}
            >
              中文
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 rounded-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] animate-pulse"></span>
            <span className="text-[#1A1A1A]/75 font-serif-sc text-[10px] tracking-[0.12em] font-medium uppercase">{t.inkModeActive}</span>
          </div>
        </div>
      </header>

      {/* Secondary Ribbon for Brand Lab sub-tabs */}
      {activeSpace === 'brand' && (
        <div className="bg-[#1A1A1A]/5 border-b border-[#1A1A1A]/10 px-8 py-3 flex items-center gap-4 flex-wrap">
          <span className="text-[9px] font-mono tracking-widest text-[#1A1A1A]/45 uppercase font-bold">
            {lang === 'zh' ? '品牌研发工具集:' : 'ATELIER BRAND LAB ENGINE:'}
          </span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab('studio')}
              className={`px-3 py-1 rounded-none text-[9px] font-mono tracking-widest uppercase transition-all border ${
                activeTab === 'studio' 
                  ? 'bg-white border-[#1A1A1A]/15 text-[#1A1A1A] font-bold' 
                  : 'border-transparent text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5'
              }`}
            >
              {t.studioCanvas}
            </button>
            <button
              onClick={() => setActiveTab('collateral')}
              className={`px-3 py-1 rounded-none text-[9px] font-mono tracking-widest uppercase transition-all border ${
                activeTab === 'collateral' 
                  ? 'bg-white border-[#1A1A1A]/15 text-[#1A1A1A] font-bold' 
                  : 'border-transparent text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5'
              }`}
            >
              {t.collateralMockups}
            </button>
            <button
              onClick={() => setActiveTab('expert')}
              className={`px-3 py-1 rounded-none text-[9px] font-mono tracking-widest uppercase transition-all border ${
                activeTab === 'expert' 
                  ? 'bg-white border-[#1A1A1A]/15 text-[#1A1A1A] font-bold' 
                  : 'border-transparent text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5'
              }`}
            >
              {t.creativeAssistant}
            </button>
          </div>
        </div>
      )}

      {/* Main Core View Area */}
      {activeSpace === 'brand' ? (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0" id="main-studio-workspace">
        
        {/* Left Interactive Control Panel (Fixed sidebar or scrollable control pane) */}
        <aside className="w-full lg:w-[420px] border-r border-[#1A1A1A]/10 bg-[#F4F2EE] p-6 overflow-y-auto space-y-7 flex-shrink-0" id="design-control-sidebar">
          
          {/* Section: Elegant Presets Carousel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" /> {t.identityPresets}
              </h2>
              <span className="text-[9px] font-mono tracking-widest text-[#1A1A1A]/40 uppercase">{t.selectStyle}</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {STYLE_PRESETS.map(preset => {
                const presetTrans = PRESET_TRANSLATIONS[preset.id];
                const presetName = lang === 'zh' && presetTrans ? presetTrans.name : preset.name;
                const presetDesc = lang === 'zh' && presetTrans ? presetTrans.desc : preset.description;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset.id)}
                    className="group relative text-left p-3.5 rounded-none border border-[#1A1A1A]/10 bg-white/40 hover:bg-white transition-all flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold tracking-wider text-[#1A1A1A] uppercase font-mono">
                        {presetName}
                      </p>
                      <p className="text-[9px] text-[#1A1A1A]/60 line-clamp-1 max-w-[260px] font-serif italic">
                        {presetDesc}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-wider bg-[#1A1A1A]/5 text-[#1A1A1A] py-1 px-2 rounded-none group-hover:bg-[#1A1A1A] group-hover:text-[#F9F8F6] transition-all">
                        {t.apply}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-[#1A1A1A]/10" />

          {/* Section: Text configuration & brand identity */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
              <Type className="w-3.5 h-3.5" /> {t.identityParameters}
            </h3>

            <div>
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.brandNameLabel}</label>
              <input
                id="brand-name-input"
                type="text"
                value={config.brandName}
                onChange={e => setConfig(prev => ({ ...prev, brandName: e.target.value }))}
                className="w-full bg-white border border-[#1A1A1A]/20 rounded-none px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/70 uppercase tracking-widest font-mono font-medium"
                maxLength={24}
              />
            </div>

            <div>
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.taglineLabel}</label>
              <input
                id="tagline-input"
                type="text"
                value={config.tagline}
                onChange={e => setConfig(prev => ({ ...prev, tagline: e.target.value }))}
                className="w-full bg-white border border-[#1A1A1A]/20 rounded-none px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/70 uppercase tracking-widest font-mono font-medium"
                maxLength={40}
              />
            </div>
          </div>

          <hr className="border-[#1A1A1A]/10" />

          {/* Section: Shape Badge Frame selection */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" /> {t.geometryFrame}
            </h3>

            <div>
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-2">{t.displayComposition}</label>
              <div className="grid grid-cols-5 gap-1 bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10">
                {(['horizontal', 'vertical', 'icon-only', 'text-only', 'badge'] as LayoutType[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setConfig(prev => ({ ...prev, layout: l }))}
                    className={`py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all text-center ${
                      config.layout === l ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                    }`}
                  >
                    {lang === 'zh' && GEOMETRY_TRANSLATIONS[l] ? GEOMETRY_TRANSLATIONS[l] : l.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-2">{t.structuralEmblemBorder}</label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['none', 'circle', 'square', 'shield', 'hexagon'] as BadgeShapeType[]).map(b => (
                  <button
                    key={b}
                    onClick={() => setConfig(prev => ({ ...prev, badgeShape: b }))}
                    className={`py-2 rounded-none text-[9px] font-mono transition-all text-center border uppercase font-bold ${
                      config.badgeShape === b 
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' 
                        : 'border-[#1A1A1A]/15 bg-white text-[#1A1A1A]/50 hover:text-[#1A1A1A]'
                    }`}
                  >
                    {lang === 'zh' && BORDER_TRANSLATIONS[b] ? BORDER_TRANSLATIONS[b] : b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-[#1A1A1A]/10" />

          {/* Section: Brand Color Palette options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" /> {t.inkTonePalette}
              </h3>
              <button
                onClick={() => setConfig(prev => ({ ...prev, contrastMode: !prev.contrastMode }))}
                className="text-[9px] font-mono tracking-wider text-[#1A1A1A] uppercase hover:underline flex items-center gap-1 font-bold"
              >
                {t.invertContrastPlay}
              </button>
            </div>

            <div className="space-y-2">
              {COLOR_PALETTES.map(p => {
                const paletteName = lang === 'zh' && PALETTE_TRANSLATIONS[p.id] ? PALETTE_TRANSLATIONS[p.id] : p.name;
                return (
                  <button
                    key={p.id}
                    onClick={() => setConfig(prev => ({ ...prev, colorPaletteId: p.id }))}
                    className={`w-full p-2.5 rounded-none border transition-all text-left flex items-center justify-between ${
                      config.colorPaletteId === p.id 
                        ? 'border-[#1A1A1A] bg-[#1A1A1A]/5 font-bold' 
                        : 'border-[#1A1A1A]/10 bg-white/40 hover:bg-white/80'
                    }`}
                  >
                    <span className="text-[11px] font-mono text-[#1A1A1A] uppercase tracking-wider">{paletteName}</span>
                    <div className="flex items-center gap-1">
                      <span className="w-3.5 h-3.5 rounded-full border border-[#1A1A1A]/20" style={{ backgroundColor: p.bgHex }} title="Background"></span>
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.primaryHex }} title="Primary"></span>
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.secondaryHex }} title="Secondary"></span>
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.accentHex }} title="Accent"></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-[#1A1A1A]/10" />

          {/* Section: Typography Details & Spacings */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
              <Type className="w-3.5 h-3.5" /> {t.bookTypographySetup}
            </h3>

            <div>
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.selectedEditorialTypeface}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['sans', 'display', 'space', 'serif', 'cinzel', 'mono'] as FontFamilyType[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setConfig(prev => ({ ...prev, fontFamily: f }))}
                    className={`p-2.5 rounded-none text-left border transition-all ${
                      config.fontFamily === f 
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]' 
                        : 'border-[#1A1A1A]/15 bg-white text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:bg-white'
                    }`}
                  >
                    <span className={`text-xs block capitalize ${fontClassMap[f]}`}>
                      {f === 'sans' ? (lang === 'zh' ? 'Inter (简谐)' : 'Inter (Clean)') : f === 'display' ? (lang === 'zh' ? 'Outfit (摩登)' : 'Outfit') : f === 'space' ? (lang === 'zh' ? 'Space Grotesk (前卫)' : 'Space Grotesk') : f === 'serif' ? (lang === 'zh' ? 'Playfair (儒雅衬线)' : 'Playfair') : f === 'cinzel' ? (lang === 'zh' ? 'Cinzel (至臻碑文)' : 'Cinzel (Luxury)') : (lang === 'zh' ? 'JetBrains Mono (科技等宽)' : 'JetBrains Mono')}
                    </span>
                    <span className="text-[9px] opacity-60 font-mono tracking-widest uppercase">{lang === 'zh' ? '选择' : 'Select'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase mb-1.5">{t.microTrackingScale}</label>
              <div className="grid grid-cols-4 gap-1 bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10">
                {(['tight', 'normal', 'wide', 'widest'] as TrackingType[]).map(tText => (
                  <button
                    key={tText}
                    onClick={() => setConfig(prev => ({ ...prev, fontTracking: tText }))}
                    className={`py-1.5 rounded-none text-[9px] uppercase tracking-wider transition-all ${
                      config.fontTracking === tText ? 'bg-[#1A1A1A] text-[#F9F8F6] font-bold' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                    }`}
                  >
                    {lang === 'zh' ? { tight: '紧凑', normal: '标准', wide: '宽阔', widest: '极宽' }[tText] : tText}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] tracking-[0.15em] font-mono text-[#1A1A1A]/60 uppercase">{t.forceCapitalization}</span>
              <button
                onClick={() => setConfig(prev => ({ ...prev, textUppercase: !prev.textUppercase }))}
                className={`w-9 h-5 rounded-none p-0.5 transition-all focus:outline-none ${
                  config.textUppercase ? 'bg-[#1A1A1A]' : 'bg-[#1A1A1A]/20'
                }`}
              >
                <div className={`w-4 h-4 rounded-none bg-white transition-all ${config.textUppercase ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>

          <hr className="border-[#1A1A1A]/10" />

          {/* Section: Symbol Identifier Selection */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> {t.designInsigniaSymbol}
            </h3>

            {/* Symbol Category Filter */}
            <div className="flex flex-wrap gap-1">
              {(['all', 'core', 'tech', 'abstract', 'retail', 'nature'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveSymbolCategory(cat)}
                  className={`px-2.5 py-1 text-[8px] font-mono font-bold tracking-widest rounded-none transition-all border uppercase ${
                    activeSymbolCategory === cat
                      ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]'
                      : 'border-[#1A1A1A]/10 bg-white/40 text-[#1A1A1A]/50 hover:text-[#1A1A1A]'
                  }`}
                >
                  {lang === 'zh' && CATEGORY_TRANSLATIONS[cat] ? CATEGORY_TRANSLATIONS[cat] : cat}
                </button>
              ))}
            </div>

            {/* Grid of clean symbols */}
            <div className="grid grid-cols-6 gap-2">
              {filteredSymbols.map(sym => {
                const IconComponent = iconMap[sym.id] || logoFallbackIcon;
                const symTranslatedName = lang === 'zh' && SYMBOL_TRANSLATIONS[sym.name] ? SYMBOL_TRANSLATIONS[sym.name] : sym.name;
                return (
                  <button
                    key={sym.id}
                    onClick={() => setConfig(prev => ({ ...prev, iconName: sym.id }))}
                    className={`p-2 rounded-none transition-all aspect-square flex flex-col items-center justify-center border ${
                      config.iconName === sym.id
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F9F8F6]'
                        : 'border-[#1A1A1A]/10 bg-white/40 text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-white'
                    }`}
                    title={symTranslatedName}
                  >
                    <IconComponent size={18} strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>

            {/* Slider parameters */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-[9px] tracking-wider text-[#1A1A1A]/60 font-mono uppercase mb-1">
                  <span>{t.symbolHeight} ({config.iconSize}px)</span>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, iconSize: 42 }))}
                    className="text-[9px] text-[#1A1A1A] font-bold hover:underline"
                  >
                    {t.reset}
                  </button>
                </div>
                <input
                  type="range"
                  min="24"
                  max="180"
                  value={config.iconSize}
                  onChange={e => setConfig(prev => ({ ...prev, iconSize: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-[#1A1A1A]/10 rounded-none appearance-none cursor-pointer accent-[#1A1A1A]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[9px] tracking-wider text-[#1A1A1A]/60 font-mono uppercase mb-1">
                  <span>{t.insigniaRotation} ({config.iconRotation}°)</span>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, iconRotation: 0 }))}
                    className="text-[9px] text-[#1A1A1A] font-bold hover:underline"
                  >
                    {t.reset}
                  </button>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={config.iconRotation}
                  onChange={e => setConfig(prev => ({ ...prev, iconRotation: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-[#1A1A1A]/10 rounded-none appearance-none cursor-pointer accent-[#1A1A1A]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[9px] tracking-wider text-[#1A1A1A]/60 font-mono uppercase mb-1">
                  <span>{t.strokePrecision} ({config.iconStrokeWidth.toFixed(1)}x)</span>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, iconStrokeWidth: 1.5 }))}
                    className="text-[9px] text-[#1A1A1A] font-bold hover:underline"
                  >
                    {t.reset}
                  </button>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.5"
                  value={config.iconStrokeWidth}
                  onChange={e => setConfig(prev => ({ ...prev, iconStrokeWidth: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-[#1A1A1A]/10 rounded-none appearance-none cursor-pointer accent-[#1A1A1A]"
                />
              </div>
            </div>
          </div>
        </aside>
        {/* Dynamic Workspace Container */}
        <main className="flex-1 bg-[#F9F8F6] p-8 flex flex-col min-h-0" id="studio-preview-main">
          
          <AnimatePresence mode="wait">
            {activeTab === 'studio' && (
              <motion.div
                key="studio-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 flex flex-col"
              >
                {/* Visual Settings Strip */}
                <div className="flex flex-wrap items-center justify-between border border-[#1A1A1A]/10 bg-white p-4 rounded-none mb-6 gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, gridOverlay: !prev.gridOverlay }))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-none text-[10px] uppercase tracking-widest font-bold transition-all border ${
                        config.gridOverlay
                          ? 'bg-[#1A1A1A] text-[#F9F8F6] border-[#1A1A1A]'
                          : 'border-[#1A1A1A]/15 text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      {config.gridOverlay ? t.gridSystemOn : t.gridSystemHide}
                    </button>

                    <div className="text-[10px] text-[#1A1A1A]/50 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                      <span>{t.toneSet}:</span>
                      <span className="text-[#1A1A1A] font-bold">{lang === 'zh' && PALETTE_TRANSLATIONS[activePalette.id] ? PALETTE_TRANSLATIONS[activePalette.id] : activePalette.name}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-2 bg-transparent hover:bg-[#1A1A1A]/5 text-[10px] uppercase tracking-wider font-mono font-bold px-4 py-2 rounded-none text-[#1A1A1A] border border-[#1A1A1A] transition-all"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {isCopied ? t.copied : t.copyCleanSvg}
                    </button>

                    <button
                      onClick={() => {
                        const blob = new Blob([svgMarkupString], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `${config.brandName.toLowerCase()}-brand-logo.svg`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-[10px] px-4 py-2 rounded-none text-[#F9F8F6] transition-all font-bold uppercase tracking-widest"
                    >
                      <Download className="w-4 h-4" />
                      {t.exportVectorSvg}
                    </button>
                  </div>
                </div>

                {/* Studio Canvas Backdrop */}
                <div 
                  className="flex-1 relative rounded-none border border-[#1A1A1A]/10 overflow-hidden flex items-center justify-center p-8 transition-colors duration-500 shadow-sm"
                  style={{ backgroundColor: paletteBg }}
                  id="branding-master-backdrop"
                >
                  {/* Absolute Center Drafting Guides */}
                  {config.gridOverlay && (
                    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden transition-opacity">
                      {/* Grid overlay */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a05_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a05_1px,transparent_1px)] bg-[size:40px_40px]"></div>
                      {/* Compass Circle guide */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#1A1A1A]/10 w-44 h-44"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#1A1A1A]/15 w-72 h-72"></div>
                      {/* Axis indicators */}
                      <div className="absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed border-[#1A1A1A]/10"></div>
                      <div className="absolute left-1/2 top-0 h-full w-[1px] border-l border-dashed border-[#1A1A1A]/10"></div>
                      
                      {/* Technical specifications overlay details */}
                      <div className="absolute bottom-6 left-6 font-mono text-[9px] text-[#1A1A1A]/70 leading-relaxed max-w-[200px] space-y-1 bg-white p-3.5 rounded-none border border-[#1A1A1A]/10 shadow-sm">
                        <p className="text-[#1A1A1A] font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">{t.specificationsBlock}</p>
                        <p>{t.canvasLabel}</p>
                        <p>{t.symbolLabel}: {config.iconName}</p>
                        <p>{t.dimsLabel}: {config.iconSize} x {config.iconSize} px</p>
                        <p>{t.rotationLabel}: {config.iconRotation}°</p>
                        <p>{t.fontLabel}: {config.fontFamily.toUpperCase()}</p>
                        <p>{t.trackingLabel}: {config.fontTracking.toUpperCase()}</p>
                      </div>
                    </div>
                  )}

                  {/* Logo Composite Block Render */}
                  <div className="text-center z-10 select-none flex flex-col items-center max-w-full">
                    
                    {/* Badge Wrapping / Layout rendering */}
                    {config.layout !== 'text-only' && (
                      <div className="mb-4">
                        {renderBadgeStart(
                          renderIcon(
                            config.contrastMode ? 'text-slate-950' : activePalette.primary
                          )
                        )}
                      </div>
                    )}

                    {/* Branding Titles details */}
                    <div className="flex flex-col items-center">
                      {/* Name string block */}
                      {config.layout !== 'icon-only' && (
                        <h1 
                          className={`
                            ${fontClassMap[config.fontFamily]} 
                            ${trackingClassMap[config.fontTracking]}
                            ${config.textUppercase ? 'uppercase' : ''}
                            transition-all duration-300
                          `}
                          style={{
                            color: paletteTextColor,
                            fontSize: `${Math.max(20, config.iconSize * 0.7)}px`,
                            lineHeight: 1.1
                          }}
                        >
                          {config.brandName || t.placeholderBrand}
                        </h1>
                      )}

                      {/* Tagline string block */}
                      {config.layout !== 'icon-only' && config.layout !== 'text-only' && config.tagline && (
                        <p 
                          className={`
                            ${fontClassMap[config.taglineFontFamily || 'sans']} 
                            ${trackingClassMap[config.taglineTracking || 'widest']}
                            ${config.taglineUppercase ? 'uppercase' : ''}
                            mt-2 opacity-85 transition-all duration-300 text-xs
                          `}
                          style={{
                            color: paletteTaglineColor,
                            fontSize: `${Math.max(8, config.iconSize * 0.22)}px`
                          }}
                        >
                          {config.tagline}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tap: Collateral Mockups in real-world environments */}
            {activeTab === 'collateral' && (
              <motion.div
                key="collateral-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 overflow-y-auto space-y-6 max-h-[80vh]"
                id="collateral-mockups-list"
              >
                
                {/* Mockup 1: Classic Premium Business Card */}
                <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
                  <span className="text-[9px] font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid01}</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Front side card */}
                    <div className="aspect-[1.75/1] rounded-none bg-[#F4F2EE] p-8 border border-[#1A1A1A]/10 flex items-center justify-center relative overflow-hidden shadow-sm">
                      {/* Logo stamp in gold/neutral */}
                      <div className="text-center scale-90 flex flex-col items-center">
                        {renderBadgeStart(renderIcon('text-[#1A1A1A]', 36), 'bg-[#F4F2EE]')}
                        <h3 className={`text-xl ${fontClassMap[config.fontFamily]} ${trackingClassMap[config.fontTracking]} text-[#1A1A1A] mt-2 ${config.textUppercase ? 'uppercase' : ''}`}>
                          {config.brandName || (lang === 'zh' ? '雅致标志' : 'ATELIER')}
                        </h3>
                        {config.tagline && (
                          <p className={`text-[9px] ${fontClassMap[config.taglineFontFamily]} tracking-widest text-[#1A1A1A]/60 mt-1 uppercase`}>
                            {config.tagline}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Back side card */}
                    <div className="aspect-[1.75/1] rounded-none bg-white p-8 border border-[#1A1A1A]/15 flex flex-col justify-between relative overflow-hidden shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-serif font-bold text-[#1A1A1A]">{t.alexanderSterling}</p>
                          <p className="text-[9px] font-mono uppercase tracking-wider text-[#1A1A1A]/50">{t.chiefExecutive}</p>
                        </div>
                        {/* Tiny embedded logo */}
                        <div className="scale-70 -translate-y-2">
                          <Crown className="w-5 h-5 text-[#1A1A1A]" />
                        </div>
                      </div>
                      
                      <div className="space-y-1 text-[9px] font-mono text-[#1A1A1A]/60 border-l border-[#1A1A1A]/35 pl-3">
                        <p>TEL: +1 (555) 0182 920</p>
                        <p>EMAIL: alexander@{config.brandName.toLowerCase().replace(/\s+/g, '') || 'studio'}.com</p>
                        <p>HQ: 480 West End Avenue, New York NY</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mockup 2: Luxury Packaging & Box Brand Emboss */}
                <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
                  <span className="text-[9px] font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid02}</span>
                  <div className="aspect-[16/7] rounded-none bg-[#F4F2EE] p-8 border border-[#1A1A1A]/10 flex items-center justify-center relative overflow-hidden shadow-sm">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.03)_100%)]"></div>
                    
                    {/* The embossed box paper label */}
                    <div className="bg-[#FFFDF9] text-[#1A1A1A] py-10 px-16 rounded-none text-center shadow-md border border-[#1A1A1A]/10 flex flex-col items-center scale-95 md:scale-100 max-w-sm">
                      {/* Logo outline stamped */}
                      <div className="mb-3">
                        <div className="p-2 border border-[#1A1A1A]/15 rounded-full flex items-center justify-center">
                          {renderIcon('text-[#1A1A1A]', 30)}
                        </div>
                      </div>
                      
                      <h4 className={`text-lg font-bold text-[#1A1A1A] tracking-widest uppercase ${fontClassMap[config.fontFamily]}`}>
                        {config.brandName || (lang === 'zh' ? '雅致标志' : 'Atelier')}
                      </h4>
                      <p className="text-[8px] tracking-widest text-[#1A1A1A]/65 uppercase mt-1">
                        {config.tagline || (lang === 'zh' ? '特调原装' : 'Original Roast')}
                      </p>
                      
                      <div className="w-12 h-[1px] bg-[#1A1A1A]/20 my-3"></div>
                      <span className="text-[7px] tracking-widest font-mono text-[#1A1A1A]/40 uppercase font-bold">{t.batchNo}</span>
                    </div>
                  </div>
                </div>

                {/* Mockup 3: Premium App Landing/Hero Splash on Smartphone */}
                <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6">
                  <span className="text-[9px] font-mono font-bold text-[#1A1A1A]/50 uppercase tracking-widest block mb-4">{t.simulationGrid03}</span>
                  <div className="p-6 rounded-none border border-[#1A1A1A]/15" style={{ backgroundColor: paletteBg }}>
                    {/* Simulated website header */}
                    <div className="flex items-center justify-between border-b pb-4 shrink-0" style={{ borderColor: `${palettePrimary}1a` }}>
                      <div className="flex items-center gap-2 scale-90">
                        {/* Dynamic mini logo render */}
                        {renderIcon(palettePrimary, 24)}
                        <span className={`text-sm font-bold ${fontClassMap[config.fontFamily]} ${config.textUppercase ? 'uppercase' : ''}`} style={{ color: paletteTextColor }}>
                          {config.brandName || (lang === 'zh' ? '雅致工坊' : 'Atelier')}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-[11px] font-mono" style={{ color: paletteTaglineColor }}>
                        <span className="hover:opacity-100 cursor-pointer opacity-70">{t.products}</span>
                        <span className="hover:opacity-100 cursor-pointer opacity-70">{t.caseStudies}</span>
                        <span className="hover:opacity-100 cursor-pointer opacity-70">{t.philosophy}</span>
                        <span className="px-3 py-1 bg-[#1A1A1A] text-[#F9F8F6] font-bold transition-all text-[10px] hover:bg-[#1A1A1A]/90">{t.launchEngine}</span>
                      </div>
                    </div>

                    {/* Minimalist Hero Splash Section */}
                    <div className="py-12 text-center max-w-lg mx-auto">
                      <div className="mb-4 inline-flex items-center justify-center p-3 rounded-none bg-black/5">
                        {renderIcon(palettePrimary, 40)}
                      </div>
                      
                      <h5 className="text-xl font-serif font-medium text-[#1A1A1A] tracking-tight leading-normal">
                        {t.poweringSystemPre}<span className="font-serif italic font-bold">{config.brandName || (lang === 'zh' ? '雅致工坊' : 'Atelier')}</span>{t.poweringSystemPost}
                      </h5>
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* Tab: AI Generator and Engineering prompt presets */}
            {activeTab === 'expert' && (
              <motion.div
                key="expert-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 space-y-6"
                id="expert-prompt-assistant"
              >
                {/* Assistant Welcome Panel */}
                <div className="p-6 bg-white border border-[#1A1A1A]/10 rounded-none space-y-4">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-[#1A1A1A]" />
                    <h3 className="text-xs font-mono font-bold tracking-widest uppercase text-[#1A1A1A]">
                      {t.creativeGenerativeGuidance}
                    </h3>
                  </div>
                  <p className="text-xs text-[#1A1A1A]/70 leading-relaxed max-w-3xl">
                    {t.assistantDesc}
                  </p>
                </div>

                {/* Customized Prompt Engine */}
                <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-[#1A1A1A]/50 uppercase tracking-widest">{t.autoFormattedPrompt}</span>
                    <button
                      onClick={() => {
                        const str = `Minimalist vector logo for a professional brand named '${config.brandName}', featuring a clean ${config.iconName} icon. Color scheme uses exquisite contrast with ${activePalette.name} (primary color: ${activePalette.primaryHex}, background: ${activePalette.bgHex}). Highly stylized, modern geometric composition, beautiful whitespace, pristine, flat logo, clean graphic design, 4k.`;
                        navigator.clipboard.writeText(str);
                        alert(t.promptCopied);
                      }}
                      className="text-[9px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A] hover:underline flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> {t.copyPrompt}
                    </button>
                  </div>

                  <div className="p-5 bg-[#F4F2EE] border border-[#1A1A1A]/10 rounded-none">
                    <p className="text-xs text-[#1A1A1A]/80 leading-relaxed font-mono">
                      "Minimalist vector logo for a professional brand named <span className="text-[#1A1A1A] font-bold">'{config.brandName}'</span>, featuring a clean <span className="text-[#1A1A1A] font-bold">{config.iconName}</span> icon. Color scheme uses exquisite contrast with <span className="text-[#1A1A1A] font-bold">{activePalette.name}</span> (primary color: <span className="text-[#1A1A1A]">{activePalette.primaryHex}</span>, secondary: <span className="text-[#1A1A1A]">{activePalette.secondaryHex}</span>, backdrop: <span className="text-[#1A1A1A]">{activePalette.bgHex}</span>). Highly stylized, modern geometric composition, beautiful whitespace, pristine, flat logo, clean graphic design, high resolution."
                    </p>
                  </div>
                </div>

                {/* SVG Code Explorer / Developer Playground */}
                <div className="bg-white border border-[#1A1A1A]/10 rounded-none p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-mono tracking-widest text-[#1A1A1A] uppercase font-bold flex items-center gap-2">
                       <FileText className="w-3.5 h-3.5" /> {t.inlineSourceCode}
                    </h4>
                    <span className="text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-wider">{t.xmlDesc}</span>
                  </div>

                  <div className="bg-[#F4F2EE] border border-[#1A1A1A]/10 rounded-none p-4 overflow-x-auto max-h-56 font-mono text-[11px] text-[#1A1A1A]/80 leading-relaxed">
                    <pre className="text-[10px] text-[#1A1A1A]/80 font-mono whitespace-pre">{svgMarkupString}</pre>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyCode}
                      className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-[10px] uppercase font-mono tracking-widest uppercase text-white font-bold px-4 py-2.5 rounded-none flex items-center gap-2 transition-all"
                    >
                      <Copy className="w-4 h-4" />
                      {isCopied ? t.codeCopied : t.copyToClipboard}
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

          </AnimatePresence>

          {/* Slogan details / Tips */}
          <footer className="mt-auto pt-6 border-t border-[#1A1A1A]/10 text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-widest flex flex-col sm:flex-row items-center justify-between gap-4" id="app-footer">
            <p>{lang === 'zh' ? '© 2026 标识美学设计工作室。原生生成合规、生产级可复用的 SVG 矢量资源。' : '© 2026 Logo Design Studio. Generates valid and production-certified SVG assets.'}</p>
            <div className="flex gap-4">
              <span className="hover:text-[#1A1A1A] cursor-pointer">{t.securitySandbox}</span>
              <span className="hover:text-[#1A1A1A] cursor-pointer">{t.reactNativeCompat}</span>
            </div>
          </footer>
        </main>
      </div>
      ) : (
        <main className="flex-grow flex flex-col justify-between bg-[#F9F8F6] min-h-0">
          <div className="flex-grow flex flex-col min-h-0">
            {activeSpace === 'chat' && <ChatModule lang={lang} />}
            {activeSpace === 'mail' && <div className="px-8 pb-10 pt-0"><MailModule lang={lang} /></div>}
            {activeSpace === 'schedule' && <div className="px-8 pb-10 pt-0"><ScheduleModule lang={lang} defaultView="kanban" /></div>}
            {activeSpace === 'calendar' && <div className="px-8 pb-10 pt-0"><ScheduleModule lang={lang} defaultView="calendar" /></div>}
            {activeSpace === 'finance' && <div className="px-8 pb-10 pt-0"><FinanceModule lang={lang} /></div>}
            {activeSpace === 'password' && <div className="px-8 pb-10 pt-0"><PasswordModule lang={lang} /></div>}
          </div>

          <footer className="mt-auto pt-6 border-t border-[#1A1A1A]/10 text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-widest flex flex-col sm:flex-row items-center justify-between gap-4" id="app-footer-other">
            <p>
              {lang === 'zh' 
                ? '© 2026 雅致全功能套件。高精密、本地沙盒保存、防泄露隔离运行。' 
                : '© 2026 Atelier Suite. Fully integrated, high security standalone offline apps.'}
            </p>
            <div className="flex gap-4">
              <span className="hover:text-[#1A1A1A] cursor-pointer">Security Sandbox: OK</span>
              <span className="hover:text-[#1A1A1A] cursor-pointer">Data Isolated and Encrypted</span>
            </div>
          </footer>
        </main>
      )}
    </div>
  );
}

// Fallback logo icon
function logoFallbackIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 2 2 22 22 22" />
    </svg>
  );
}
