
import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

export const RequestAccessView = () => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 shadow-2xl"
            >
                <Lock className="w-10 h-10 text-white/50" />
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-bold text-white mb-4"
            >
                Access Restricted
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white/50 max-w-md mb-8 leading-relaxed"
            >
                This area is reserved for administrators. If you require access to Forex, Indian markets, or Task management, please contact your system administrator.
            </motion.p>

            <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => window.open('mailto:hitheshsvsk@gmail.com?subject=Astra%20Access%20Request', '_blank')}
                className="px-8 py-3 rounded-xl bg-white text-black font-bold text-sm tracking-wide hover:bg-white/90 transition-colors shadow-lg shadow-white/10"
            >
                Request Access
            </motion.button>
        </div>
    );
};
