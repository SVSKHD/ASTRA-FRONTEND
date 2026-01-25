"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cloud, Sun, Moon } from "lucide-react";
import { useUser } from "@/context/UserContext";

interface GreetCardProps {
    pageTitle: string;
    caption?: string;
}

export const GreetCard = ({ pageTitle, caption }: GreetCardProps) => {
    const { user } = useUser();
    const [greeting, setGreeting] = useState("");
    const [date, setDate] = useState("");
    const [quote, setQuote] = useState("");

    useEffect(() => {
        const updateTime = () => {
            const hours = new Date().getHours();
            const currentDate = new Date();

            // Set Greeting
            if (hours < 12) setGreeting("Good Morning");
            else if (hours < 18) setGreeting("Good Afternoon");
            else setGreeting("Good Evening");

            // Set Date
            const options: Intl.DateTimeFormatOptions = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            setDate(currentDate.toLocaleDateString('en-US', options));
        };

        updateTime();
        // Update every minute to keep date accurate if app is open for long
        const timer = setInterval(updateTime, 60000);

        // Random inspirational quotes
        const quotes = [
            "Make today amazing.",
            "Focus on the good.",
            "Dream big, work hard.",
            "Stay positive.",
            "Keep pushing forward.",
            "Create your own sunshine."
        ];
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

        return () => clearInterval(timer);
    }, []);

    // Determine Icon based on greeting
    // Determine Icon based on greeting
    const getWeatherIcon = () => {
        if (greeting === "Good Morning") return <Sun className="w-6 h-6 text-yellow-400 inline-block mr-2" />;
        if (greeting === "Good Afternoon") return <Cloud className="w-6 h-6 text-blue-400 inline-block mr-2" />;
        return <Moon className="w-6 h-6 text-indigo-400 inline-block mr-2" />;
    };

    const getIcon = () => {
        if (user?.avatarUrl) {
            return (
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20">
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                </div>
            );
        }
        // Fallback or large icon if no user
        if (greeting === "Good Morning") return <Sun className="w-8 h-8 text-yellow-400" />;
        if (greeting === "Good Afternoon") return <Cloud className="w-8 h-8 text-blue-400" />;
        return <Moon className="w-8 h-8 text-indigo-400" />;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative mb-6 p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 overflow-hidden group hover:bg-white/10 transition-colors"
        >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:from-indigo-500/20 group-hover:to-purple-500/20 transition-colors" />

            <div className="relative z-10 flex flex-col md:flex-row items-center md:items-center justify-between gap-6 md:gap-0">
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 text-center md:text-left">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className={`p-3 bg-white/5 border border-white/5 shadow-inner ${user ? 'rounded-full' : 'rounded-2xl'}`}
                    >
                        <div className="transform scale-150">
                            {getIcon()}
                        </div>
                    </motion.div>

                    <div className="flex flex-col gap-1">
                        <motion.h2
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-2xl font-semibold text-white/80 flex items-center"
                        >
                            {user && getWeatherIcon()}
                            {greeting}{user ? `, ${user.username.split(' ')[0]}` : ''}
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-white/40 text-sm font-medium"
                        >
                            {date} • {quote}
                        </motion.p>
                    </div>
                </div>

                <div className="text-center md:text-right flex flex-col items-center md:items-end gap-1">
                    <motion.h1
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-2xl font-semibold text-white/90"
                    >
                        {pageTitle}
                    </motion.h1>
                    {caption && (
                        <motion.p
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 }}
                            className="text-white/40 text-sm font-medium uppercase tracking-wide"
                        >
                            {caption}
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
