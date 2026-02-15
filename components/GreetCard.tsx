"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Cloud, Sun, Moon, MapPin } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { Reminder } from "@/services/remindersService";

interface GreetCardProps {
  pageTitle: string;
  caption?: string;
  activeReminder?: Reminder | null;
}

type Pt = { x: number; y: number };

function getCenterWithin(el: HTMLElement, container: HTMLElement): Pt {
  const r = el.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 };
}

// Single “navigation route” curve (Apple-like bow)
function buildRoute(from: Pt, to: Pt) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = from.x + dx * 0.5;

  const lift = Math.max(
    40,
    Math.min(120, Math.abs(dx) * 0.2 + Math.abs(dy) * 0.15),
  );

  const c1 = { x: midX - dx * 0.15, y: from.y - lift };
  const c2 = { x: midX + dx * 0.15, y: to.y - lift * 0.35 };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

function NavRouteLine({
  containerRef,
  fromRef,
  pinRef,
  enabled,
  color = "#1F8BFF",
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  pinRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  color?: string;
}) {
  const [pts, setPts] = useState<{ from?: Pt; pin?: Pt; w: number; h: number }>(
    { w: 0, h: 0 },
  );

  useLayoutEffect(() => {
    if (!enabled) return;

    const calc = () => {
      const container = containerRef.current;
      const from = fromRef.current;
      const pin = pinRef.current;
      if (!container) return;

      const cr = container.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;

      if (!from || !pin) {
        setPts({ w, h });
        return;
      }

      setPts({
        w,
        h,
        from: getCenterWithin(from, container),
        pin: getCenterWithin(pin, container),
      });
    };

    const to = setTimeout(calc, 100); // Slight delay to ensure layout is stable
    calc();

    const ro = new ResizeObserver(calc);
    if (containerRef.current) ro.observe(containerRef.current);

    window.addEventListener("resize", calc);
    return () => {
      clearTimeout(to);
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [enabled, containerRef, fromRef, pinRef]);

  if (!enabled || !pts.w || !pts.h || !pts.from || !pts.pin) return null;

  const d = buildRoute(pts.from, pts.pin);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none hidden lg:block">
      <svg
        className="w-full h-full"
        width={pts.w}
        height={pts.h}
        preserveAspectRatio="none"
      >
        <defs>
          <filter
            id={`routeGlow-${color}`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Glow underlay */}
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#routeGlow-${color})`}
        />

        {/* Subtle outline */}
        <path
          d={d}
          fill="none"
          stroke="rgba(0,0,0,0.22)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Main route line */}
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Moving “navigation” dashes */}
        <motion.path
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 18"
          animate={{ strokeDashoffset: [0, -220] }}
          transition={{ repeat: Infinity, duration: 5.5, ease: "linear" }}
        />

        {/* Pin pulse ring */}
        <motion.circle
          cx={pts.pin.x}
          cy={pts.pin.y}
          r="26"
          stroke={color}
          strokeOpacity="0.18"
          strokeWidth="2"
          fill="none"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: [0.95, 1.35], opacity: [0.35, 0] }}
          transition={{
            repeat: Infinity,
            duration: 2.8,
            ease: "easeOut",
            delay: 0.4,
          }}
        />
      </svg>
    </div>
  );
}

export const GreetCard = ({
  pageTitle,
  caption,
  activeReminder,
}: GreetCardProps) => {
  const { user } = useUser();
  const [imgError, setImgError] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [date, setDate] = useState("");
  const [quote, setQuote] = useState("");
  const [location, setLocation] = useState<{
    city: string;
    country: string;
  } | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const leftAnchorRef = useRef<HTMLDivElement | null>(null);
  const rightAnchorRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const userDotRef = useRef<HTMLDivElement | null>(null);
  const rightDotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const hours = new Date().getHours();
      const currentDate = new Date();

      if (hours < 12) setGreeting("Good Morning");
      else if (hours < 18) setGreeting("Good Afternoon");
      else setGreeting("Good Evening");

      const options: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      setDate(currentDate.toLocaleDateString("en-US", options));
    };

    updateTime();
    const timer = setInterval(updateTime, 60000);

    const quotes = [
      "Make today amazing.",
      "Focus on the good.",
      "Dream big, work hard.",
      "Stay positive.",
      "Keep pushing forward.",
      "Create your own sunshine.",
    ];
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        if (data.city) {
          setLocation({
            city: data.city,
            country: data.country_name || "",
          });
        }
      })
      .catch((err) => console.error("Failed to fetch location", err));

    return () => clearInterval(timer);
  }, []);

  const getIcon = () => {
    if (user?.avatarUrl && !imgError) {
      return (
        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20">
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }
    if (greeting === "Good Morning")
      return <Sun className="w-8 h-8 text-yellow-400" />;
    if (greeting === "Good Afternoon")
      return <Cloud className="w-8 h-8 text-blue-400" />;
    return <Moon className="w-8 h-8 text-indigo-400" />;
  };

  const showPin = !!location && !activeReminder;

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative mb-6 rounded-3xl overflow-hidden group min-h-[180px] flex items-center"
    >
      {/* Liquid Map Background */}
      <div className="absolute inset-0 bg-[#0a0a0a]/40 backdrop-blur-md border border-white/5 z-0" />

      {/* World Map Dot Pattern (Abstract) */}
      <div
        className="absolute inset-0 opacity-20 z-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Decorative Gradients */}
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-500/10 rounded-full blur-[80px]" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-purple-500/10 rounded-full blur-[80px]" />

      {/* ✅ Left navigation route line: current dot -> pin */}
      <NavRouteLine
        containerRef={cardRef}
        fromRef={userDotRef}
        pinRef={pinRef}
        enabled={showPin}
        color="#1F8BFF"
      />

      {/* ✅ Right navigation route line: right dot -> pin */}
      <NavRouteLine
        containerRef={cardRef}
        fromRef={rightDotRef}
        pinRef={pinRef}
        enabled={showPin}
        color="#A855F7"
      />

      <div className="relative z-10 w-full px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: User & Greeting */}
        <div className="relative">
          {/* "Current location" dot anchor (start of route) */}
          <div
            ref={userDotRef}
            className="absolute -left-3 top-1/2 -translate-y-1/2 hidden lg:block"
            aria-hidden="true"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-500/30 blur-md scale-150" />
              <div className="w-4 h-4 rounded-full bg-[#1F8BFF] border-[3px] border-white shadow-[0_0_18px_rgba(31,139,255,0.45)]" />
            </div>
          </div>

          <div ref={leftAnchorRef} className="flex items-center gap-5">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`p-2 bg-white/5 border border-white/10 shadow-lg backdrop-blur-sm ${
                user ? "rounded-full" : "rounded-2xl"
              }`}
            >
              <div className="transform scale-125">{getIcon()}</div>
            </motion.div>

            <div>
              <motion.h2
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl md:text-2xl font-bold text-white flex items-center gap-2"
              >
                <span className="opacity-90">{greeting}</span>
                {user && (
                  <span className="opacity-60 font-medium">
                    , {user.username.split(" ")[0]}
                  </span>
                )}
              </motion.h2>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-1"
              >
                {activeReminder ? (
                  <span className="flex items-center gap-2 text-sm text-yellow-400 font-medium bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    Reminder: {activeReminder.title}
                  </span>
                ) : (
                  <div className="text-white/40 text-sm font-medium flex items-center gap-3">
                    <span>{date}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="italic opacity-80">"{quote}"</span>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>

        {/* Center: Liquid Location Pin */}
        {showPin && (
          <motion.div
            ref={pinRef}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-2 group/pin"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full animate-pulse" />
              <div className="relative z-10 w-12 h-12 flex items-center justify-center bg-white/5 backdrop-blur-xl border border-white/20 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.3)] group-hover/pin:scale-110 transition-transform duration-300">
                <MapPin
                  className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]"
                  size={20}
                />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-white font-bold text-sm tracking-wide bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm border border-white/5">
                {location!.city}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mt-1">
                {location!.country}
              </span>
            </div>
          </motion.div>
        )}

        {/* Right: Page Title */}
        <div
          ref={rightAnchorRef}
          className="text-right hidden md:block relative"
        >
          {/* "Right location" dot anchor (start of route) */}
          <div
            ref={rightDotRef}
            className="absolute -right-3 top-1/2 -translate-y-1/2 hidden lg:block"
            aria-hidden="true"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-md scale-150" />
              <div className="w-4 h-4 rounded-full bg-[#A855F7] border-[3px] border-white shadow-[0_0_18px_rgba(168,85,247,0.45)]" />
            </div>
          </div>

          <motion.h1
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-bold text-white/90 tracking-tight"
          >
            {pageTitle}
          </motion.h1>

          {caption && (
            <motion.p
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="text-white/30 text-xs font-bold uppercase tracking-[0.2em] mt-1"
            >
              {caption}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
